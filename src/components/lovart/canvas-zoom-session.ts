import { clampCanvasScale } from './canvas-viewport-utils';

export const CANVAS_WHEEL_NOTCH_DELTA = 120;
export const CANVAS_WHEEL_NOTCH_SCALE = 0.9;
export const CANVAS_WHEEL_MAX_DELTA = 240;
export const CANVAS_ZOOM_IDLE_COMMIT_MS = 100;
export const CANVAS_ZOOM_DAMPING_TIME_CONSTANT_MS = 30;
export const CANVAS_ZOOM_MAX_FRAME_SCALE_RATIO = 0.04;
export const CANVAS_ZOOM_OVERVIEW_ELEMENT_THRESHOLD = 64;

export type CanvasZoomViewport = {
    scale: number;
    pan: { x: number; y: number };
};

export type CanvasZoomAnchor = {
    screen: { x: number; y: number };
    canvas: { x: number; y: number };
};

export function normalizeCanvasWheelDelta(
    deltaY: number,
    deltaMode: number,
    pageSize = 800,
) {
    if (!Number.isFinite(deltaY)) return 0;
    const modeMultiplier = deltaMode === 1
        ? 40
        : deltaMode === 2
            ? Math.max(1, pageSize)
            : 1;
    const normalized = deltaY * modeMultiplier;
    return Math.max(-CANVAS_WHEEL_MAX_DELTA, Math.min(CANVAS_WHEEL_MAX_DELTA, normalized));
}

export function mergeCanvasWheelDeltas(currentDelta: number, nextDelta: number) {
    return Math.max(
        -CANVAS_WHEEL_MAX_DELTA,
        Math.min(CANVAS_WHEEL_MAX_DELTA, currentDelta + nextDelta),
    );
}

export function getCanvasWheelZoomFactor(normalizedDelta: number) {
    return Math.exp(
        Math.log(CANVAS_WHEEL_NOTCH_SCALE) * normalizedDelta / CANVAS_WHEEL_NOTCH_DELTA,
    );
}

export function getCanvasZoomAnchor(
    viewport: CanvasZoomViewport,
    screen: { x: number; y: number },
): CanvasZoomAnchor {
    return {
        screen,
        canvas: {
            x: (screen.x - viewport.pan.x) / viewport.scale,
            y: (screen.y - viewport.pan.y) / viewport.scale,
        },
    };
}

export function getCanvasZoomTargetViewport(
    currentVisualViewport: CanvasZoomViewport,
    currentTargetScale: number,
    normalizedDelta: number,
    screen: { x: number; y: number },
) {
    const anchor = getCanvasZoomAnchor(currentVisualViewport, screen);
    const scale = clampCanvasScale(currentTargetScale * getCanvasWheelZoomFactor(normalizedDelta));
    return {
        anchor,
        viewport: {
            scale,
            pan: {
                x: anchor.screen.x - anchor.canvas.x * scale,
                y: anchor.screen.y - anchor.canvas.y * scale,
            },
        },
    };
}

export function stepCanvasZoomViewport(
    current: CanvasZoomViewport,
    target: CanvasZoomViewport,
    anchor: CanvasZoomAnchor,
    elapsedMs: number,
) {
    const safeElapsedMs = Math.max(1, Math.min(34, elapsedMs));
    const dampingAlpha = 1 - Math.exp(-safeElapsedMs / CANVAS_ZOOM_DAMPING_TIME_CONSTANT_MS);
    const dampedScale = current.scale + (target.scale - current.scale) * dampingAlpha;
    const maxScaleDelta = Math.max(0.0001, current.scale * CANVAS_ZOOM_MAX_FRAME_SCALE_RATIO);
    const scaleDelta = Math.max(-maxScaleDelta, Math.min(maxScaleDelta, dampedScale - current.scale));
    const scale = clampCanvasScale(current.scale + scaleDelta);

    return {
        scale,
        pan: {
            x: anchor.screen.x - anchor.canvas.x * scale,
            y: anchor.screen.y - anchor.canvas.y * scale,
        },
    };
}

export function isCanvasZoomViewportSettled(current: CanvasZoomViewport, target: CanvasZoomViewport) {
    const relativeScaleError = Math.abs(current.scale - target.scale) / Math.max(target.scale, 0.0001);
    return relativeScaleError <= 0.0005
        && Math.hypot(current.pan.x - target.pan.x, current.pan.y - target.pan.y) <= 0.5;
}

export function shouldCommitCanvasZoom(lastInputAt: number, now: number, settled: boolean) {
    return settled && now - lastInputAt >= CANVAS_ZOOM_IDLE_COMMIT_MS;
}
