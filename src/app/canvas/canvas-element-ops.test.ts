import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CanvasElement, CanvasFrameElement, CanvasImageElement } from '@/components/lovart/canvas-types';
import { buildAutoGroupFrame, isValidImageElement } from './canvas-element-ops';

function makeElement(id: string, attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id,
        type: 'shape',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        ...attrs,
    };
}

describe('canvas-element-ops typed helpers', () => {
    it('narrows valid image elements to the image union member with content', () => {
        const element = makeElement('image-1', { type: 'image', content: 'imgref:1' });

        expect(isValidImageElement(element)).toBe(true);
        if (isValidImageElement(element)) {
            expectTypeOf(element).toMatchTypeOf<CanvasImageElement & { content: string }>();
            expect(element.content).toBe('imgref:1');
        }

        expect(isValidImageElement(makeElement('image-empty', { type: 'image' }))).toBe(false);
        expect(isValidImageElement(makeElement('video-1', { type: 'video', content: 'video.mp4' }))).toBe(false);
    });

    it('returns a frame union member when building auto group frames', () => {
        const result = buildAutoGroupFrame([
            makeElement('shape-1', { x: 20, y: 30, width: 80, height: 60 }),
            makeElement('connector-1', { type: 'connector', x: 0, y: 0, width: 999, height: 999 }),
        ], 'Group', () => 'frame-1');

        expect(result?.frame).toMatchObject({
            id: 'frame-1',
            type: 'frame',
            x: 0,
            y: 10,
            width: 120,
            height: 100,
            frameName: 'Group',
            groupFrame: true,
        });

        if (result) {
            expectTypeOf(result.frame).toEqualTypeOf<CanvasFrameElement>();
        }
    });
});