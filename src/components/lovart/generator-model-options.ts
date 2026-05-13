import {
    describeOpenAiGptImageAspectRatio,
    getMaxReferenceImagesForImageModel,
    MAGICAPI_GPT_IMAGE_ASPECT_RATIO_OPTIONS,
    OPENAI_GPT_IMAGE_QUALITY_OPTIONS,
    OPENAI_GPT_IMAGE_SIZE_OPTIONS,
    STANDARD_IMAGE_SIZE_OPTIONS,
    MAGICAPI_IMAGE_ASPECT_RATIO_OPTIONS,
    getMagicApiGeminiImageSizeOptions,
    getMagicApiGptImageSizeOptions,
    isDomesticImageModel as isKnownDomesticImageModel,
    isGeminiNativeImageModel,
    isGrokImageModel as isKnownGrokImageModel,
    isOpenAiGptImageModel as isKnownOpenAiGptImageModel,
    resolveMagicApiOpenAiStyleImageSize,
    shouldUseDomesticImageBatching,
} from '@/lib/image-generation-models';
import { DEFAULT_AI_PROVIDER_ID, getProviderImageModels, isMagicApiProvider, type AiProviderId } from '@/lib/ai-providers';
import type { ImageGenerationDefaults } from '@/lib/generation-defaults';
import { VIDEO_DURATION_OPTIONS, type VideoDuration } from '@/lib/workbench-settings';

export const IMAGE_MODEL_OPTIONS = [
    'gemini-3.1-flash-image-preview',
    'nano-banana-2',
    'gpt-image-2',
    'grok-4.2-image',
    'doubao-seedream-5-0-260128',
    'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image-preview',
    'doubao-seedream-4-5-251128',
    'grok-4-2-image',
    'gpt-image-2-pro',
] as const;

export type ImageModel = (typeof IMAGE_MODEL_OPTIONS)[number];
export type ImageAspectRatio = ImageGenerationDefaults['aspectRatio'];
export type ImageSize = string;
export type ImageQuality = ImageGenerationDefaults['quality'];
export type GenerateCount = 1 | 2 | 3 | 4;

export type VideoModel = 'veo3.1' | 'veo3.1-fast' | 'veo3.1-components' | 'doubao-seedance-2-0-260128';
export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
export type VideoDurationValue = VideoDuration;
export type VideoResolution = '480p' | '720p';
export type DomesticGenerationMode = 'first-last-frame' | 'omni-reference';

export const IMAGE_MODEL_LABELS: Record<ImageModel, string> = {
    'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image-preview',
    'nano-banana-2': 'nano-banana-2',
    'gpt-image-2': 'gpt-image-2',
    'grok-4.2-image': 'grok-4.2-image',
    'doubao-seedream-5-0-260128': 'doubao-seedream-5-0-260128',
    'gemini-3-pro-image-preview': 'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image-preview': 'gemini-2.5-flash-image-preview',
    'doubao-seedream-4-5-251128': 'doubao-seedream-4-5-251128',
    'grok-4-2-image': 'grok-4-2-image',
    'gpt-image-2-pro': 'gpt-image-2-pro',
};

const ALL_IMAGE_MODELS = new Set<string>(IMAGE_MODEL_OPTIONS);

export function isImageModel(value: unknown): value is ImageModel {
    return typeof value === 'string' && ALL_IMAGE_MODELS.has(value);
}

export function getImageModelOptionsForProvider(providerId: AiProviderId = DEFAULT_AI_PROVIDER_ID): ImageModel[] {
    const models = getProviderImageModels(providerId).filter(isImageModel);
    return models.length > 0 ? models : [...IMAGE_MODEL_OPTIONS];
}

export const IMAGE_QUALITY_LABELS: Record<ImageQuality, string> = {
    auto: '自动',
    low: '低',
    medium: '中',
    high: '高',
};

export const STANDARD_IMAGE_ASPECT_RATIOS: ImageAspectRatio[] = ['auto', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:1', '4:5', '5:4', '21:9'];
export const GROK_IMAGE_ASPECT_RATIOS: ImageAspectRatio[] = ['4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:1'];
export const GROK_IMAGE_SIZES: ImageSize[] = ['1K', '2K'];

export const describeImageSizeAspectRatio = describeOpenAiGptImageAspectRatio;

export function resolveImageGeneratorModelOptions({
    model,
    imageSize,
    aspectRatio,
    quality,
    generateCount,
    referenceImageCount,
    providerId = DEFAULT_AI_PROVIDER_ID,
}: {
    model: ImageModel;
    imageSize: ImageSize;
    aspectRatio: ImageAspectRatio;
    quality: ImageQuality;
    generateCount: GenerateCount;
    referenceImageCount: number;
    providerId?: AiProviderId;
}) {
    const isMagicApi = isMagicApiProvider(providerId);
    const maxReferenceImages = getMaxReferenceImagesForImageModel(model);
    const isGrokImageModel = isKnownGrokImageModel(model);
    const isOpenAiGptImageModel = isKnownOpenAiGptImageModel(model);
    const isGeminiImageModel = isGeminiNativeImageModel(model);
    const isDomesticImageModel = isKnownDomesticImageModel(model);
    const usesDomesticImageBatching = shouldUseDomesticImageBatching(model);
    const grokUsesReferenceAspectRatio = isGrokImageModel && referenceImageCount > 0;
    const availableAspectRatios = isMagicApi && isOpenAiGptImageModel
        ? [...MAGICAPI_GPT_IMAGE_ASPECT_RATIO_OPTIONS]
        : isMagicApi
        ? [...MAGICAPI_IMAGE_ASPECT_RATIO_OPTIONS]
        : isGrokImageModel
        ? GROK_IMAGE_ASPECT_RATIOS
        : STANDARD_IMAGE_ASPECT_RATIOS;
    const availableImageSizes: ImageSize[] = isMagicApi && isOpenAiGptImageModel
        ? getMagicApiGptImageSizeOptions(model)
        : isMagicApi && isGeminiImageModel
            ? getMagicApiGeminiImageSizeOptions(model)
            : isMagicApi && (isGrokImageModel || isDomesticImageModel)
                ? [resolveMagicApiOpenAiStyleImageSize(model, aspectRatio, imageSize)]
                : isOpenAiGptImageModel
        ? [...OPENAI_GPT_IMAGE_SIZE_OPTIONS]
        : isGrokImageModel
            ? GROK_IMAGE_SIZES
            : [...STANDARD_IMAGE_SIZE_OPTIONS];
    const availableImageQualities: ImageQuality[] = isMagicApi && isOpenAiGptImageModel
        ? ['high']
        : [...OPENAI_GPT_IMAGE_QUALITY_OPTIONS];
    const derivedOpenAiGptImageAspectRatio = describeOpenAiGptImageAspectRatio(imageSize, aspectRatio);
    const displayedAspectRatio = grokUsesReferenceAspectRatio
        ? '参考图比例'
        : isOpenAiGptImageModel
            ? derivedOpenAiGptImageAspectRatio
            : aspectRatio === 'auto'
                ? '自动'
                : aspectRatio;
    const settingsSummary = isOpenAiGptImageModel
        ? `${imageSize} · ${IMAGE_QUALITY_LABELS[quality]} · ${displayedAspectRatio} · ×${generateCount}`
        : `${displayedAspectRatio} · ${imageSize} · ×${generateCount}`;

    return {
        maxReferenceImages,
        isGrokImageModel,
        isOpenAiGptImageModel,
        usesDomesticImageBatching,
        grokUsesReferenceAspectRatio,
        availableAspectRatios,
        availableImageSizes,
        availableImageQualities,
        displayedAspectRatio,
        settingsSummary,
    };
}

export const VIDEO_MODEL_OPTIONS: VideoModel[] = ['veo3.1', 'veo3.1-fast', 'veo3.1-components', 'doubao-seedance-2-0-260128'];

export const VIDEO_MODEL_LABELS: Record<VideoModel, string> = {
    'veo3.1': 'Veo 3.1',
    'veo3.1-fast': 'Veo 3.1 Fast',
    'veo3.1-components': 'Veo 3.1 Components',
    'doubao-seedance-2-0-260128': 'Doubao Seedance 2.0',
};

export const VIDEO_MODEL_DESC: Record<VideoModel, string> = {
    'veo3.1': '支持首帧/尾帧图片',
    'veo3.1-fast': '支持首帧/尾帧图片，更便宜，质量低于 Veo 3.1',
    'veo3.1-components': '支持1-3张参考图',
    'doubao-seedance-2-0-260128': '国产多模态官方格式，支持首尾帧模式和全能参考模式',
};

export function isComponentsVideoModel(model: VideoModel): boolean {
    return model === 'veo3.1-components';
}

export function isDomesticMultimodalVideoModel(model: VideoModel): boolean {
    return model === 'doubao-seedance-2-0-260128';
}

export function getMaxImagesForVideoModel(model: VideoModel): number {
    if (isComponentsVideoModel(model)) {
        return 3;
    }

    if (isDomesticMultimodalVideoModel(model)) {
        return 9;
    }

    return 2;
}

export function getVideoAspectRatioOptions(model: VideoModel): VideoAspectRatio[] {
    if (isDomesticMultimodalVideoModel(model)) {
        return ['16:9', '9:16', '1:1', '4:3', '3:4'];
    }

    return ['16:9', '9:16'];
}

export function getVideoDurationOptions(model: VideoModel): VideoDurationValue[] {
    if (isDomesticMultimodalVideoModel(model)) {
        return [...VIDEO_DURATION_OPTIONS];
    }

    return ['5s', '8s'];
}

export function getVideoAddImageTitle(model: VideoModel, domesticMode?: DomesticGenerationMode): string {
    if (isComponentsVideoModel(model)) {
        return '添加参考图 (1-3张)';
    }

    if (isDomesticMultimodalVideoModel(model)) {
        return domesticMode === 'first-last-frame' ? '添加首尾帧图片' : '添加全能参考素材';
    }

    return '添加首帧/尾帧图片';
}

export function getMaxVideosForVideoModel(model: VideoModel): number {
    return isDomesticMultimodalVideoModel(model) ? 3 : 0;
}

export function getMaxAudiosForVideoModel(model: VideoModel): number {
    return isDomesticMultimodalVideoModel(model) ? 3 : 0;
}

export function getVideoResolutionOptions(model: VideoModel): VideoResolution[] {
    return isDomesticMultimodalVideoModel(model) ? ['480p', '720p'] : ['720p'];
}