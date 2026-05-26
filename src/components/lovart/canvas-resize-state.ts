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
    minWidth = 16,
    minHeight = 16,
}: {
    start: ResizeStartBounds;
    handle: string;
    delta: { dx: number; dy: number };
    preserveAspectRatio: boolean;
    minWidth?: number;
    minHeight?: number;
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

    if (preserveAspectRatio && start.aspectRatio) {
        const aspectRatio = start.aspectRatio;
        const resolvedMinWidth = Math.max(minWidth, minHeight * aspectRatio);
        if (width < resolvedMinWidth) {
            width = resolvedMinWidth;
            height = width / aspectRatio;
        }
        const resolvedMinHeight = Math.max(minHeight, minWidth / aspectRatio);
        if (height < resolvedMinHeight) {
            height = resolvedMinHeight;
            width = height * aspectRatio;
        }
        if (handle.includes('w')) x = start.elementX + (start.width - width);
        if (handle.includes('n')) y = start.elementY + (start.height - height);
    } else {
        if (width < minWidth) {
            width = minWidth;
            if (handle.includes('w')) x = start.elementX + (start.width - width);
        }
        if (height < minHeight) {
            height = minHeight;
            if (handle.includes('n')) y = start.elementY + (start.height - height);
        }
    }

    return { x, y, width, height };
}