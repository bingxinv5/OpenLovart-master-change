export type CanvasViewportPoint = { x: number; y: number };
export type CanvasViewportSize = { width: number; height: number };
export type CanvasViewportBounds = { minX: number; minY: number; width: number; height: number };
export type CanvasViewportRect = { left: number; top: number } | null | undefined;

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