import { describe, expect, it } from 'vitest';
import { getAspectRatioValue, resolveCropSourceRect, sanitizeCropRect } from './image-worker-crop-operation';

describe('image-worker-crop-operation', () => {
    it('resolves crop aspect ratio presets', () => {
        expect(getAspectRatioValue('1:1', 1.25)).toBe(1);
        expect(getAspectRatioValue('16:9', 1)).toBe(16 / 9);
        expect(getAspectRatioValue('free', 1.25)).toBe(1.25);
    });

    it('clamps normalized crop rects to the source bounds', () => {
        expect(sanitizeCropRect({ x: -0.2, y: 0.5, width: 2, height: 0.8 })).toEqual({
            x: 0,
            y: 0.5,
            width: 1,
            height: 0.5,
        });
    });

    it('resolves explicit normalized crop rects to source pixels', () => {
        expect(resolveCropSourceRect({
            sourceWidth: 1000,
            sourceHeight: 500,
            aspectRatio: 'free',
            zoom: 100,
            focusX: 0,
            focusY: 0,
            cropRect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        })).toEqual({
            sourceX: 100,
            sourceY: 100,
            width: 300,
            height: 200,
        });
    });

    it('resolves zoom and focus based crop rects', () => {
        expect(resolveCropSourceRect({
            sourceWidth: 1000,
            sourceHeight: 500,
            aspectRatio: '1:1',
            zoom: 50,
            focusX: 100,
            focusY: -100,
        })).toEqual({
            sourceX: 750,
            sourceY: 0,
            width: 250,
            height: 250,
        });
    });
});
