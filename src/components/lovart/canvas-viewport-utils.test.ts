import { describe, expect, it } from 'vitest';
import { clampCanvasScale, clientPointToCanvas, computeFitViewport, formatCanvasZoomPercent, offsetCanvasScale, zoomCanvasScaleByFactor } from './canvas-viewport-utils';

describe('canvas-viewport-utils', () => {
    it('maps client coordinates through container offset, pan, and scale', () => {
        expect(clientPointToCanvas({
            clientX: 260,
            clientY: 190,
            rect: { left: 100, top: 50 },
            pan: { x: 40, y: -10 },
            scale: 2,
        })).toEqual({ x: 60, y: 75 });
    });

    it('falls back to raw client coordinates without a container rect', () => {
        expect(clientPointToCanvas({
            clientX: 120,
            clientY: 80,
            pan: { x: 20, y: 10 },
            scale: 0.5,
        })).toEqual({ x: 200, y: 140 });
    });

    it('computes centered pan and clamped scale for bounds fitting', () => {
        const result = computeFitViewport({
            bounds: { minX: 100, minY: 50, width: 400, height: 200 },
            viewportSize: { width: 1000, height: 800 },
            minScale: 0.1,
            maxScale: 4,
            maxFitScale: 2.5,
            padding: 80,
        });

        expect(result.scale).toBe(2.1);
        expect(result.pan).toEqual({ x: -130, y: 85 });
    });

    it('keeps degenerate bounds inside the configured scale limits', () => {
        const result = computeFitViewport({
            bounds: { minX: 0, minY: 0, width: 0, height: 0 },
            viewportSize: { width: 320, height: 240 },
            minScale: 0.2,
            maxScale: 3,
            maxFitScale: 10,
            padding: 80,
        });

        expect(result.scale).toBe(3);
        expect(result.pan).toEqual({ x: 160, y: 120 });
    });

    it('uses shared canvas scale bounds for direct and relative zoom changes', () => {
        expect(clampCanvasScale(0)).toBe(0.05);
        expect(clampCanvasScale(10)).toBe(8);
        expect(clampCanvasScale(Number.NaN)).toBe(1);
        expect(zoomCanvasScaleByFactor(7.5, 1.15)).toBe(8);
        expect(offsetCanvasScale(0.08, -0.1)).toBe(0.05);
    });

    it('adds one decimal near LOD-sensitive zoom percentages', () => {
        expect(formatCanvasZoomPercent(0.246)).toBe('24.6%');
        expect(formatCanvasZoomPercent(0.254)).toBe('25.4%');
        expect(formatCanvasZoomPercent(0.4)).toBe('40.0%');
        expect(formatCanvasZoomPercent(1)).toBe('100%');
    });
});