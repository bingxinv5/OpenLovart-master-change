import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import {
    patchCanvasElement,
    patchFrameElement,
    patchGenerationTargetElement,
    patchGeneratorElement,
    patchImageElement,
} from './canvas-element-patch';

function makeElement(overrides: Partial<CanvasElement>): CanvasElement {
    return {
        id: 'element-id',
        type: 'image',
        x: 0,
        y: 0,
        ...overrides,
    };
}

describe('canvas-element-patch', () => {
    it('patches common canvas attrs without changing element identity', () => {
        const image = makeElement({ type: 'image', x: 10, y: 20 });
        const patched = patchCanvasElement(image, { x: 30, width: 120 });

        expect(patched).toMatchObject({
            id: 'element-id',
            type: 'image',
            x: 30,
            y: 20,
            width: 120,
        });
    });

    it('patches only image elements with image fields', () => {
        const image = makeElement({ type: 'image', content: 'imgref:old' });
        const patched = patchImageElement(image, {
            content: 'imgref:new',
            selectedImageQuality: 'high',
        });

        expect(patched).toMatchObject({
            id: 'element-id',
            type: 'image',
            content: 'imgref:new',
            selectedImageQuality: 'high',
        });
        expectTypeOf(patched).toEqualTypeOf<CanvasElement>();

        const frame = makeElement({ type: 'frame', frameAutoLayout: true });
        expect(patchImageElement(frame, { content: 'imgref:ignored' })).toBe(frame);
    });

    it('patches generator families without accepting media elements', () => {
        const generator = makeElement({ type: 'storyboard-planner' });
        expect(patchGeneratorElement(generator, { savedPrompt: 'shot list' })).toMatchObject({
            type: 'storyboard-planner',
            savedPrompt: 'shot list',
        });

        const image = makeElement({ type: 'image' });
        expect(patchGeneratorElement(image, { savedPrompt: 'ignored' })).toBe(image);
    });

    it('patches frame fields only for frame elements', () => {
        const frame = makeElement({ type: 'frame', frameAutoLayoutGap: 12 });
        expect(patchFrameElement(frame, { frameAutoLayoutGap: 24 })).toMatchObject({
            type: 'frame',
            frameAutoLayoutGap: 24,
        });

        const image = makeElement({ type: 'image' });
        expect(patchFrameElement(image, { frameAutoLayoutGap: 24 })).toBe(image);
    });

    it('guards generation patches to generator and media elements', () => {
        const image = makeElement({ type: 'image' });
        const generator = makeElement({ type: 'video-generator' });
        const text = makeElement({ type: 'text', content: 'copy' });

        expect(patchGenerationTargetElement(image, { generatingTaskId: 'task-1' })).toMatchObject({
            type: 'image',
            generatingTaskId: 'task-1',
        });
        expect(patchGenerationTargetElement(generator, { generatingProgress: 50 })).toMatchObject({
            type: 'video-generator',
            generatingProgress: 50,
        });
        expect(patchGenerationTargetElement(text, { generatingTaskId: 'ignored' })).toBe(text);
    });
});
