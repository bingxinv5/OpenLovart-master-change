import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';

export type PanPosition = { x: number; y: number };
export type ViewportSize = { width: number; height: number };

export function getViewportSize(fallbackWidth = 1280, fallbackHeight = 800): ViewportSize {
    if (typeof window === 'undefined') {
        return { width: fallbackWidth, height: fallbackHeight };
    }

    return {
        width: window.innerWidth,
        height: window.innerHeight,
    };
}

export function getElementDisplaySize(
    element: CanvasElement,
    fallbackWidth = 400,
    fallbackHeight = 320,
) {
    return {
        width: element.width || fallbackWidth,
        height: element.height || fallbackHeight,
    };
}

export function getCenteredPanForElement(
    element: CanvasElement,
    scale: number,
    viewport = getViewportSize(),
): PanPosition {
    const { width, height } = getElementDisplaySize(element);

    return {
        x: viewport.width / 2 - (element.x + width / 2) * scale,
        y: viewport.height / 2 - (element.y + height / 2) * scale,
    };
}

export function isElementWithinViewport(
    element: CanvasElement,
    scale: number,
    pan: PanPosition,
    options?: {
        padding?: number;
        viewport?: ViewportSize;
    },
) {
    const viewport = options?.viewport ?? getViewportSize();
    const padding = options?.padding ?? 96;
    const { width, height } = getElementDisplaySize(element);
    const left = element.x * scale + pan.x;
    const top = element.y * scale + pan.y;
    const right = left + width * scale;
    const bottom = top + height * scale;

    return (
        left >= padding &&
        top >= padding &&
        right <= viewport.width - padding &&
        bottom <= viewport.height - padding
    );
}

export function clearHighlightTimeout(timeoutRef: MutableRefObject<number | null>) {
    if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    }
}

export function scheduleResultHighlight(params: {
    elementId: string;
    timeoutRef: MutableRefObject<number | null>;
    setHighlightedResultId: Dispatch<SetStateAction<string | null>>;
    duration?: number;
}) {
    const { elementId, timeoutRef, setHighlightedResultId, duration = 1800 } = params;

    setHighlightedResultId(elementId);
    clearHighlightTimeout(timeoutRef);

    timeoutRef.current = window.setTimeout(() => {
        setHighlightedResultId((current) => (current === elementId ? null : current));
        timeoutRef.current = null;
    }, duration);
}
