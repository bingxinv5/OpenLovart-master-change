import { useEffect, useRef } from 'react';
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
    const hasMountedRef = useRef(false);
    const lastElementIdRef = useRef(elementId);
    const lastSettingsRef = useRef({ model, aspectRatio, generateCount, imageSize, quality });

    useEffect(() => {
        const nextSettings = { model, aspectRatio, generateCount, imageSize, quality };

        if (lastElementIdRef.current !== elementId) {
            lastElementIdRef.current = elementId;
            hasMountedRef.current = false;
            lastSettingsRef.current = nextSettings;
        }

        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            lastSettingsRef.current = nextSettings;
            return;
        }

        const previousSettings = lastSettingsRef.current;
        const patch: Record<string, unknown> = {};

        if (!Object.is(previousSettings.model, model)) {
            patch.selectedModel = model;
        }
        if (!Object.is(previousSettings.aspectRatio, aspectRatio)) {
            patch.selectedAspectRatio = aspectRatio;
        }
        if (!Object.is(previousSettings.generateCount, generateCount)) {
            patch.selectedGenerateCount = generateCount;
        }
        if (!Object.is(previousSettings.imageSize, imageSize)) {
            patch.selectedImageSize = imageSize;
        }
        if (!Object.is(previousSettings.quality, quality)) {
            patch.selectedImageQuality = quality;
        }

        lastSettingsRef.current = nextSettings;

        if (Object.keys(patch).length === 0) {
            return;
        }

        onElementChange?.(elementId, patch);
    }, [aspectRatio, elementId, generateCount, imageSize, model, onElementChange, quality]);

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