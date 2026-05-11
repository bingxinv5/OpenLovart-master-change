import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import {
    resolveActiveImagePreviewElement,
    resolveImagePreviewMetrics,
    resolveMediaLightboxSize,
    resolveMediaPreviewElements,
} from './CanvasMediaOverlays';

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

    it('orders selected media previews left-to-right within rows and top-to-bottom across rows', () => {
        const elements = [
            makeElement('bottom-left', { x: 80, y: 420 }),
            makeElement('top-right', { x: 520, y: 112, type: 'video' }),
            makeElement('hidden-media', { x: 0, y: 0, hidden: true }),
            makeElement('top-left', { x: 120, y: 100 }),
            makeElement('no-content', { x: 60, y: 80, content: '' }),
        ];

        expect(resolveMediaPreviewElements(elements).map((element) => element.id)).toEqual([
            'top-left',
            'top-right',
            'bottom-left',
        ]);
    });

    it('sizes media lightbox previews close to the available viewport while preserving element aspect ratio', () => {
        const size = resolveMediaLightboxSize(makeElement('image-a', { width: 1600, height: 900 }), {
            width: 1440,
            height: 820,
        });

        expect(size).toEqual({
            width: 1372,
            height: 772,
            displayPixels: 8192,
        });
    });
});