import { NextRequest, NextResponse } from 'next/server';
import { extractDataUrlBase64, isDataUrl, parseDataUrl } from '@/lib/data-url';
import { fetchRemoteAsset, RemoteFetchError } from '../_shared/cdn-cache';
import {
  ApiRouteError,
  createAiHeaders,
  createUpstreamConnectionError,
  fetchWithRetry,
  getApiErrorMessage,
  getErrorMessage,
  handleApiRouteError,
  parseJsonResponse,
  resolveAiServiceConfig,
} from '../_shared/ai-service';

type StoryboardPlanMode = 'shot' | 'story';

type StoryboardPlanShot = {
  index: number;
  shotCode: string;
  sceneType: string;
  cameraMove: string;
  duration: string;
  note: string;
  promptZh: string;
  referenceImageIndexes: number[];
};

type StoryboardPlanResponse = {
  title: string;
  summary: string;
  mode: StoryboardPlanMode;
  shotCount: number;
  shots: StoryboardPlanShot[];
  raw?: unknown;
};

const MAX_REFERENCE_IMAGE_COUNT = 9;
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_SHOT_COUNT = 24;
const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
const UNSUPPORTED_STORYBOARD_MODEL_KEYWORDS = ['image-preview', 'banana'];

export async function POST(request: NextRequest) {
  try {
    const {
      mode,
      shotCount,
      referenceImages,
      sceneDescription,
      storyContext,
      model,
    } = await request.json();

    const normalizedMode = mode === 'story' ? 'story' : 'shot';
    const normalizedShotCount = clampShotCount(shotCount);
    const normalizedSceneDescription = typeof sceneDescription === 'string' ? sceneDescription.trim() : '';
    const normalizedStoryContext = typeof storyContext === 'string' ? storyContext.trim() : '';
    const imageList = Array.isArray(referenceImages) ? referenceImages.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];

    if (imageList.length === 0 && !normalizedSceneDescription && !normalizedStoryContext) {
      return NextResponse.json({ error: '请至少提供参考图或场景说明' }, { status: 400 });
    }

    if (imageList.length > MAX_REFERENCE_IMAGE_COUNT) {
      return NextResponse.json({ error: `参考图数量不能超过 ${MAX_REFERENCE_IMAGE_COUNT} 张` }, { status: 400 });
    }

    const { apiKey, baseUrl } = resolveAiServiceConfig(request);
    const selectedModel = resolveStoryboardModel(model);
    const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [];

    const normalizedReferences: Array<{ label: string; dataUrl: string }> = [];
    for (let index = 0; index < imageList.length; index += 1) {
      const normalized = await normalizeReferenceImage(imageList[index], index);
      normalizedReferences.push(normalized);
      content.push({
        type: 'image_url',
        image_url: { url: normalized.dataUrl },
      });
    }

    content.push({
      type: 'text',
      text: buildStoryboardPlanPrompt({
        mode: normalizedMode,
        shotCount: normalizedShotCount,
        sceneDescription: normalizedSceneDescription,
        storyContext: normalizedStoryContext,
        referenceCount: normalizedReferences.length,
      }),
    });

    const upstreamRequestBody: Record<string, unknown> = {
      model: selectedModel,
      temperature: 0.4,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是资深影视分镜师和故事板规划师。你必须严格返回 JSON 对象，不要输出任何解释性文本。',
        },
        {
          role: 'user',
          content,
        },
      ],
    };

    const targetUrl = `${baseUrl}/v1/chat/completions`;
    let response: Response;

    try {
      response = await fetchWithRetry(
        targetUrl,
        {
          method: 'POST',
          headers: createAiHeaders(apiKey, true),
          body: JSON.stringify(upstreamRequestBody),
        },
        { label: 'storyboard-plan' },
      );
    } catch (error: unknown) {
      throw createUpstreamConnectionError(baseUrl, error);
    }

    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};

    if (!response.ok) {
      throw new Error(getApiErrorMessage(data, JSON.stringify(data)));
    }

    const rawContent = extractAssistantText(data);
    const parsedPayload = parseStoryboardJson(rawContent);
    const normalizedPlan = normalizeStoryboardPlan(parsedPayload, {
      mode: normalizedMode,
      shotCount: normalizedShotCount,
      referenceCount: normalizedReferences.length,
    });

    return NextResponse.json({
      ...normalizedPlan,
      raw: data,
    } satisfies StoryboardPlanResponse);
  } catch (error: unknown) {
    return handleApiRouteError(error, '分镜规划失败', 'storyboard-plan');
  }
}

async function normalizeReferenceImage(value: string, index: number) {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const { buffer, contentType } = await fetchRemoteAsset(value, {
        timeoutMs: 20_000,
        maxBytes: MAX_REFERENCE_IMAGE_BYTES,
        allowedContentTypePrefixes: ['image/'],
      });

      return {
        label: `参考图${index + 1}`,
        dataUrl: `data:${contentType || 'image/png'};base64,${buffer.toString('base64')}`,
      };
    } catch (error: unknown) {
      throw new ApiRouteError(
        '参考图下载失败',
        error instanceof RemoteFetchError ? error.status : 400,
        getErrorMessage(error),
      );
    }
  }

  if (isDataUrl(value)) {
    const parsed = parseDataUrl(value);
    const base64 = extractDataUrlBase64(value);
    if (estimateBase64Bytes(base64) > MAX_REFERENCE_IMAGE_BYTES) {
      throw new ApiRouteError(`单张参考图不能超过 ${(MAX_REFERENCE_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB`, 413);
    }
    return {
      label: `参考图${index + 1}`,
      dataUrl: `data:${parsed.mime || 'image/png'};base64,${base64}`,
    };
  }

  if (estimateBase64Bytes(value) > MAX_REFERENCE_IMAGE_BYTES) {
    throw new ApiRouteError(`单张参考图不能超过 ${(MAX_REFERENCE_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB`, 413);
  }

  return {
    label: `参考图${index + 1}`,
    dataUrl: `data:image/png;base64,${value}`,
  };
}

function buildStoryboardPlanPrompt(params: {
  mode: StoryboardPlanMode;
  shotCount: number;
  sceneDescription: string;
  storyContext: string;
  referenceCount: number;
}) {
  const modeLabel = params.mode === 'story' ? '故事模式' : '分镜模式';

  return [
    `请基于${params.referenceCount > 0 ? `提供的 ${params.referenceCount} 张参考图` : '给定的文字描述'}生成 ${params.shotCount} 个${modeLabel}结果。`,
    params.mode === 'story'
      ? '故事模式要求镜头之间有明显的时间推进、因果关系和情绪节奏变化。'
      : '分镜模式要求围绕同一主体或场景，从不同景别和角度拆出镜头。',
    params.sceneDescription ? `场景补充说明：${params.sceneDescription}` : '场景补充说明：无',
    params.storyContext ? `故事设定：${params.storyContext}` : '故事设定：无',
    '请严格输出一个 JSON 对象，结构如下：',
    '{',
    '  "title": "分镜方案标题",',
    '  "summary": "一句话总结整体风格与叙事",',
    '  "mode": "shot 或 story",',
    '  "shotCount": 数字,',
    '  "shots": [',
    '    {',
    '      "index": 1,',
    '      "shotCode": "A01",',
    '      "sceneType": "远景/中景/特写等简洁描述",',
    '      "cameraMove": "推镜/摇镜/静止/跟拍等",',
    '      "duration": "5s",',
    '      "note": "中文镜头说明与调度要点",',
    '      "promptZh": "中文出图提示词",',
    '      "referenceImageIndexes": [1, 2]',
    '    }',
    '  ]',
    '}',
    '规则：',
    '1. shotCount 必须等于要求数量。',
    '2. referenceImageIndexes 使用 1 开始的序号；如果没有参考图则返回空数组。',
    '3. promptZh 必须可直接用于图像生成。',
    '4. duration 统一使用如 3s、5s、8s 这种格式。',
    '5. 不要输出 JSON 之外的任何内容。',
  ].join('\n');
}

function extractAssistantText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object') {
    throw new Error('AI 响应缺少 choices');
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== 'object') {
    throw new Error('AI 响应缺少 message');
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        const typedItem = item as { type?: string; text?: string };
        return typedItem.type === 'text' && typeof typedItem.text === 'string' ? typedItem.text : '';
      })
      .join('\n');
  }

  throw new Error('AI 响应内容为空');
}

function parseStoryboardJson(rawContent: string) {
  const trimmed = rawContent
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const jsonCandidate = trimmed.startsWith('{')
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0] || '';

  if (!jsonCandidate) {
    throw new Error('AI 未返回有效的 JSON 结构');
  }

  try {
    return JSON.parse(jsonCandidate) as Record<string, unknown>;
  } catch {
    throw new Error('AI 返回的 JSON 无法解析');
  }
}

function resolveStoryboardModel(model: unknown) {
  const requestedModel = typeof model === 'string' ? model.trim() : '';
  if (!requestedModel) {
    return DEFAULT_MODEL;
  }

  const loweredModel = requestedModel.toLowerCase();
  if (UNSUPPORTED_STORYBOARD_MODEL_KEYWORDS.some((keyword) => loweredModel.includes(keyword))) {
    return DEFAULT_MODEL;
  }

  return requestedModel;
}

function normalizeStoryboardPlan(
  payload: Record<string, unknown>,
  fallback: { mode: StoryboardPlanMode; shotCount: number; referenceCount: number },
): StoryboardPlanResponse {
  const shots = Array.isArray(payload.shots) ? payload.shots : [];
  const normalizedShots: StoryboardPlanShot[] = shots.slice(0, fallback.shotCount).map((shot, index) => {
    const record = shot && typeof shot === 'object' ? shot as Record<string, unknown> : {};
    const shotCode = toNonEmptyString(record.shotCode) || buildShotCode(index);
    const promptZh = toNonEmptyString(record.promptZh) || toNonEmptyString(record.note) || `${shotCode} 中文提示词待补充`;
    const referenceImageIndexes = Array.isArray(record.referenceImageIndexes)
      ? record.referenceImageIndexes
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item >= 1 && item <= Math.max(1, fallback.referenceCount))
      : [];

    return {
      index: index + 1,
      shotCode,
      sceneType: toNonEmptyString(record.sceneType) || '中景',
      cameraMove: toNonEmptyString(record.cameraMove) || '静止',
      duration: normalizeDuration(toNonEmptyString(record.duration) || '5s'),
      note: toNonEmptyString(record.note) || `${shotCode} 镜头说明待补充`,
      promptZh,
      referenceImageIndexes,
    };
  });

  while (normalizedShots.length < fallback.shotCount) {
    const index = normalizedShots.length;
    const shotCode = buildShotCode(index);
    normalizedShots.push({
      index: index + 1,
      shotCode,
      sceneType: '中景',
      cameraMove: '静止',
      duration: '5s',
      note: `${shotCode} 镜头说明待补充`,
      promptZh: `${shotCode} 中文提示词待补充`,
      referenceImageIndexes: [],
    });
  }

  return {
    title: toNonEmptyString(payload.title) || `${fallback.mode === 'story' ? '故事' : '分镜'}规划 ${fallback.shotCount} 镜头`,
    summary: toNonEmptyString(payload.summary) || '整体风格与镜头节奏待补充',
    mode: payload.mode === 'story' ? 'story' : fallback.mode,
    shotCount: fallback.shotCount,
    shots: normalizedShots,
  };
}

function buildShotCode(index: number) {
  return `A${String(index + 1).padStart(2, '0')}`;
}

function clampShotCount(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 9;
  return Math.max(1, Math.min(MAX_SHOT_COUNT, Math.round(numeric)));
}

function normalizeDuration(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*s/i);
  if (match) {
    return `${match[1]}s`;
  }
  return '5s';
}

function toNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function estimateBase64Bytes(value: string): number {
  const normalized = value.trim();
  if (!normalized) return 0;

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}