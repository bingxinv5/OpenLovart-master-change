import type { CanvasElement } from '@/components/lovart/canvas-types';
import { isCanvasGeneratedImageElement, isCanvasGeneratedVideoElement } from '@/components/lovart/canvas-types';
import { resolveGeneratorAspectRatioBounds } from '@/components/lovart/generator-aspect-ratio-layout';

export type CanvasGeneratorElementType = Extract<CanvasElement['type'], 'image-generator' | 'video-generator' | 'storyboard-planner'>;

export interface CanvasGeneratorCreationOptions {
    fallbackSettings?: Partial<CanvasElement>;
}

const GENERATOR_ASPECT_RATIO_FALLBACKS: Record<CanvasGeneratorElementType, { width: number; height: number }> = {
    'image-generator': { width: 400, height: 400 },
    'video-generator': { width: 400, height: 400 },
    'storyboard-planner': { width: 420, height: 320 },
};

type GeneratorSettingKey = keyof Pick<CanvasElement,
    | 'selectedModel'
    | 'selectedAspectRatio'
    | 'selectedImageSize'
    | 'selectedImageQuality'
    | 'selectedGenerateCount'
    | 'selectedDuration'
    | 'selectedEnhancePrompt'
    | 'selectedDomesticMode'
    | 'selectedResolution'
    | 'selectedGenerateAudio'
>;

const GENERATOR_SETTING_KEYS: Record<CanvasGeneratorElementType, readonly GeneratorSettingKey[]> = {
    'image-generator': ['selectedModel', 'selectedAspectRatio', 'selectedImageSize', 'selectedImageQuality', 'selectedGenerateCount'],
    'video-generator': ['selectedModel', 'selectedAspectRatio', 'selectedDuration', 'selectedEnhancePrompt', 'selectedDomesticMode', 'selectedResolution', 'selectedGenerateAudio'],
    'storyboard-planner': [],
};

export function isCanvasGeneratorElementType(type: CanvasElement['type']): type is CanvasGeneratorElementType {
    return type === 'image-generator' || type === 'video-generator' || type === 'storyboard-planner';
}

export function getGeneratorSettingsTypeForElement(element: CanvasElement | null | undefined): CanvasGeneratorElementType | null {
    if (!element) {
        return null;
    }

    if (isCanvasGeneratorElementType(element.type)) {
        return element.type;
    }

    if (isCanvasGeneratedImageElement(element)) {
        return 'image-generator';
    }

    if (isCanvasGeneratedVideoElement(element)) {
        return 'video-generator';
    }

    return null;
}

export function createEmptyRecentGeneratorSettingsMap(): Record<CanvasGeneratorElementType, Partial<CanvasElement>> {
    return {
        'image-generator': {},
        'video-generator': {},
        'storyboard-planner': {},
    };
}

export function pickGeneratorSettings(
    type: CanvasGeneratorElementType,
    source: Partial<CanvasElement>,
): Partial<CanvasElement> {
    const patch: Partial<CanvasElement> = {};
    const typedPatch = patch as Record<GeneratorSettingKey, CanvasElement[GeneratorSettingKey] | undefined>;

    GENERATOR_SETTING_KEYS[type].forEach((key) => {
        const value = source[key];
        if (value !== undefined) {
            typedPatch[key] = value;
        }
    });

    return patch;
}

export function findLatestGeneratorSettingsFromElements(
    type: CanvasGeneratorElementType,
    elements: CanvasElement[],
): Partial<CanvasElement> {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
        const element = elements[index];
        if (getGeneratorSettingsTypeForElement(element) !== type) {
            continue;
        }

        const settings = pickGeneratorSettings(type, element);
        if (Object.keys(settings).length > 0) {
            return settings;
        }
    }

    return {};
}

export function mergeGeneratorCreationAttrs(
    type: CanvasGeneratorElementType,
    attrs: Omit<CanvasElement, 'id' | 'type'>,
    recentSettings?: Partial<CanvasElement>,
    fallbackSettings?: Partial<CanvasElement>,
): Omit<CanvasElement, 'id' | 'type'> {
    if (!recentSettings && !fallbackSettings) {
        return attrs;
    }

    const next: Omit<CanvasElement, 'id' | 'type'> = {
        ...attrs,
    };
    const typedNext = next as Record<GeneratorSettingKey, CanvasElement[GeneratorSettingKey] | undefined>;

    GENERATOR_SETTING_KEYS[type].forEach((key) => {
        if (typedNext[key] !== undefined) {
            return;
        }

        const recentValue = recentSettings?.[key];
        if (recentValue !== undefined) {
            typedNext[key] = recentValue;
            return;
        }

        const fallbackValue = fallbackSettings?.[key];
        if (fallbackValue !== undefined) {
            typedNext[key] = fallbackValue;
        }
    });

    return next;
}

export function applyGeneratorCreationAspectRatioBounds(
    type: CanvasGeneratorElementType,
    attrs: Omit<CanvasElement, 'id' | 'type'>,
): Omit<CanvasElement, 'id' | 'type'> {
    const fallback = GENERATOR_ASPECT_RATIO_FALLBACKS[type];
    const bounds = resolveGeneratorAspectRatioBounds(attrs.selectedAspectRatio, attrs, {
        fallbackWidth: fallback.width,
        fallbackHeight: fallback.height,
    });

    if (!bounds) {
        return attrs;
    }

    return {
        ...attrs,
        ...bounds,
    };
}