export interface ResizeStartBounds {
    elementX: number;
    elementY: number;
    width: number;
    height: number;
    aspectRatio?: number;
}

export interface CanvasResizeBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function calculateResizeBounds({
    start,
    handle,
    delta,
    preserveAspectRatio,
}: {
    start: ResizeStartBounds;
    handle: string;
    delta: { dx: number; dy: number };
    preserveAspectRatio: boolean;
}): CanvasResizeBounds {
    let x = start.elementX;
    let y = start.elementY;
    let width = start.width;
    let height = start.height;

    if (handle.includes('e')) width = start.width + delta.dx;
    if (handle.includes('s')) height = start.height + delta.dy;
    if (handle.includes('w')) {
        width = start.width - delta.dx;
        x = start.elementX + delta.dx;
    }
    if (handle.includes('n')) {
        height = start.height - delta.dy;
        y = start.elementY + delta.dy;
    }

    if (preserveAspectRatio && start.aspectRatio) {
        if (handle.includes('e') || handle.includes('w')) {
            height = width / start.aspectRatio;
            if (handle.includes('n')) y = start.elementY + (start.height - height);
        } else if (handle.includes('n') || handle.includes('s')) {
            width = height * start.aspectRatio;
            if (handle.includes('w')) x = start.elementX + (start.width - width);
            if (handle === 'n') y = start.elementY + (start.height - height);
        }
    }

    return { x, y, width, height };
}