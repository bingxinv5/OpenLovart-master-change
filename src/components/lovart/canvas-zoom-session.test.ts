import { describe, expect, it } from 'vitest';
import {
    CANVAS_WHEEL_MAX_DELTA,
    CANVAS_ZOOM_MAX_FRAME_SCALE_RATIO,
    getCanvasWheelZoomFactor,
    getCanvasZoomTargetViewport,
    isCanvasZoomViewportSettled,
    mergeCanvasWheelDeltas,
    normalizeCanvasWheelDelta,
    shouldCommitCanvasZoom,
    stepCanvasZoomViewport,
} from './canvas-zoom-session';

describe('canvas zoom session', () => {
    it('normalizes pixel, line and page wheel input with a per-frame cap', () => {
        expect(normalizeCanvasWheelDelta(120, 0)).toBe(120);
        expect(normalizeCanvasWheelDelta(3, 1)).toBe(120);
        expect(normalizeCanvasWheelDelta(1, 2, 960)).toBe(CANVAS_WHEEL_MAX_DELTA);
        expect(normalizeCanvasWheelDelta(-999, 0)).toBe(-CANVAS_WHEEL_MAX_DELTA);
        expect(mergeCanvasWheelDeltas(180, 180)).toBe(CANVAS_WHEEL_MAX_DELTA);
    });

    it('maps one mouse detent to balanced 10 percent zoom', () => {
        expect(getCanvasWheelZoomFactor(120)).toBeCloseTo(0.9, 10);
        expect(getCanvasWheelZoomFactor(-120)).toBeCloseTo(1 / 0.9, 10);
    });

    it('keeps the canvas point under the cursor anchored and clamps scale', () => {
        const current = { scale: 1, pan: { x: 100, y: 80 } };
        const screen = { x: 500, y: 380 };
        const result = getCanvasZoomTargetViewport(current, current.scale, 120, screen);
        expect(result.viewport.scale).toBeCloseTo(0.9, 10);
        expect(result.anchor.canvas).toEqual({ x: 400, y: 300 });
        expect(result.viewport.pan.x + result.anchor.canvas.x * result.viewport.scale).toBeCloseTo(screen.x, 10);
        expect(result.viewport.pan.y + result.anchor.canvas.y * result.viewport.scale).toBeCloseTo(screen.y, 10);

        expect(getCanvasZoomTargetViewport({ scale: 0.05, pan: { x: 0, y: 0 } }, 0.05, 240, screen).viewport.scale).toBe(0.05);
        expect(getCanvasZoomTargetViewport({ scale: 8, pan: { x: 0, y: 0 } }, 8, -240, screen).viewport.scale).toBe(8);
    });

    it('damps toward the target without exceeding four percent per frame', () => {
        const current = { scale: 1, pan: { x: 0, y: 0 } };
        const target = { scale: 0.5, pan: { x: 250, y: 200 } };
        const anchor = { screen: { x: 500, y: 400 }, canvas: { x: 500, y: 400 } };
        const next = stepCanvasZoomViewport(current, target, anchor, 16.67);
        expect(Math.abs(next.scale / current.scale - 1)).toBeLessThanOrEqual(CANVAS_ZOOM_MAX_FRAME_SCALE_RATIO + 1e-10);
        expect(next.pan.x + anchor.canvas.x * next.scale).toBeCloseTo(anchor.screen.x, 10);
        expect(next.pan.y + anchor.canvas.y * next.scale).toBeCloseTo(anchor.screen.y, 10);
    });

    it('commits only after idle and convergence', () => {
        const target = { scale: 0.9, pan: { x: 10, y: 20 } };
        expect(isCanvasZoomViewportSettled({ scale: 0.9001, pan: { x: 10.1, y: 20.1 } }, target)).toBe(true);
        expect(shouldCommitCanvasZoom(1000, 1099, true)).toBe(false);
        expect(shouldCommitCanvasZoom(1000, 1100, false)).toBe(false);
        expect(shouldCommitCanvasZoom(1000, 1100, true)).toBe(true);
    });
});
