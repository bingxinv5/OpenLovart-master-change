import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import { resolveActiveImagePreviewElement, resolveImagePreviewMetrics } from './CanvasMediaOverlays';

function makeElement(id: string, overrides: Partial<CanvasElement>): CanvasElement {
    return {
        id,
        type: 'image',
        x: 100,
        y: 120,
        width: 400,
        height: 200,
        content: 'imgref:test',
        ...overrides,
    };
}

describe('CanvasMediaOverlays', () => {
    it('resolves a low-zoom active image preview element only for visible images with content', () => {
        const elements = [
            makeElement('image-a', {}),
            makeElement('image-hidden', { hidden: true }),
            makeElement('video-a', { type: 'video' }),
        ];

        expect(resolveActiveImagePreviewElement(elements, 'image-a', 0.1)?.id).toBe('image-a');
        expect(resolveActiveImagePreviewElement(elements, 'image-a', 0.13)).toBeNull();
        expect(resolveActiveImagePreviewElement(elements, 'image-hidden', 0.1)).toBeNull();
        expect(resolveActiveImagePreviewElement(elements, 'video-a', 0.1)).toBeNull();
    });

    it('keeps image preview metrics inside the viewport and preserves aspect ratio bounds', () => {
        const metrics = resolveImagePreviewMetrics({
            element: makeElement('image-a', {}),
            scale: 0.1,
            pan: { x: 0, y: 0 },
            viewportSize: { width: 320, height: 240 },
        });

        expect(metrics).toEqual({
            width: 240,
            height: 144,
            left: 12,
            top: 50,
        });
    });
});