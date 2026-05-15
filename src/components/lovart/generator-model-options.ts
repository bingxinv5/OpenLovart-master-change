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
    JIEKOU_GPT_IMAGE_SIZE_OPTIONS,
    JIEKOU_IMAGE_ASPECT_RATIO_OPTIONS,
    isDomesticImageModel as isKnownDomesticImageModel,
    isGeminiNativeImageModel,
    isGrokImageModel as isKnownGrokImageModel,
    isJieKouGptImageModel as isKnownJieKouGptImageModel,
    isJieKouGeminiImageModel as isKnownJieKouGeminiImageModel,
    isJieKouNanoBananaImageModel as isKnownJieKouNanoBananaImageModel,
    isOpenAiGptImageModel as isKnownOpenAiGptImageModel,
    isVApiGeminiImageModel as isKnownVApiGeminiImageModel,
    resolveMagicApiOpenAiStyleImageSize,
    shouldUseDomesticImageBatching,
} from '@/lib/image-generation-models';
import { DEFAULT_AI_PROVIDER_ID, getProviderImageModels, getProviderVideoModels, isJieKouProvider, isMagicApiProvider, isVApiProvider, type AiProviderId } from '@/lib/ai-providers';
import type { ImageGenerationDefaults } from '@/lib/generation-defaults';
import {
    VIDEO_MODEL_OPTIONS,
    VIDEO_MODEL_LABELS,
    VIDEO_MODEL_DESC,
    getMaxAudiosForVideoModel,
    getMaxImagesForVideoModel,
    getMaxVideosForVideoModel,
    getVideoAddImageTitle,
    getVideoAspectRatioOptions,
    getVideoDurationOptions,
    getVideoResolutionOptions,
    isComponentsVideoModel,
    isDomesticMultimodalVideoModel,
    isVideoModel,
    supportsVideoAudioGeneration,
    type DomesticGenerationMode,
    type VideoAspectRatio,
    type VideoDuration,
    type VideoModel,
    type VideoResolution,
} from '@/lib/video-generation-models';

export {
    VIDEO_MODEL_OPTIONS,
    VIDEO_MODEL_LABELS,
    VIDEO_MODEL_DESC,
    getMaxAudiosForVideoModel,
    getMaxImagesForVideoModel,
    getMaxVideosForVideoModel,
    getVideoAddImageTitle,
    getVideoAspectRatioOptions,
    getVideoDurationOptions,
    getVideoResolutionOptions,
    isComponentsVideoModel,
    isDomesticMultimodalVideoModel,
    supportsVideoAudioGeneration,
};

export type {
    DomesticGenerationMode,
    VideoAspectRatio,
    VideoModel,
    VideoResolution,
};

export const IMAGE_MODEL_OPTIONS = [
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image',
    'nano-banana-pro',
    'nano-banana-2',
    'gpt-image-2',
    'grok-4.2-image',
    'doubao-seedream-5-0-260128',
    'gemini-3-pro-image-preview',
    'grok-4-2-image',
    'gpt-image-2-pro',
] as const;

export type ImageModel = (typeof IMAGE_MODEL_OPTIONS)[number];
export type ImageAspectRatio = ImageGenerationDefaults['aspectRatio'];
export type ImageSize = string;
export type ImageQuality = ImageGenerationDefaults['quality'];
export type GenerateCount = 1 | 2 | 3 | 4;

export type VideoDurationValue = VideoDuration;

export const IMAGE_MODEL_LABELS: Record<ImageModel, string> = {
    'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image': 'gemini-3-pro-image',
    'nano-banana-pro': 'nano-banana-pro',
    'nano-banana-2': 'nano-banana-2',
    'gpt-image-2': 'gpt-image-2',
    'grok-4.2-image': 'grok-4.2-image',
    'doubao-seedream-5-0-260128': 'doubao-seedream-5-0-260128',
    'gemini-3-pro-image-preview': 'gemini-3-pro-image-preview',
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
    const isJieKou = isJieKouProvider(providerId);
    const isVApi = isVApiProvider(providerId);
    const maxReferenceImages = getMaxReferenceImagesForImageModel(model);
    const isGrokImageModel = isKnownGrokImageModel(model);
    const isOpenAiGptImageModel = isKnownOpenAiGptImageModel(model);
    const isGeminiImageModel = isGeminiNativeImageModel(model);
    const isJieKouGeminiImageModel = isKnownJieKouGeminiImageModel(model);
    const isJieKouNanoBananaImageModel = isKnownJieKouNanoBananaImageModel(model);
    const isJieKouGptImageModel = isKnownJieKouGptImageModel(model);
    const isVApiGeminiImageModel = isKnownVApiGeminiImageModel(model);
    const isDomesticImageModel = isKnownDomesticImageModel(model);
    const usesDomesticImageBatching = shouldUseDomesticImageBatching(model);
    const grokUsesReferenceAspectRatio = isGrokImageModel && referenceImageCount > 0;
    const availableAspectRatios = isJieKou && (isJieKouGeminiImageModel || isJieKouNanoBananaImageModel || isJieKouGptImageModel)
        ? [...JIEKOU_IMAGE_ASPECT_RATIO_OPTIONS]
        : isMagicApi && isOpenAiGptImageModel
        ? [...MAGICAPI_GPT_IMAGE_ASPECT_RATIO_OPTIONS]
        : isMagicApi
        ? [...MAGICAPI_IMAGE_ASPECT_RATIO_OPTIONS]
        : isGrokImageModel
        ? GROK_IMAGE_ASPECT_RATIOS
        : STANDARD_IMAGE_ASPECT_RATIOS;
    const availableImageSizes: ImageSize[] = isJieKou && isJieKouGptImageModel
        ? [...JIEKOU_GPT_IMAGE_SIZE_OPTIONS]
        : isJieKou && (isJieKouGeminiImageModel || isJieKouNanoBananaImageModel)
            ? [...STANDARD_IMAGE_SIZE_OPTIONS]
        : isMagicApi && isOpenAiGptImageModel
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
    const availableImageQualities: ImageQuality[] = isJieKou && isJieKouGptImageModel
        ? ['low', 'medium', 'high']
        : isJieKou
            ? ['auto']
        : isVApi && isVApiGeminiImageModel
            ? ['auto']
        : isMagicApi && isOpenAiGptImageModel
        ? ['high']
        : [...OPENAI_GPT_IMAGE_QUALITY_OPTIONS];
    const derivedOpenAiGptImageAspectRatio = describeOpenAiGptImageAspectRatio(imageSize, aspectRatio);
    const displayedAspectRatio = grokUsesReferenceAspectRatio
        ? '参考图比例'
        : isJieKou && isJieKouGptImageModel
            ? aspectRatio
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

export function getVideoModelOptionsForProvider(providerId: AiProviderId = DEFAULT_AI_PROVIDER_ID): VideoModel[] {
    const models = getProviderVideoModels(providerId).filter(isVideoModel);
    return models.length > 0 ? models : [...VIDEO_MODEL_OPTIONS];
}
