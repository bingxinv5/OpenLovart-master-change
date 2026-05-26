import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import {
    applyGeneratorCreationAspectRatioBounds,
    createEmptyRecentGeneratorSettingsMap,
    findLatestGeneratorSettingsFromElements,
    getGeneratorSettingsTypeForElement,
    mergeGeneratorCreationAttrs,
    pickGeneratorSettings,
} from './canvas-generator-settings';

function makeElement(overrides: Partial<CanvasElement>): CanvasElement {
    return {
        id: overrides.id || 'element-id',
        type: overrides.type || 'image-generator',
        x: overrides.x || 0,
        y: overrides.y || 0,
        width: overrides.width || 400,
        height: overrides.height || 400,
        ...overrides,
    };
}

describe('canvas-generator-settings', () => {
    it('creates an empty recent-settings map for all generator types', () => {
        expect(createEmptyRecentGeneratorSettingsMap()).toEqual({
            'image-generator': {},
            'video-generator': {},
            'storyboard-planner': {},
        });
    });

    it('picks inheritable image-generator model, aspect ratio, and image size', () => {
        expect(pickGeneratorSettings('image-generator', {
            selectedModel: 'model-a',
            selectedAspectRatio: '16:9',
            selectedImageSize: '2K',
            selectedImageQuality: 'high',
            selectedGenerateCount: 2,
            savedPrompt: 'do not copy prompt',
        })).toEqual({
            selectedModel: 'model-a',
            selectedAspectRatio: '16:9',
            selectedImageSize: '2K',
            selectedImageQuality: 'high',
            selectedGenerateCount: 2,
        });
    });

    it('merges recent generator settings while preserving explicit attrs', () => {
        expect(mergeGeneratorCreationAttrs('video-generator', {
            x: 10,
            y: 20,
            width: 400,
            height: 400,
            selectedAspectRatio: '9:16',
        }, {
            selectedModel: 'recent-model',
            selectedAspectRatio: '21:9',
            selectedDuration: '8',
            selectedResolution: '1080p',
            selectedEnhancePrompt: false,
        }, {
            selectedModel: 'fallback-model',
            selectedAspectRatio: '4:3',
            selectedDuration: '5',
            selectedEnhancePrompt: true,
        })).toMatchObject({
            selectedModel: 'recent-model',
            selectedAspectRatio: '9:16',
            selectedDuration: '8',
            selectedResolution: '1080p',
            selectedEnhancePrompt: false,
        });
    });

    it('maps generated media elements to their generator setting type', () => {
        expect(getGeneratorSettingsTypeForElement(makeElement({
            type: 'image',
            content: 'imgref://generated',
            sourceGenerationTaskType: 'image',
        }))).toBe('image-generator');
        expect(getGeneratorSettingsTypeForElement(makeElement({
            type: 'video',
            content: 'https://example.com/generated.mp4',
            sourceGenerationTaskType: 'video',
        }))).toBe('video-generator');
        expect(getGeneratorSettingsTypeForElement(makeElement({
            type: 'image',
            content: 'imgref://imported',
        }))).toBeNull();
    });

    it('finds the latest same-type generator settings from existing elements', () => {
        const settings = findLatestGeneratorSettingsFromElements('image-generator', [
            makeElement({
                id: 'image-1',
                type: 'image-generator',
                selectedAspectRatio: '1:1',
                selectedImageSize: '1K',
            }),
            makeElement({
                id: 'video-1',
                type: 'video-generator',
                selectedAspectRatio: '16:9',
            }),
            makeElement({
                id: 'image-2',
                type: 'image',
                content: 'imgref://generated',
                sourceGenerationTaskType: 'image',
                selectedModel: 'latest-model',
                selectedAspectRatio: '21:9',
                selectedImageSize: '3360x1440',
                selectedImageQuality: 'high',
            }),
        ]);

        expect(settings).toEqual({
            selectedModel: 'latest-model',
            selectedAspectRatio: '21:9',
            selectedImageSize: '3360x1440',
            selectedImageQuality: 'high',
        });
    });

    it('finds latest generated video settings for new video generators', () => {
        const settings = findLatestGeneratorSettingsFromElements('video-generator', [
            makeElement({
                id: 'video-generator-1',
                type: 'video-generator',
                selectedModel: 'old-video-model',
                selectedAspectRatio: '16:9',
            }),
            makeElement({
                id: 'video-result-1',
                type: 'video',
                content: 'https://example.com/generated.mp4',
                sourceGenerationTaskType: 'video',
                selectedModel: 'latest-video-model',
                selectedAspectRatio: '9:16',
                selectedDuration: '8',
                selectedResolution: '1080p',
                selectedEnhancePrompt: true,
            }),
        ]);

        expect(settings).toEqual({
            selectedModel: 'latest-video-model',
            selectedAspectRatio: '9:16',
            selectedDuration: '8',
            selectedResolution: '1080p',
            selectedEnhancePrompt: true,
        });
    });

    it('applies aspect-ratio bounds during generator creation', () => {
        expect(applyGeneratorCreationAspectRatioBounds('image-generator', {
            x: 100,
            y: 50,
            width: 400,
            height: 400,
            selectedAspectRatio: '3:2',
        })).toMatchObject({
            x: 0,
            y: 50,
            width: 600,
            height: 400,
            selectedAspectRatio: '3:2',
        });
    });
});