export type CanvasViewportPoint = { x: number; y: number };
export type CanvasViewportSize = { width: number; height: number };
export type CanvasViewportBounds = { minX: number; minY: number; width: number; height: number };
export type CanvasViewportRect = { left: number; top: number } | null | undefined;

export const CANVAS_DEFAULT_SCALE = 1;
export const CANVAS_MIN_SCALE = 0.05;
export const CANVAS_MAX_SCALE = 8;
export const CANVAS_FIT_ALL_MAX_SCALE = 2;
export const CANVAS_ZOOM_IN_FACTOR = 1.15;
export const CANVAS_ZOOM_OUT_FACTOR = 0.85;
export const CANVAS_ZOOM_BUTTON_STEP = 0.1;

const LOD_SENSITIVE_ZOOM_PERCENT_ROUNDS = new Set([12, 18, 25, 40]);

export function clampCanvasScale(scale: number, fallback = CANVAS_DEFAULT_SCALE): number {
    const resolvedScale = Number.isFinite(scale) ? scale : fallback;
    return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, resolvedScale));
}

export function zoomCanvasScaleByFactor(scale: number, factor: number): number {
    return clampCanvasScale(scale * factor);
}

export function offsetCanvasScale(scale: number, delta: number): number {
    return clampCanvasScale(scale + delta);
}

export function formatCanvasZoomPercent(scale: number): string {
    const clampedScale = clampCanvasScale(scale);
    const percent = clampedScale * 100;
    const roundedPercent = Math.round(percent);
    if (LOD_SENSITIVE_ZOOM_PERCENT_ROUNDS.has(roundedPercent)) {
        return `${percent.toFixed(1)}%`;
    }

    return `${roundedPercent}%`;
}

export interface ClientPointToCanvasInput {
    clientX: number;
    clientY: number;
    rect?: CanvasViewportRect;
    pan: CanvasViewportPoint;
    scale: number;
}

export function clientPointToCanvas({ clientX, clientY, rect, pan, scale }: ClientPointToCanvasInput): CanvasViewportPoint {
    const offsetX = rect ? clientX - rect.left : clientX;
    const offsetY = rect ? clientY - rect.top : clientY;
    return {
        x: (offsetX - pan.x) / scale,
        y: (offsetY - pan.y) / scale,
    };
}

export interface ComputeFitViewportInput {
    bounds: CanvasViewportBounds;
    viewportSize: CanvasViewportSize;
    minScale: number;
    maxScale: number;
    maxFitScale?: number;
    padding?: number;
}

export function computeFitViewport({
    bounds,
    viewportSize,
    minScale,
    maxScale,
    maxFitScale = 2.5,
    padding = 80,
}: ComputeFitViewportInput): { scale: number; pan: CanvasViewportPoint } {
    const safeWidth = Math.max(1, viewportSize.width - padding * 2);
    const safeHeight = Math.max(1, viewportSize.height - padding * 2);
    const nextScale = Math.min(
        maxScale,
        Math.max(
            minScale,
            Math.min(safeWidth / Math.max(bounds.width, 1), safeHeight / Math.max(bounds.height, 1), maxFitScale),
        ),
    );

    return {
        scale: nextScale,
        pan: {
            x: (viewportSize.width - bounds.width * nextScale) / 2 - bounds.minX * nextScale,
            y: (viewportSize.height - bounds.height * nextScale) / 2 - bounds.minY * nextScale,
        },
    };
}