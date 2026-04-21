import { apiSettingsHeaders } from './api-settings';
import { directGenerateImage } from './direct-ai-client';
import { extractDataUrlBase64, isDataUrl } from './data-url';
import { resolveImageRequest, resolveVideoRequest } from './generation-defaults';
import {
  buildUpstreamImageGenerationBody,
  isOpenAiGptImageModel,
  shouldUseDomesticImageBatching,
} from './image-generation-models';

export type GenerationTaskType = 'image' | 'video';

export const GENERATION_POLLING_CONFIG = {
  intervalMs: 1500,
  statusRequestTimeoutMs: 15_000,
  retryableErrorThreshold: 3,
  staleTimeoutMs: {
    image: 12 * 60 * 1000,
    video: 20 * 60 * 1000,
  },
} as const;

export type GenerationPollResult =
  | {
      status: 'completed';
      resultUrl: string | null;
      resultUrls?: string[];
    }
  | {
      status: 'failed';
      error: string;
    }
  | {
      status: 'retryable-error';
      error: string;
    }
  | {
      status: 'processing';
      progress: number;
    };

export type ImageGenerationRequest = {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  imageSize?: string;
  generateCount?: number;
  referenceImages?: string[];
  referenceImage?: string;
  preferDirect?: boolean;
  forceAsync?: boolean;
};

export type ImageGenerationResponse = {
  taskId?: string | null;
  status?: string;
  imageUrl?: string;
  imageData?: string;
  images?: string[];
  raw?: unknown;
};

export type VideoGenerationRequest = {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  duration?: string;
  generationMode?: 'first-last-frame' | 'omni-reference';
  enhancePrompt?: boolean;
  enableUpsample?: boolean;
  referenceImages?: string[];
  images?: Array<{ image: string; image_type: string }>;
  videos?: string[];
  audios?: string[];
  resolution?: '480p' | '720p' | '1080p';
  generateAudio?: boolean;
  returnLastFrame?: boolean;
  tools?: Array<{ type: string }>;
};

export type VideoGenerationResponse = {
  taskId?: string | null;
  status?: string;
  videoUrl?: string;
};

export type UploadedReferenceFile = {
  reference: string;
  filename: string;
  mimeType?: string;
  bytes?: number;
};

export type AiChatRequest = {
  messages: unknown[];
  model?: string;
  stream?: boolean;
  skipSystemMessage?: boolean;
};

export type StoryboardPlanMode = 'shot' | 'story';

export type StoryboardPlanShot = {
  index: number;
  shotCode: string;
  sceneType: string;
  cameraMove: string;
  duration: string;
  note: string;
  promptZh: string;
  referenceImageIndexes: number[];
};

export type StoryboardPlanRequest = {
  mode: StoryboardPlanMode;
  shotCount: number;
  referenceImages?: string[];
  sceneDescription?: string;
  storyContext?: string;
  model?: string;
};

export type StoryboardPlanResponse = {
  title: string;
  summary: string;
  mode: StoryboardPlanMode;
  shotCount: number;
  shots: StoryboardPlanShot[];
  raw?: unknown;
};

export async function requestImageGeneration(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  // Resolve defaults once via the settings adapter — ai-client does not read settings itself
  const resolved = resolveImageRequest(request);
  const forceAsyncForModel = isOpenAiGptImageModel(resolved.model);
  let forceAsyncForProxy = resolved.forceAsync === true || forceAsyncForModel;
  const requestBody: Record<string, unknown> = {
    prompt: resolved.prompt,
    model: resolved.model,
    aspectRatio: resolved.aspectRatio,
    imageSize: resolved.imageSize,
    generateCount: resolved.generateCount,
    referenceImages: resolved.referenceImages,
    referenceImage: resolved.referenceImage,
    forceAsync: forceAsyncForProxy,
  };

  if (resolved.preferDirect !== false && resolved.forceAsync !== true && !forceAsyncForModel) {
    const directRequestBody = buildDirectImageRequest(resolved);
    const directResult = await directGenerateImage(directRequestBody);
    if (directResult !== null) {
      return directResult as ImageGenerationResponse;
    }

    // When browser direct transport is unavailable, switch the server proxy to
    // async submission so large or slow image generations do not hang until the
    // upstream sync timeout elapses.
    forceAsyncForProxy = true;
    requestBody.forceAsync = true;
  }

  const response = await requestJsonResponse('/api/generate-image', requestBody);
  return await readJsonResponse<ImageGenerationResponse>(response, '图片生成请求失败');
}

export async function requestVideoGeneration(
  request: VideoGenerationRequest,
): Promise<VideoGenerationResponse> {
  // Resolve defaults once via the settings adapter
  const resolved = resolveVideoRequest(request);
  const response = await requestJsonResponse('/api/generate-video', {
    ...resolved,
  });
  return await readJsonResponse<VideoGenerationResponse>(response, '视频生成请求失败');
}

export async function uploadReferenceFile(file: File): Promise<UploadedReferenceFile> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch('/api/upload-ai-file', {
    method: 'POST',
    headers: { ...apiSettingsHeaders() },
    body: formData,
  });

  return await readJsonResponse<UploadedReferenceFile>(response, '上传参考素材失败');
}

export async function requestAiChat(
  request: AiChatRequest,
  options: { signal?: AbortSignal } = {},
): Promise<Response> {
  return requestJsonResponse('/api/ai-chat', request, options);
}

export async function requestStoryboardPlan(
  request: StoryboardPlanRequest,
): Promise<StoryboardPlanResponse> {
  const response = await requestJsonResponse('/api/storyboard-plan', request);
  return await readJsonResponse<StoryboardPlanResponse>(response, '分镜规划请求失败');
}

export async function pollGenerationTask(
  taskId: string,
  taskType: GenerationTaskType,
): Promise<GenerationPollResult> {
  const apiPath = taskType === 'image'
    ? `/api/image-status?taskId=${encodeURIComponent(taskId)}`
    : `/api/video-status?taskId=${encodeURIComponent(taskId)}`;

  const response = await fetch(apiPath, {
    headers: { ...apiSettingsHeaders() },
    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(GENERATION_POLLING_CONFIG.statusRequestTimeoutMs)
      : undefined,
  });
  const data = await parseResponseJson(response);
  const taskLabel = taskType === 'image' ? '图片' : '视频';

  if (!response.ok) {
    return {
      status: 'retryable-error',
      error: getStringValue(data.details)
        ?? getStringValue(data.error)
        ?? `${taskLabel}状态查询失败 (${response.status})`,
    };
  }

  const status = getStringValue(data.status);

  if (status === 'completed') {
    const resultUrls = taskType === 'image' && Array.isArray(data.images)
      ? data.images.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined;
    const resultUrl = taskType === 'image'
      ? getStringValue(data.imageUrl) ?? getStringValue(data.imageData) ?? resultUrls?.[0] ?? null
      : getStringValue(data.videoUrl);

    return {
      status: 'completed',
      resultUrl,
      resultUrls,
    };
  }

  if (status === 'failed') {
    return {
      status: 'failed',
      error: getStringValue(data.details) ?? getStringValue(data.error) ?? '生成失败',
    };
  }

  if (status && !['processing', 'pending', 'queued', 'running', 'submitted', 'in_progress'].includes(status)) {
    return {
      status: 'failed',
      error: `${taskLabel}状态响应异常，请重试`,
    };
  }

  return {
    status: 'processing',
    progress: getNumberValue(data.progress),
  };
}

export async function waitForGenerationTask(
  taskId: string,
  taskType: GenerationTaskType,
  options: {
    intervalMs?: number;
    maxAttempts?: number;
    retryableErrorThreshold?: number;
    onProgress?: (progress: number) => void;
  } = {},
): Promise<GenerationPollResult> {
  const strategy = getGenerationPollingStrategy(taskType, options);
  const {
    intervalMs,
    maxAttempts,
    retryableErrorThreshold,
    onProgress,
  } = strategy;
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await delay(intervalMs);
    const result = await pollGenerationTask(taskId, taskType);

    if (result.status === 'processing') {
      consecutiveErrors = 0;
      onProgress?.(result.progress);
      continue;
    }

    if (result.status === 'retryable-error') {
      consecutiveErrors += 1;
      if (consecutiveErrors >= retryableErrorThreshold) {
        return {
          status: 'failed',
          error: result.error,
        };
      }
      continue;
    }

    return result;
  }

  return {
    status: 'failed',
    error: `${taskType === 'image' ? '图片' : '视频'}生成超时，请重试`,
  };
}

export function getGenerationPollingStrategy(
  taskType: GenerationTaskType,
  options: {
    intervalMs?: number;
    maxAttempts?: number;
    retryableErrorThreshold?: number;
    onProgress?: (progress: number) => void;
  } = {},
) {
  const intervalMs = options.intervalMs ?? GENERATION_POLLING_CONFIG.intervalMs;
  const staleTimeoutMs = GENERATION_POLLING_CONFIG.staleTimeoutMs[taskType];

  return {
    intervalMs,
    maxAttempts: options.maxAttempts ?? Math.max(1, Math.ceil(staleTimeoutMs / intervalMs)),
    retryableErrorThreshold: options.retryableErrorThreshold ?? GENERATION_POLLING_CONFIG.retryableErrorThreshold,
    staleTimeoutMs,
    onProgress: options.onProgress,
  };
}

async function requestJsonResponse(
  path: string,
  body: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
): Promise<Response> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...apiSettingsHeaders(),
      },
      body: JSON.stringify(removeUndefinedValues(body)),
      signal: options.signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new Error(
      `fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function readJsonResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const data = await parseResponseJson(response);

  if (!response.ok) {
    throw new Error(
      getStringValue(data.details)
        ?? getStringValue(data.error)
        ?? `${fallbackMessage} (${response.status})`,
    );
  }

  return data as T;
}

async function parseResponseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

function buildDirectImageRequest(request: ImageGenerationRequest): Record<string, unknown> {
  // Expects a pre-resolved request — no defaults applied here
  const referenceImages = request.referenceImages
    ?? (request.referenceImage ? [request.referenceImage] : []);
  const normalizedReferenceImages = referenceImages.map((image) =>
    isDataUrl(image) ? extractDataUrlBase64(image) : image,
  );

  return buildUpstreamImageGenerationBody({
    model: request.model || '',
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    imageSize: request.imageSize,
    generateCount: request.generateCount,
    referenceImages: normalizedReferenceImages,
    responseFormat: 'url',
  });
}

export { shouldUseDomesticImageBatching };

function removeUndefinedValues(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function getStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getNumberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
