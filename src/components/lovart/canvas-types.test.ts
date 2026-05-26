import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import {
    CANVAS_ELEMENT_TYPES,
    type CanvasElementUnion,
    type CanvasFrameElement,
    type CanvasImageElement,
    isCanvasDrawableElement,
    isCanvasElementOfType,
    isCanvasElementType,
    isCanvasGeneratedImageElement,
    isCanvasGeneratedVideoElement,
    isCanvasGenerationPanelElement,
    isCanvasGeneratorElement,
    isCanvasImageGenerationPanelElement,
    isCanvasMediaElement,
    isCanvasVideoGenerationPanelElement,
} from './canvas-types';

function makeElement(type: CanvasElement['type']): CanvasElement {
    return {
        id: type,
        type,
        x: 0,
        y: 0,
    };
}

describe('canvas-types guards', () => {
    it('recognizes every declared canvas element type and rejects unknown values', () => {
        expect(CANVAS_ELEMENT_TYPES.every((type) => isCanvasElementType(type))).toBe(true);
        expect(isCanvasElementType('unknown')).toBe(false);
        expect(isCanvasElementType(null)).toBe(false);
    });

    it('narrows a canvas element to a concrete type', () => {
        const image = makeElement('image');

        expect(isCanvasElementOfType(image, 'image')).toBe(true);
        expect(isCanvasElementOfType(image, 'video')).toBe(false);
        expect(isCanvasElementOfType(null, 'image')).toBe(false);
    });

    it('classifies generator, media, and drawable element families', () => {
        expect(isCanvasGeneratorElement(makeElement('image-generator'))).toBe(true);
        expect(isCanvasGeneratorElement(makeElement('video-generator'))).toBe(true);
        expect(isCanvasGeneratorElement(makeElement('storyboard-planner'))).toBe(true);
        expect(isCanvasGeneratorElement(makeElement('image'))).toBe(false);

        expect(isCanvasGeneratorElement({ ...makeElement('image'), content: 'imgref://generated', sourceGenerationTaskType: 'image' })).toBe(false);

        expect(isCanvasMediaElement(makeElement('image'))).toBe(true);
        expect(isCanvasMediaElement(makeElement('video'))).toBe(true);
        expect(isCanvasMediaElement(makeElement('frame'))).toBe(false);

        expect(isCanvasDrawableElement(makeElement('image'))).toBe(true);
        expect(isCanvasDrawableElement(makeElement('text'))).toBe(true);
        expect(isCanvasDrawableElement(makeElement('shape'))).toBe(true);
        expect(isCanvasDrawableElement(makeElement('path'))).toBe(true);
        expect(isCanvasDrawableElement(makeElement('connector'))).toBe(false);
    });

    it('classifies generated media separately from true generator nodes', () => {
        const uploadedImage = { ...makeElement('image'), content: 'imgref://uploaded' };
        const generatedImage = { ...makeElement('image'), content: 'imgref://generated', sourceGenerationTaskType: 'image' as const };
        const promptBackedImage = { ...makeElement('image'), content: 'imgref://prompt-backed', savedPrompt: '继续生成' };
        const uploadedVideo = { ...makeElement('video'), content: 'https://example.com/uploaded.mp4' };
        const generatedVideo = { ...makeElement('video'), content: 'https://example.com/generated.mp4', sourceGenerationTaskType: 'video' as const };

        expect(isCanvasGeneratedImageElement(uploadedImage)).toBe(false);
        expect(isCanvasGeneratedImageElement(generatedImage)).toBe(true);
        expect(isCanvasGeneratedImageElement(promptBackedImage)).toBe(true);
        expect(isCanvasGeneratedVideoElement(uploadedVideo)).toBe(false);
        expect(isCanvasGeneratedVideoElement(generatedVideo)).toBe(true);

        expect(isCanvasImageGenerationPanelElement(generatedImage)).toBe(true);
        expect(isCanvasVideoGenerationPanelElement(generatedVideo)).toBe(true);
        expect(isCanvasGenerationPanelElement(generatedImage)).toBe(true);
        expect(isCanvasGenerationPanelElement(generatedVideo)).toBe(true);
        expect(isCanvasGenerationPanelElement(uploadedImage)).toBe(false);
    });

    it('narrows to per-type union members without widening every canvas field', () => {
        const image: CanvasElement = { ...makeElement('image'), content: 'imgref:1' };
        const frame: CanvasElement = { ...makeElement('frame'), frameAutoLayoutMode: 'grid' };

        if (isCanvasElementOfType(image, 'image')) {
            expectTypeOf(image).toEqualTypeOf<CanvasImageElement>();
            expectTypeOf(image).toMatchTypeOf<CanvasElementUnion>();
            expectTypeOf(image.content).toEqualTypeOf<string | undefined>();
            expectTypeOf(image.selectedImageQuality).toEqualTypeOf<string | undefined>();
        }

        if (isCanvasElementOfType(frame, 'frame')) {
            expectTypeOf(frame).toEqualTypeOf<CanvasFrameElement>();
            expectTypeOf(frame).toMatchTypeOf<CanvasElementUnion>();
            expectTypeOf(frame.frameAutoLayoutMode).toEqualTypeOf<'flow' | 'grid' | 'row' | 'column' | undefined>();
        }
    });
});