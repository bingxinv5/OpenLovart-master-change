import type { CanvasElement } from './canvas-types';
import { isCanvasElementOfType } from './canvas-types';

export type CanvasSelectionBounds = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};

export function getPointHitBounds(element: CanvasElement) {
    return {
        left: element.x,
        top: element.y,
        right: element.x + (element.width ?? (element.type === 'text' ? 200 : element.type === 'mark' ? 32 : 0)),
        bottom: element.y + (element.height ?? (element.type === 'text' ? 40 : element.type === 'mark' ? 32 : 0)),
    };
}

export function elementContainsCanvasPoint(element: CanvasElement, x: number, y: number) {
    if (element.hidden || isCanvasElementOfType(element, 'connector')) {
        return false;
    }

    const bounds = getPointHitBounds(element);
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

export function getTopElementAtCanvasPoint(elements: CanvasElement[], x: number, y: number) {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
        const element = elements[index];
        if (element.type !== 'frame' && elementContainsCanvasPoint(element, x, y)) {
            return element;
        }
    }

    for (let index = elements.length - 1; index >= 0; index -= 1) {
        const element = elements[index];
        if (isCanvasElementOfType(element, 'frame') && elementContainsCanvasPoint(element, x, y)) {
            return element;
        }
    }

    return null;
}

export function shouldIncludeElementInBoxSelection(element: CanvasElement, bounds: CanvasSelectionBounds) {
    if (isCanvasElementOfType(element, 'connector') || element.hidden) {
        return false;
    }

    const elementRight = element.x + (element.width || 0);
    const elementBottom = element.y + (element.height || 0);

    if (isCanvasElementOfType(element, 'frame')) {
        return element.x >= bounds.x1
            && elementRight <= bounds.x2
            && element.y >= bounds.y1
            && elementBottom <= bounds.y2;
    }

    return element.x < bounds.x2
        && elementRight > bounds.x1
        && element.y < bounds.y2
        && elementBottom > bounds.y1;
}

export function getBoxSelectedElementIds(elements: CanvasElement[], bounds: CanvasSelectionBounds) {
    return elements
        .filter((element) => shouldIncludeElementInBoxSelection(element, bounds))
        .map((element) => element.id);
}

export function getInnermostFrameAtCanvasPoint(
    elements: CanvasElement[],
    x: number,
    y: number,
    options: { excludedFrameIds?: Set<string> } = {},
) {
    const excludedFrameIds = options.excludedFrameIds ?? new Set<string>();
    const candidateFrames = elements.filter((frame) => (
        frame.type === 'frame'
        && !excludedFrameIds.has(frame.id)
        && x >= frame.x
        && x <= frame.x + (frame.width || 0)
        && y >= frame.y
        && y <= frame.y + (frame.height || 0)
    ));

    return candidateFrames.length > 0
        ? candidateFrames.reduce((best, frame) => {
            const area = (frame.width || 0) * (frame.height || 0);
            const bestArea = (best.width || 0) * (best.height || 0);
            return area < bestArea ? frame : best;
        })
        : null;
}