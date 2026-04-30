"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Camera, ChevronDown, Clapperboard, Film, Loader2, RotateCcw, X } from 'lucide-react';
import {
  requestStoryboardPlan,
  type StoryboardPlanMode,
  type StoryboardPlanResponse,
  type StoryboardPlanShot,
} from '@/lib/ai-client';
import { isDataUrl } from '@/lib/data-url';
import { isImageRef, getImageDataUrl } from '@/lib/editor-kernel';
import { useImageGenerationDefaults, type ImageGenerationDefaults } from '@/lib/generation-defaults';
import {
  describeOpenAiGptImageAspectRatio,
  getOpenAiGptImagePixelSizeValidationError,
  isOpenAiGptImagePixelSize,
  OPENAI_GPT_IMAGE_QUALITY_OPTIONS,
  OPENAI_GPT_IMAGE_SIZE_OPTIONS,
  STANDARD_IMAGE_SIZE_OPTIONS,
  isStandardImageSize,
  normalizeOpenAiGptImagePixelSize,
  resolveOpenAiGptImageAspectRatio,
  resolveOpenAiGptImageQuality,
  resolveOpenAiGptImageSize,
} from '@/lib/image-generation-models';
import {
  createGenerationIdlePatch,
  createGenerationTaskPatch,
} from '@/lib/generation-task-state';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import { compressReferenceImageDataUrl } from '@/lib/reference-image-processing';
import type { CanvasElement } from './canvas-types';
import {
  STORYBOARD_PLANNER_SAVE_DEBOUNCE_MS,
  getStoryboardPlannerStorageKey,
  loadStoryboardPlannerState,
  loadStoryboardPlannerStateWithLegacyMigration,
  patchStoryboardPlannerState,
  removeStoryboardPlannerState,
  saveStoryboardPlannerState,
  type PersistedStoryboardPlannerState,
  type StoryboardPlannerSourceImage as SourceImage,
} from './storyboard-planner-storage';
import { runImageGenerationFlow, waitForImageGenerationResult } from './image-generation-flow';
import { useCanvasImageSelectionEvent } from './generator-panel-shared';
import { StoryboardPlannerFooter } from './StoryboardPlannerFooter';
import { StoryboardPlannerSourcePicker } from './StoryboardPlannerSourcePicker';
import { StoryboardPlannerResultPanel } from './StoryboardPlannerResultPanel';

type PlannerCanvasImage = {
  id: string;
  content: string;
  displayName?: string;
};

type FinalGenerationState = {
  status: 'idle' | 'rendering' | 'done' | 'error';
  progress: number;
  imageUrl: string | null;
  error: string | null;
};

type PlannerLiveGenerationParams = {
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  imageSize?: string;
  quality?: string;
};

type AspectRatioOption = 'auto' | ImageGenerationDefaults['aspectRatio'];

const GROK_ASPECT_RATIO_OPTIONS: AspectRatioOption[] = ['auto', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:1'];
const STORYBOARD_ASPECT_RATIO_OPTIONS: AspectRatioOption[] = ['auto', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:1', '4:5', '5:4', '21:9'];
const STORYBOARD_MODEL_OPTIONS: ImageGenerationDefaults['model'][] = ['gemini-3.1-flash-image-preview', 'nano-banana-2', 'gpt-image-2', 'grok-4.2-image', 'doubao-seedream-5-0-260128'];

interface StoryboardPlannerPanelProps {
  elementId: string;
  style?: CSSProperties;
  selectedModel: string;
  canvasImages: PlannerCanvasImage[];
  selectedCanvasImageIds?: string[];
  projectReferenceImages?: ProjectReferenceImageItem[];
  onUseProjectReferenceImage?: (id: string) => void;
  onRequestCanvasSelect?: () => void;
  onClose: () => void;
  onCreateDraft: (plan: StoryboardPlanResponse, referenceImages: string[], generatedStoryboardImage?: string | null, combinedPrompt?: string) => void;
  onElementChange?: (id: string, newAttrs: Partial<CanvasElement>) => void;
  onSubmittingChange?: (elementId: string, submitting: boolean, liveParams?: PlannerLiveGenerationParams) => void;
}

const SHOT_COUNT_OPTIONS = [4, 6, 9, 12, 16] as const;

const MAX_SOURCE_IMAGES = 5;

function getChineseCombinedPrompt(state: Partial<PersistedStoryboardPlannerState>) {
  const zhPrompt = state.bilingualPrompt?.zh?.trim();
  if (zhPrompt) {
    return state.bilingualPrompt?.zh || '';
  }

  if (state.promptLang !== 'en' && state.combinedPrompt?.trim()) {
    return state.combinedPrompt;
  }

  if (state.result) {
    return buildCombinedStoryboardPrompt(state.result);
  }

  return state.combinedPrompt || '';
}

function getStoryboardGridColumns(shotCount: number) {
  if (shotCount === 4) return 2;
  if (shotCount === 6) return 3;
  if (shotCount === 9) return 3;
  if (shotCount === 12) return 4;
  if (shotCount === 16) return 4;
  return shotCount <= 8 ? 3 : 4;
}

function getStoryboardCollageAspectRatio(shotCount: number): ImageGenerationDefaults['aspectRatio'] {
  const columns = getStoryboardGridColumns(shotCount);
  const rows = Math.ceil(shotCount / columns);

  if (columns === rows) return '1:1';
  if (columns === 3 && rows === 2) return '3:2';
  if (columns === 2 && rows === 3) return '2:3';
  if (columns === 4 && rows === 3) return '4:3';
  if (columns === 3 && rows === 4) return '3:4';
  return columns > rows ? '4:3' : '3:4';
}

/**
 * 提取各镜头间的共同风格/描述词，避免在每个镜头行中重复。
 * 例如所有镜头都含 "复古漫画风格"，则将其提取为统一风格行。
 */
function deduplicateShotPrompts(
  shots: StoryboardPlanShot[],
): { commonStyle: string; perShotPrompts: string[] } {
  const separator = '，';
  const splitRe = /[，,、]/;

  const prompts = shots.map((shot) => shot.promptZh?.trim() || shot.note.trim());

  if (shots.length < 2) return { commonStyle: '', perShotPrompts: prompts };

  const allSegments = prompts.map((p) =>
    p.split(splitRe).map((s: string) => s.trim()).filter(Boolean),
  );

  // 找出每个镜头都包含的片段
  const commonSegments = allSegments[0].filter((seg: string) =>
    allSegments.every((segs: string[]) => segs.includes(seg)),
  );

  if (commonSegments.length === 0) return { commonStyle: '', perShotPrompts: prompts };

  const perShotPrompts = allSegments.map((segs: string[]) =>
    segs.filter((s: string) => !commonSegments.includes(s)).join(separator),
  );

  return { commonStyle: commonSegments.join(separator), perShotPrompts };
}

function buildCombinedStoryboardPrompt(plan: StoryboardPlanResponse): string {
  const columns = getStoryboardGridColumns(plan.shotCount || plan.shots.length || 1);
  const rows = Math.ceil((plan.shotCount || plan.shots.length || 1) / columns);
  const total = plan.shots.length;

  // ── 提取各镜头间的共同风格，避免重复描述 ──
  const zhDedup = deduplicateShotPrompts(plan.shots);

  // ── 中文 ──
  const zhPanelLines = plan.shots.map((shot, index) => {
    const prompt = zhDedup.perShotPrompts[index];
    return `${shot.shotCode}：${prompt}`;
  });
  const zh = plan.mode === 'story'
    ? [
        `根据参考图，生成一张具有凝聚力的 [${rows}x${columns}] 网格图像，展示一个完整故事的[${total}]个连续关键画面，画面避免出现任何文字和台词，严格保持角色外观、服装和画风的一致性。`,
        plan.summary ? `故事概要：${plan.summary}` : '',
        zhDedup.commonStyle ? `统一风格：${zhDedup.commonStyle}` : '',
        '【故事画面】',
        ...zhPanelLines,
      ].filter(Boolean).join('\n')
    : [
        `根据参考图，生成一张具有凝聚力的 [${rows}x${columns}] 网格图像，包含在同一环境中的[${total}]个不同摄像机镜头，镜头画面避免出现任何文字和台词，严格保持人物/物体、服装和光线的一致性。`,
        plan.summary ? `分镜概要：${plan.summary}` : '',
        zhDedup.commonStyle ? `统一风格：${zhDedup.commonStyle}` : '',
        '',
        ...zhPanelLines,
      ].filter(Boolean).join('\n');

  return zh;
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function compressStoryboardReferenceDataUrl(dataUrl: string): Promise<string> {
  return await compressReferenceImageDataUrl(dataUrl);
}

/** Grid layout description for each shot count option */
const SHOT_COUNT_GRID_LABELS: Record<number, string> = {
  4: '2×2',
  6: '3×2',
  9: '3×3',
  12: '4×3',
  16: '4×4',
};

function SectionLabel({ children, step }: { children: React.ReactNode; step?: number }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      {step != null && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold leading-none text-white">
          {step}
        </span>
      )}
      <span className="text-[11px] font-semibold text-slate-600">{children}</span>
    </div>
  );
}



export function StoryboardPlannerPanel({
  elementId,
  style,
  selectedModel,
  canvasImages,
  selectedCanvasImageIds = [],
  onRequestCanvasSelect,
  onClose,
  onCreateDraft,
  onElementChange,
  onSubmittingChange,
}: StoryboardPlannerPanelProps) {
  const selectedCanvasImage = useMemo(
    () => canvasImages.find((image) => selectedCanvasImageIds.includes(image.id)) ?? null,
    [canvasImages, selectedCanvasImageIds],
  );

  // ── 按元素隔离的持久化 key ──
  const storageKey = useMemo(() => getStoryboardPlannerStorageKey(elementId), [elementId]);

  // ── 从 localStorage 恢复持久化状态（含旧全局 key 一次性迁移） ──
  const persisted = useMemo(() => loadStoryboardPlannerStateWithLegacyMigration(storageKey), [storageKey]);

  const [mode, setMode] = useState<StoryboardPlanMode>(persisted.mode || 'shot');
  const [shotCount, setShotCount] = useState<number>(persisted.shotCount || 9);
  const [sceneDescription, setSceneDescription] = useState(persisted.sceneDescription || '');
  const [storyContext, setStoryContext] = useState(persisted.storyContext || '');

  // 优先使用持久化的图片（如果画布中还存在），再 fallback 到当前选中
  const initialSources = useMemo((): SourceImage[] => {
    const out: SourceImage[] = [];
    if (persisted.sourceImages?.length) {
      for (const img of persisted.sourceImages) {
        const inCanvas = canvasImages.find((c) => c.content === img.content);
        if (inCanvas) out.push({ content: img.content, label: img.label || inCanvas.displayName || '恢复的图片' });
        else if (isImageRef(img.content)) out.push(img);
      }
    }
    // 兼容旧版单图持久化字段
    if (out.length === 0) {
      const legacy = persisted as Record<string, unknown>;
      if (typeof legacy.sourceImageContent === 'string') {
        const c = legacy.sourceImageContent;
        const l = (typeof legacy.sourceLabel === 'string' ? legacy.sourceLabel : '') || '恢复的图片';
        if (canvasImages.find((img) => img.content === c) || isImageRef(c)) out.push({ content: c, label: l });
      }
    }
    if (out.length === 0 && selectedCanvasImage?.content) {
      out.push({ content: selectedCanvasImage.content, label: selectedCanvasImage.displayName || '当前图片' });
    }
    return out;
  }, [persisted, canvasImages, selectedCanvasImage]);

  const [sourceImages, setSourceImages] = useState<SourceImage[]>(initialSources);
  const [result, setResult] = useState<StoryboardPlanResponse | null>(persisted.result || null);
  const [generationState, setGenerationState] = useState<FinalGenerationState>(() => {
    if (persisted.generationImageUrl) return { status: 'done', progress: 100, imageUrl: persisted.generationImageUrl, error: null };
    return { status: 'idle', progress: 0, imageUrl: null, error: null };
  });
  const [combinedPrompt, setCombinedPrompt] = useState(() => getChineseCombinedPrompt(persisted));
  const imageDefaults = useImageGenerationDefaults();

  // ── 用户可选的生成参数（对齐图片生成器） ──
  const imageSizeOptions: ImageGenerationDefaults['imageSize'][] = [...STANDARD_IMAGE_SIZE_OPTIONS];
  const hasPersistedAspectRatioOverride = persisted.userAspectRatioOverride === true
    || (typeof persisted.userAspectRatio === 'string' && persisted.userAspectRatio !== 'auto');

  const [userModelOverride, setUserModelOverride] = useState(persisted.userModelOverride === true);
  const [userModel, setUserModel] = useState<ImageGenerationDefaults['model']>(
    persisted.userModelOverride === true && persisted.userModel ? persisted.userModel : imageDefaults.model,
  );
  const [userAspectRatioOverride, setUserAspectRatioOverride] = useState(hasPersistedAspectRatioOverride);
  const [userAspectRatio, setUserAspectRatio] = useState<AspectRatioOption>(
    hasPersistedAspectRatioOverride && persisted.userAspectRatio ? persisted.userAspectRatio : imageDefaults.aspectRatio,
  );
  const [userImageSizeOverride, setUserImageSizeOverride] = useState(persisted.userImageSizeOverride === true);
  const [userImageSize, setUserImageSize] = useState<string>(
    persisted.userImageSizeOverride === true && persisted.userImageSize ? persisted.userImageSize : imageDefaults.imageSize,
  );
  const [userQualityOverride, setUserQualityOverride] = useState(persisted.userQualityOverride === true);
  const [userQuality, setUserQuality] = useState<ImageGenerationDefaults['quality']>(
    persisted.userQualityOverride === true && persisted.userQuality ? resolveOpenAiGptImageQuality(persisted.userQuality) : resolveOpenAiGptImageQuality(imageDefaults.quality),
  );
  const [experimentalUserImageSizeInput, setExperimentalUserImageSizeInput] = useState('');
  const [experimentalUserImageSizeError, setExperimentalUserImageSizeError] = useState<string | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showAspectRatioMenu, setShowAspectRatioMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const isGrokImageModel = userModel === 'grok-4.2-image';
  const isOpenAiGptImageModel = userModel === 'gpt-image-2';
  const availableAspectRatioOptions = isGrokImageModel ? GROK_ASPECT_RATIO_OPTIONS : STORYBOARD_ASPECT_RATIO_OPTIONS;
  const availableImageSizeOptions: string[] = isOpenAiGptImageModel
    ? [...OPENAI_GPT_IMAGE_SIZE_OPTIONS]
    : isGrokImageModel
      ? (['1K', '2K'] as ImageGenerationDefaults['imageSize'][])
      : imageSizeOptions;
  const availableImageQualityOptions = [...OPENAI_GPT_IMAGE_QUALITY_OPTIONS];
  const derivedOpenAiGptAspectRatio = describeOpenAiGptImageAspectRatio(userImageSize, userAspectRatio);
  const isOpenAiGptImageExperimentalSize = !!normalizeOpenAiGptImagePixelSize(userImageSize) && !isOpenAiGptImagePixelSize(userImageSize);
  const fallbackStandardImageSize = isStandardImageSize(imageDefaults.imageSize) ? imageDefaults.imageSize : '4K';

  const [isPlanning, setIsPlanning] = useState(false);
  const [isGeneratingBoard, setIsGeneratingBoard] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCanvasPicker, setShowCanvasPicker] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRunRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyboardAspectRatio = useMemo(() => getStoryboardCollageAspectRatio(shotCount), [shotCount]);
  const defaultAspectRatioSeed = imageDefaults.aspectRatio === 'auto' ? storyboardAspectRatio : imageDefaults.aspectRatio;
  const effectiveDefaultAspectRatio: AspectRatioOption = isOpenAiGptImageModel
    ? resolveOpenAiGptImageAspectRatio(
      resolveOpenAiGptImageSize(imageDefaults.imageSize, defaultAspectRatioSeed),
      defaultAspectRatioSeed,
    )
    : isGrokImageModel && !GROK_ASPECT_RATIO_OPTIONS.includes(imageDefaults.aspectRatio as AspectRatioOption)
      ? '1:1'
      : imageDefaults.aspectRatio === '9:21'
        ? '9:16'
        : imageDefaults.aspectRatio;
  const effectiveDefaultImageSize = isOpenAiGptImageModel
    ? resolveOpenAiGptImageSize(
      imageDefaults.imageSize,
      effectiveDefaultAspectRatio === 'auto' ? storyboardAspectRatio : effectiveDefaultAspectRatio,
    )
    : isGrokImageModel && fallbackStandardImageSize === '4K'
      ? '2K'
      : fallbackStandardImageSize;
  const effectiveDefaultQuality: ImageGenerationDefaults['quality'] = isOpenAiGptImageModel
    ? resolveOpenAiGptImageQuality(imageDefaults.quality)
    : 'auto';

  useEffect(() => {
    if (!userModelOverride && userModel !== imageDefaults.model) {
      setUserModel(imageDefaults.model);
    }
  }, [imageDefaults.model, userModel, userModelOverride]);

  useEffect(() => {
    if (!userImageSizeOverride && userImageSize !== effectiveDefaultImageSize) {
      setUserImageSize(effectiveDefaultImageSize);
    }
  }, [effectiveDefaultImageSize, userImageSize, userImageSizeOverride]);

  useEffect(() => {
    if (!userAspectRatioOverride && userAspectRatio !== effectiveDefaultAspectRatio) {
      setUserAspectRatio(effectiveDefaultAspectRatio);
    }
  }, [effectiveDefaultAspectRatio, userAspectRatio, userAspectRatioOverride]);

  useEffect(() => {
    if (!userQualityOverride && userQuality !== effectiveDefaultQuality) {
      setUserQuality(effectiveDefaultQuality);
    }
  }, [effectiveDefaultQuality, userQuality, userQualityOverride]);

  useEffect(() => {
    if (isGrokImageModel && !GROK_ASPECT_RATIO_OPTIONS.includes(userAspectRatio)) {
      setUserAspectRatio('1:1');
      return;
    }

    if (isOpenAiGptImageModel) {
      const aspectRatioSeed = userAspectRatio === 'auto' ? storyboardAspectRatio : userAspectRatio;
      const nextImageSize = resolveOpenAiGptImageSize(userImageSize, aspectRatioSeed);
      if (userImageSize !== nextImageSize) {
        setUserImageSize(nextImageSize);
        return;
      }

      const nextAspectRatio = resolveOpenAiGptImageAspectRatio(nextImageSize, aspectRatioSeed);
      if (userAspectRatio !== nextAspectRatio) {
        setUserAspectRatio(nextAspectRatio);
      }
      return;
    }

    if (userAspectRatio === '9:21') {
      setUserAspectRatio('9:16');
    }
  }, [isGrokImageModel, isOpenAiGptImageModel, storyboardAspectRatio, userAspectRatio, userImageSize]);

  useEffect(() => {
    if (!isOpenAiGptImageModel && !isStandardImageSize(userImageSize)) {
      setUserImageSize(isGrokImageModel && fallbackStandardImageSize === '4K' ? '2K' : fallbackStandardImageSize);
    }
  }, [fallbackStandardImageSize, isGrokImageModel, isOpenAiGptImageModel, userImageSize]);

  useEffect(() => {
    if (!isOpenAiGptImageModel) {
      return;
    }

    const normalizedImageSize = normalizeOpenAiGptImagePixelSize(userImageSize);
    if (normalizedImageSize && !isOpenAiGptImagePixelSize(normalizedImageSize) && normalizedImageSize !== experimentalUserImageSizeInput) {
      setExperimentalUserImageSizeInput(normalizedImageSize);
      setExperimentalUserImageSizeError(null);
    }
  }, [experimentalUserImageSizeInput, isOpenAiGptImageModel, userImageSize]);

  const handleApplyExperimentalUserImageSize = useCallback(() => {
    const validationError = getOpenAiGptImagePixelSizeValidationError(experimentalUserImageSizeInput);
    if (validationError) {
      setExperimentalUserImageSizeError(validationError);
      return;
    }

    const normalizedImageSize = normalizeOpenAiGptImagePixelSize(experimentalUserImageSizeInput);
    if (!normalizedImageSize) {
      setExperimentalUserImageSizeError('请输入合法像素尺寸，例如 2048x1152');
      return;
    }

    setUserImageSize(normalizedImageSize);
    setUserImageSizeOverride(true);
    setUserAspectRatio(resolveOpenAiGptImageAspectRatio(normalizedImageSize, userAspectRatio));
    setUserAspectRatioOverride(false);
    setExperimentalUserImageSizeInput(normalizedImageSize);
    setExperimentalUserImageSizeError(null);
    setShowSizeMenu(false);
  }, [experimentalUserImageSizeInput, userAspectRatio]);

  useEffect(() => {
    if (isGrokImageModel && userImageSize === '4K') {
      setUserImageSize('2K');
    }
  }, [isGrokImageModel, userImageSize]);

  const syncPlannerElement = useCallback((newAttrs: Partial<CanvasElement>) => {
    onElementChange?.(elementId, newAttrs);
  }, [elementId, onElementChange]);

  const clearPlannerGenerationState = useCallback((generatingError?: string) => {
    onSubmittingChange?.(elementId, false);
    syncPlannerElement(createGenerationIdlePatch({ progress: 0, error: generatingError }));
  }, [elementId, onSubmittingChange, syncPlannerElement]);

  const resumePendingBoardTask = useCallback((taskId: string, runId: number) => {
    onSubmittingChange?.(elementId, false);
    syncPlannerElement(createGenerationTaskPatch(taskId, 'image', 8));
    setIsGeneratingBoard(true);
    setGenerationState({ status: 'rendering', progress: 8, imageUrl: null, error: null });

    void waitForImageGenerationResult(taskId, {
      missingResultMessage: '宫格图片未返回可用结果',
      onProgress: (progress) => {
        syncPlannerElement({ generatingProgress: Math.max(progress || 0, 8) });
        if (activeRunRef.current !== runId) return;
        setGenerationState((current) => ({
          ...current,
          status: 'rendering',
          progress: Math.max(current.progress, progress || 0),
        }));
      },
    }).then((resultUrl) => {
      patchStoryboardPlannerState(storageKey, { generationImageUrl: resultUrl, pendingTaskId: null });
      clearPlannerGenerationState();
      if (activeRunRef.current !== runId) return;
      setGenerationState({ status: 'done', progress: 100, imageUrl: resultUrl, error: null });
    }).catch((error: unknown) => {
      patchStoryboardPlannerState(storageKey, { pendingTaskId: null });
      const message = error instanceof Error ? error.message : '宫格图片恢复失败';
      clearPlannerGenerationState(message);
      if (activeRunRef.current !== runId) return;
      setGenerationState({ status: 'error', progress: 0, imageUrl: null, error: message });
    }).finally(() => {
      if (activeRunRef.current === runId) setIsGeneratingBoard(false);
    });
  }, [clearPlannerGenerationState, elementId, onSubmittingChange, storageKey, syncPlannerElement]);

  // 实际传给 API 的比例：auto 时按镜头数自动计算，否则用用户选择
  const effectiveAspectRatio = useMemo(
    () => isOpenAiGptImageModel
      ? resolveOpenAiGptImageAspectRatio(userImageSize, userAspectRatio === 'auto' ? storyboardAspectRatio : userAspectRatio)
      : userAspectRatio === 'auto'
        ? storyboardAspectRatio
        : userAspectRatio,
    [isOpenAiGptImageModel, storyboardAspectRatio, userAspectRatio, userImageSize],
  );

  // ── 防抖自动保存 (仿 Ninepalacediagramdivision autoSave) ──
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveStoryboardPlannerState(storageKey, {
        mode,
        shotCount,
        sceneDescription,
        storyContext,
        sourceImages,
        combinedPrompt,
        result,
        generationImageUrl: generationState.imageUrl,
        pendingTaskId: null,
        userModel,
        userModelOverride,
        userAspectRatio,
        userAspectRatioOverride,
        userImageSize,
        userImageSizeOverride,
        userQuality,
        userQualityOverride,
      });
    }, STORYBOARD_PLANNER_SAVE_DEBOUNCE_MS);
  }, [mode, shotCount, sceneDescription, storyContext, sourceImages, combinedPrompt, result, generationState.imageUrl, storageKey, userModel, userModelOverride, userAspectRatio, userAspectRatioOverride, userImageSize, userImageSizeOverride, userQuality, userQualityOverride]);

  // 每次关键 state 变化时触发自动保存
  useEffect(() => {
    scheduleSave();
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [scheduleSave]);

  useEffect(() => () => {
    activeRunRef.current += 1;
  }, []);

  // ── 挂载时恢复未完成的「生成提示词」任务 ──
  useEffect(() => {
    if (!persisted.isPlanningPending) return;
    // 后台闭包可能仍在运行，轮询 localStorage 等待其完成
    setIsPlanning(true);
    const interval = setInterval(() => {
      const current = loadStoryboardPlannerState(storageKey);
      if (!current.isPlanningPending) {
        clearInterval(interval);
        clearTimeout(timeout);
        if (current.result) {
          setResult(current.result);
          setCombinedPrompt(getChineseCombinedPrompt(current));
        }
        setIsPlanning(false);
      }
    }, 500);
    // 30 秒超时保护
    const timeout = setTimeout(() => {
      clearInterval(interval);
      patchStoryboardPlannerState(storageKey, { isPlanningPending: false });
      setIsPlanning(false);
      setErrorMsg('提示词生成超时，请重新生成。');
    }, 30_000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 挂载时恢复未完成的「生成宫格图」任务 ──
  useEffect(() => {
    // 已有 taskId 的情况由下方 pendingTaskId 逻辑处理
    if (!persisted.isGeneratingBoardPending || persisted.pendingTaskId) return;
    if (persisted.generationImageUrl) {
      patchStoryboardPlannerState(storageKey, { isGeneratingBoardPending: false });
      clearPlannerGenerationState();
      return;
    }
    onSubmittingChange?.(elementId, true, {
      prompt: combinedPrompt.trim(),
      model: userModel,
      aspectRatio: effectiveAspectRatio,
      imageSize: userImageSize,
      quality: userQuality,
    });
    syncPlannerElement(createGenerationIdlePatch({ progress: 5 }));
    setIsGeneratingBoard(true);
    setGenerationState({ status: 'rendering', progress: 5, imageUrl: null, error: null });
    const interval = setInterval(() => {
      const current = loadStoryboardPlannerState(storageKey);
      if (!current.isGeneratingBoardPending) {
        clearInterval(interval);
        clearTimeout(timeout);
        if (current.generationImageUrl) {
          setGenerationState({ status: 'done', progress: 100, imageUrl: current.generationImageUrl, error: null });
        } else {
          setGenerationState({ status: 'idle', progress: 0, imageUrl: null, error: null });
        }
        setIsGeneratingBoard(false);
        return;
      }
      // 如果后台已获取到 taskId，转交给 pendingTaskId 恢复逻辑
      if (current.pendingTaskId) {
        clearInterval(interval);
        clearTimeout(timeout);
        // 触发重新挂载 pendingTaskId 恢复（通过手动启动轮询）
        patchStoryboardPlannerState(storageKey, { isGeneratingBoardPending: false });
        const runId = activeRunRef.current + 1;
        activeRunRef.current = runId;
        resumePendingBoardTask(current.pendingTaskId, runId);
      }
    }, 500);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      patchStoryboardPlannerState(storageKey, { isGeneratingBoardPending: false });
      clearPlannerGenerationState('宫格图生成超时，请重新生成。');
      setIsGeneratingBoard(false);
      setGenerationState({ status: 'error', progress: 0, imageUrl: null, error: '宫格图生成超时，请重新生成。' });
    }, 30_000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearPlannerGenerationState, combinedPrompt, effectiveAspectRatio, persisted.generationImageUrl, persisted.isGeneratingBoardPending, persisted.pendingTaskId, resumePendingBoardTask, storageKey, syncPlannerElement, userImageSize, userModel, userQuality]);

  // ── 挂载时恢复未完成的生成任务（已有 taskId 的轮询） ──
  useEffect(() => {
    const taskId = persisted.pendingTaskId;
    if (!taskId || persisted.generationImageUrl) return;

    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    resumePendingBoardTask(taskId, runId);
  }, [persisted.generationImageUrl, persisted.pendingTaskId, resumePendingBoardTask]);

  // 如果当前没有参考图且有画布选中图片，自动添加
  useEffect(() => {
    if (sourceImages.length === 0 && selectedCanvasImage?.content) {
      setSourceImages([{ content: selectedCanvasImage.content, label: selectedCanvasImage.displayName || '当前图片' }]);
    }
  }, [selectedCanvasImage, sourceImages.length]);

  const addSourceImage = useCallback((content: string, label: string) => {
    setSourceImages((prev) => {
      if (prev.length >= MAX_SOURCE_IMAGES || prev.some((img) => img.content === content)) return prev;
      return [...prev, { content, label }];
    });
    setErrorMsg(null);
  }, []);

  // ── 画布点选事件：用户在画布上点选图片后自动添加为参考图 ──
  const handleCanvasSelectionEvent = useCallback((detail: { imageContent?: string }) => {
    if (detail.imageContent) {
      addSourceImage(detail.imageContent, '画布点选');
    }
  }, [addSourceImage]);
  useCanvasImageSelectionEvent(elementId, handleCanvasSelectionEvent);

  const removeSourceImage = useCallback((content: string) => {
    setSourceImages((prev) => prev.filter((img) => img.content !== content));
  }, []);

  const toggleSourceImage = useCallback((content: string, label: string) => {
    setSourceImages((prev) => {
      if (prev.some((img) => img.content === content)) return prev.filter((img) => img.content !== content);
      if (prev.length >= MAX_SOURCE_IMAGES) return prev;
      return [...prev, { content, label }];
    });
    setErrorMsg(null);
  }, []);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const dataUrl = await readFileAsDataUrl(file)
        .then((value) => compressStoryboardReferenceDataUrl(value))
        .catch(() => null);

      if (dataUrl) {
        addSourceImage(dataUrl, file.name);
      }
    }

    event.target.value = '';
  }, [addSourceImage]);

  const resolveReferenceImage = useCallback(async (value: string) => {
    if (isImageRef(value)) {
      const resolved = await getImageDataUrl(value);
      if (!resolved) {
        throw new Error('参考图读取失败，请重新选择图片后再试。');
      }
      return compressStoryboardReferenceDataUrl(resolved);
    }
    if (isDataUrl(value)) {
      return compressStoryboardReferenceDataUrl(value);
    }
    return value;
  }, []);

  const handleCopyPrompt = useCallback(() => {
    if (!combinedPrompt.trim()) return;
    void navigator.clipboard.writeText(combinedPrompt);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  }, [combinedPrompt]);

  const handleReset = useCallback(() => {
    if (!window.confirm('确定要重置所有分镜规划数据吗？此操作不可撤销。')) return;
    setMode('shot');
    setShotCount(9);
    setSceneDescription('');
    setStoryContext('');
    setSourceImages([]);
    setResult(null);
    setCombinedPrompt('');
    setUserModelOverride(false);
    setUserModel(imageDefaults.model);
    setUserAspectRatioOverride(false);
    setUserAspectRatio(imageDefaults.aspectRatio);
    setUserImageSizeOverride(false);
    setUserImageSize(imageDefaults.imageSize);
    setUserQualityOverride(false);
    setUserQuality(resolveOpenAiGptImageQuality(imageDefaults.quality));
    setGenerationState({ status: 'idle', progress: 0, imageUrl: null, error: null });
    setErrorMsg(null);
    clearPlannerGenerationState();
    removeStoryboardPlannerState(storageKey);
  }, [clearPlannerGenerationState, imageDefaults.aspectRatio, imageDefaults.imageSize, imageDefaults.model, imageDefaults.quality, storageKey]);

  const handleBuildStoryboardPrompt = useCallback(async () => {
    if (sourceImages.length === 0) {
      setErrorMsg('请先选择至少一张参考图。');
      return;
    }

    if (result && combinedPrompt.trim() && !window.confirm('重新生成将覆盖当前的提示词方案，是否继续？')) {
      return;
    }

    const imageSeeds = sourceImages.map((img) => img.content);
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    setIsPlanning(true);
    setErrorMsg(null);
    setResult(null);
    setCombinedPrompt('');
    setGenerationState({ status: 'idle', progress: 0, imageUrl: null, error: null });

    // 立即标记「提示词生成中」，面板卸载后重新打开可恢复 spinner
    patchStoryboardPlannerState(storageKey, { isPlanningPending: true });

    try {
      const resolvedImages = await Promise.all(imageSeeds.map((s) => resolveReferenceImage(s)));
      const plan = await requestStoryboardPlan({
        mode,
        shotCount,
        referenceImages: resolvedImages,
        sceneDescription: sceneDescription.trim(),
        storyContext: storyContext.trim(),
        model: selectedModel,
      });

      const nextCombinedPrompt = buildCombinedStoryboardPrompt(plan);

      // 无论面板是否卸载，都持久化结果
      patchStoryboardPlannerState(storageKey, {
        isPlanningPending: false,
        result: plan,
        combinedPrompt: nextCombinedPrompt,
      });

      if (activeRunRef.current !== runId) return;

      setResult(plan);
      setCombinedPrompt(nextCombinedPrompt);
    } catch (error) {
      patchStoryboardPlannerState(storageKey, { isPlanningPending: false });
      if (activeRunRef.current === runId) {
        setErrorMsg(error instanceof Error ? error.message : '分镜生成失败');
      }
    } finally {
      if (activeRunRef.current === runId) {
        setIsPlanning(false);
      }
    }
  }, [mode, resolveReferenceImage, sceneDescription, selectedModel, shotCount, sourceImages, storyContext, combinedPrompt, result, storageKey]);

  const handleGenerateStoryboardBoard = useCallback(async () => {
    if (sourceImages.length === 0) {
      setErrorMsg('请先选择至少一张参考图。');
      return;
    }

    if (!result) {
      setErrorMsg('请先生成分镜提示词和总提示词。');
      return;
    }

    const finalPrompt = combinedPrompt.trim();
    if (!finalPrompt) {
      setErrorMsg('请先填写总提示词，再生成宫格图。');
      return;
    }

    const imageSeeds = sourceImages.map((img) => img.content);
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    setIsGeneratingBoard(true);
    setErrorMsg(null);
    setGenerationState({ status: 'rendering', progress: 8, imageUrl: null, error: null });
    onSubmittingChange?.(elementId, true, {
      prompt: finalPrompt,
      model: userModel,
      aspectRatio: effectiveAspectRatio,
      imageSize: userImageSize,
      quality: userQuality,
    });
    syncPlannerElement(createGenerationIdlePatch({ progress: 0 }));

    // 立即标记「宫格图生成中」，面板卸载后重新打开可恢复 spinner
    patchStoryboardPlannerState(storageKey, { isGeneratingBoardPending: true });

    try {
      const resolvedImages = await Promise.all(imageSeeds.map((s) => resolveReferenceImage(s)));
      const generation = await runImageGenerationFlow({
        prompt: finalPrompt,
        model: userModel,
        aspectRatio: effectiveAspectRatio,
        imageSize: userImageSize,
        quality: userQuality,
        referenceImages: resolvedImages,
        preferDirect: false,
        forceAsync: true,
      }, {
        awaitResult: true,
        missingResultMessage: '宫格图片未返回可用结果',
        onTaskCreated: (taskId) => {
          patchStoryboardPlannerState(storageKey, { pendingTaskId: taskId, isGeneratingBoardPending: false });
          onSubmittingChange?.(elementId, false);
          syncPlannerElement(createGenerationTaskPatch(taskId, 'image'));
        },
        onProgress: (progress) => {
          syncPlannerElement({ generatingProgress: Math.max(progress || 0, 8) });
          if (activeRunRef.current !== runId) {
            return;
          }

          setGenerationState((current) => ({
            ...current,
            status: 'rendering',
            progress: Math.max(current.progress, progress || 0),
          }));
        },
      });

      if (generation.status !== 'completed') {
        throw new Error('宫格图片未返回可用结果');
      }

      const finalImageUrl = generation.imageUrl;

      // 始终立即持久化结果（即使面板已卸载也不丢失）
      patchStoryboardPlannerState(storageKey, { generationImageUrl: finalImageUrl, pendingTaskId: null, isGeneratingBoardPending: false });
      clearPlannerGenerationState();

      if (activeRunRef.current !== runId) {
        return;
      }

      setGenerationState({ status: 'done', progress: 100, imageUrl: finalImageUrl, error: null });
      onCreateDraft(result, imageSeeds, finalImageUrl, finalPrompt);
    } catch (error) {
      // 清除 pendingTaskId（即使面板已卸载）
      patchStoryboardPlannerState(storageKey, { pendingTaskId: null, isGeneratingBoardPending: false });
      const message = error instanceof Error ? error.message : '宫格图片生成失败';
      clearPlannerGenerationState(message);

      if (activeRunRef.current !== runId) {
        return;
      }

      setGenerationState({ status: 'error', progress: 0, imageUrl: null, error: message });
    } finally {
      if (activeRunRef.current === runId) {
        setIsGeneratingBoard(false);
      }
    }
  }, [clearPlannerGenerationState, combinedPrompt, effectiveAspectRatio, elementId, onCreateDraft, onSubmittingChange, resolveReferenceImage, result, sourceImages, storageKey, syncPlannerElement, userImageSize, userModel, userQuality]);

  const handleImportStoryboardBoardToCanvas = useCallback(() => {
    if (!result || !generationState.imageUrl) {
      return;
    }

    onCreateDraft(
      result,
      sourceImages.map((image) => image.content),
      generationState.imageUrl,
      combinedPrompt.trim() || undefined,
    );
  }, [combinedPrompt, generationState.imageUrl, onCreateDraft, result, sourceImages]);

  return (
    <div
      className="absolute z-[120] flex w-[min(560px,calc(100vw-40px))] max-h-[min(92vh,960px)] flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-xl"
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" aria-label="上传分镜参考图" onChange={handleFileChange} />

      {/* ─── 头部 ─── */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-800 text-white">
            <Clapperboard size={13} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-slate-800">分镜规划</div>
            <div className="text-[10px] text-slate-400">{mode === 'shot' ? '分镜模式' : '故事模式'} · {shotCount} 格</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={handleReset} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" title="重置所有数据">
            <RotateCcw size={12} />
          </button>
          <button type="button" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" title="关闭">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ─── 可滚动主体 ─── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        <StoryboardPlannerSourcePicker
          sourceImages={sourceImages}
          canvasImages={canvasImages}
          showCanvasPicker={showCanvasPicker}
          maxSourceImages={MAX_SOURCE_IMAGES}
          onUploadClick={handleUploadClick}
          onToggleCanvasPicker={() => setShowCanvasPicker((value) => !value)}
          onRequestCanvasSelect={onRequestCanvasSelect}
          onRemoveSourceImage={removeSourceImage}
          onToggleSourceImage={toggleSourceImage}
        />

        {/* ② 分镜方式 + 格数 */}
        <section>
          <SectionLabel step={2}>分镜方式与格数</SectionLabel>
          {/* 分段式模式切换 */}
          <div className="flex overflow-hidden rounded-md border border-slate-200 bg-slate-100 p-0.5">
            <button type="button" onClick={() => setMode('shot')} className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[12px] font-semibold transition-all ${mode === 'shot' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Camera size={13} />
              分镜模式
            </button>
            <button type="button" onClick={() => setMode('story')} className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[12px] font-semibold transition-all ${mode === 'story' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Film size={13} />
              故事模式
            </button>
          </div>
          {/* 格数选择（下拉选择器） */}
          <div className="mt-2 relative">
            <select
              value={shotCount}
              onChange={(event) => setShotCount(Number(event.target.value))}
              title="选择分镜格数"
              aria-label="选择分镜格数"
              className="w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-1.5 pr-8 text-[12px] font-semibold text-slate-700 outline-none transition-all hover:border-slate-300 focus:border-sky-300 focus:ring-1 focus:ring-sky-100 cursor-pointer"
            >
              {SHOT_COUNT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} 格 ({SHOT_COUNT_GRID_LABELS[option]})
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </section>

        {/* ③ 补充说明 */}
        <section>
          <SectionLabel step={3}>补充说明（选填）</SectionLabel>
          <textarea
            value={sceneDescription}
            onChange={(event) => setSceneDescription(event.target.value)}
            placeholder="描述画面场景、风格或构图要求，例如：现代都市夜景、古风庭院月色..."
            className="h-14 w-full resize-none rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-[12px] leading-5 text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-1 focus:ring-sky-100 transition-all"
          />
          {mode === 'story' && (
            <textarea
              value={storyContext}
              onChange={(event) => setStoryContext(event.target.value)}
              placeholder="故事设定，例如：两个青梅竹马重逢的故事，女主角是画家，男主角是归国音乐家..."
              className="mt-1.5 h-14 w-full resize-none rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-[12px] leading-5 text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-1 focus:ring-sky-100 transition-all"
            />
          )}
        </section>

        {/* 错误提示 */}
        {errorMsg && (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            <X size={12} className="mt-0.5 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
        {generationState.error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            <Loader2 size={12} className="mt-0.5 shrink-0 text-amber-400" />
            <span>{generationState.error}</span>
          </div>
        )}

        {result && (
          <StoryboardPlannerResultPanel
            result={result}
            generationState={generationState}
            combinedPrompt={combinedPrompt}
            copyFeedback={copyFeedback}
            onCombinedPromptChange={setCombinedPrompt}
            onCopyPrompt={handleCopyPrompt}
            onImportStoryboardBoardToCanvas={handleImportStoryboardBoardToCanvas}
          />
        )}
      </div>

      <StoryboardPlannerFooter
        hasResult={!!result}
        combinedPrompt={combinedPrompt}
        isPlanning={isPlanning}
        isGeneratingBoard={isGeneratingBoard}
        imageDefaults={imageDefaults}
        isOpenAiGptImageModel={isOpenAiGptImageModel}
        derivedOpenAiGptAspectRatio={derivedOpenAiGptAspectRatio}
        isOpenAiGptImageExperimentalSize={isOpenAiGptImageExperimentalSize}
        storyboardAspectRatio={storyboardAspectRatio}
        userAspectRatio={userAspectRatio}
        userImageSize={userImageSize}
        userQuality={userQuality}
        userModel={userModel}
        userQualityOverride={userQualityOverride}
        experimentalUserImageSizeInput={experimentalUserImageSizeInput}
        experimentalUserImageSizeError={experimentalUserImageSizeError}
        showAspectRatioMenu={showAspectRatioMenu}
        showSizeMenu={showSizeMenu}
        showQualityMenu={showQualityMenu}
        showModelMenu={showModelMenu}
        availableAspectRatioOptions={availableAspectRatioOptions}
        availableImageSizeOptions={availableImageSizeOptions}
        availableImageQualityOptions={availableImageQualityOptions}
        modelOptions={STORYBOARD_MODEL_OPTIONS}
        onClose={onClose}
        onBuildStoryboardPrompt={() => void handleBuildStoryboardPrompt()}
        onGenerateStoryboardBoard={() => void handleGenerateStoryboardBoard()}
        onApplyExperimentalUserImageSize={handleApplyExperimentalUserImageSize}
        setUserAspectRatio={setUserAspectRatio}
        setUserAspectRatioOverride={setUserAspectRatioOverride}
        setUserImageSize={setUserImageSize}
        setUserImageSizeOverride={setUserImageSizeOverride}
        setUserQuality={setUserQuality}
        setUserQualityOverride={setUserQualityOverride}
        setUserModel={setUserModel}
        setUserModelOverride={setUserModelOverride}
        setExperimentalUserImageSizeInput={setExperimentalUserImageSizeInput}
        setExperimentalUserImageSizeError={setExperimentalUserImageSizeError}
        setShowAspectRatioMenu={setShowAspectRatioMenu}
        setShowSizeMenu={setShowSizeMenu}
        setShowQualityMenu={setShowQualityMenu}
        setShowModelMenu={setShowModelMenu}
      />
    </div>
  );
}