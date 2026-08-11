export const CANVAS_PAN_REBASE_DISTANCE_PX = 192;

export type CanvasPanPoint = { x: number; y: number };

export type CanvasMouseDownIntent = 'pan' | 'primary' | 'ignore';

export function resolveCanvasMouseDownIntent(button: number, activeTool: string): CanvasMouseDownIntent {
    if (button === 1 || (button === 0 && activeTool === 'hand')) return 'pan';
    if (button === 0) return 'primary';
    return 'ignore';
}

export function isCanvasPrimaryButton(button: number) {
    return button === 0;
}

export function shouldRebaseCanvasPan(
    anchor: CanvasPanPoint,
    nextPan: CanvasPanPoint,
    threshold = CANVAS_PAN_REBASE_DISTANCE_PX,
) {
    return Math.max(
        Math.abs(nextPan.x - anchor.x),
        Math.abs(nextPan.y - anchor.y),
    ) >= threshold;
}

export function isSameCanvasPan(left: CanvasPanPoint, right: CanvasPanPoint) {
    return left.x === right.x && left.y === right.y;
}
