import type { ElementChangeHandler } from './generator-panel-shared';
import { serializeReferenceImages, usePersistGeneratorValue } from './generator-panel-hooks';
import type {
    DomesticGenerationMode,
    GenerateCount,
    ImageAspectRatio,
    ImageModel,
    ImageQuality,
    ImageSize,
    VideoAspectRatio,
    VideoDurationValue,
    VideoModel,
    VideoResolution,
} from './generator-model-options';
import { serializeFrameImages, serializeReferenceMedia, type FrameImage, type PromptMentionBinding, type ReferenceMediaItem } from './generator-reference-view-model';

export function useImageGeneratorPanelPersistence({
    elementId,
    model,
    aspectRatio,
    generateCount,
    imageSize,
    quality,
    referenceImages,
    onElementChange,
}: {
    elementId: string;
    model: ImageModel;
    aspectRatio: ImageAspectRatio;
    generateCount: GenerateCount;
    imageSize: ImageSize;
    quality: ImageQuality;
    referenceImages: Array<File | string>;
    onElementChange?: ElementChangeHandler;
}) {
    usePersistGeneratorValue({ elementId, key: 'selectedModel', value: model, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedAspectRatio', value: aspectRatio, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedGenerateCount', value: generateCount, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedImageSize', value: imageSize, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedImageQuality', value: quality, onElementChange, skipInitial: true });
    usePersistGeneratorValue({
        elementId,
        key: 'savedReferenceImages',
        value: referenceImages,
        onElementChange,
        skipInitial: true,
        serialize: serializeReferenceImages,
    });
}

export function useVideoGeneratorPanelPersistence({
    elementId,
    model,
    aspectRatio,
    duration,
    enhancePrompt,
    domesticMode,
    isDomesticModel,
    resolution,
    generateAudio,
    prompt,
    promptMentionBindings,
    frameImages,
    referenceVideos,
    referenceAudios,
    onElementChange,
}: {
    elementId: string;
    model: VideoModel;
    aspectRatio: VideoAspectRatio;
    duration: VideoDurationValue;
    enhancePrompt: boolean;
    domesticMode: DomesticGenerationMode;
    isDomesticModel: boolean;
    resolution: VideoResolution;
    generateAudio: boolean;
    prompt: string;
    promptMentionBindings: PromptMentionBinding[];
    frameImages: FrameImage[];
    referenceVideos: ReferenceMediaItem[];
    referenceAudios: ReferenceMediaItem[];
    onElementChange?: ElementChangeHandler;
}) {
    usePersistGeneratorValue({ elementId, key: 'selectedModel', value: model, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedAspectRatio', value: aspectRatio, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedDuration', value: duration, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedEnhancePrompt', value: enhancePrompt, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedDomesticMode', value: isDomesticModel ? domesticMode : undefined, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedResolution', value: resolution, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'selectedGenerateAudio', value: generateAudio, onElementChange, skipInitial: true });
    usePersistGeneratorValue({ elementId, key: 'savedPrompt', value: prompt, onElementChange, skipInitial: true, debounceMs: 160 });
    usePersistGeneratorValue({
        elementId,
        key: 'savedPromptMentionBindings',
        value: promptMentionBindings,
        onElementChange,
        skipInitial: true,
        serialize: (value) => value.length > 0 ? JSON.stringify(value) : undefined,
        debounceMs: 120,
    });
    usePersistGeneratorValue({
        elementId,
        key: 'savedFrameImages',
        value: frameImages,
        onElementChange,
        skipInitial: true,
        serialize: serializeFrameImages,
    });
    usePersistGeneratorValue({
        elementId,
        key: 'savedReferenceVideos',
        value: referenceVideos,
        onElementChange,
        skipInitial: true,
        serialize: serializeReferenceMedia,
    });
    usePersistGeneratorValue({
        elementId,
        key: 'savedReferenceAudios',
        value: referenceAudios,
        onElementChange,
        skipInitial: true,
        serialize: serializeReferenceMedia,
    });
}