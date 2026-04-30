import type { CSSProperties } from 'react';
import type { CanvasElement, CanvasGeneratorElement } from '@/components/lovart/canvas-types';
import { isCanvasGeneratorElement } from '@/components/lovart/canvas-types';

/** @deprecated Use CanvasGeneratorElement from canvas-types directly. */
export type SelectedGeneratorElement = CanvasGeneratorElement;

export function getSelectedGeneratorElement(
    elements: CanvasElement[],
    selectedIds: string[],
    options: {
        isDraggingElement: boolean;
        canvasSelectMode: string | null;
    },
): CanvasGeneratorElement | null {
    if (selectedIds.length !== 1 || options.isDraggingElement || options.canvasSelectMode) {
        return null;
    }

    const selectedElement = elements.find((element) => element.id === selectedIds[0]);
    if (!isCanvasGeneratorElement(selectedElement)) {
        return null;
    }

    return selectedElement;
}

export function getGeneratorOverlayStyle(
    element: Pick<CanvasElement, 'type' | 'x' | 'y' | 'width' | 'height'>,
    scale: number,
    pan: { x: number; y: number },
): CSSProperties {
    const fallbackWidth = element.type === 'storyboard-planner' ? 560 : 400;
    const fallbackHeight = element.type === 'video-generator'
        ? 300
        : element.type === 'storyboard-planner'
            ? 320
            : 400;
    const panelWidth = element.type === 'storyboard-planner' ? 560 : 620;
    const viewportMargin = 16;
    const anchorGap = 20;
    const elementLeft = (element.x * scale) + pan.x;
    const elementTop = (element.y * scale) + pan.y;
    const elementWidth = (element.width || fallbackWidth) * scale;
    const elementHeight = (element.height || fallbackHeight) * scale;
    const requestedLeft = elementLeft + (elementWidth / 2) - (panelWidth / 2);
    const requestedTopBelow = elementTop + elementHeight + anchorGap;

    const left = typeof window === 'undefined'
        ? requestedLeft
        : Math.max(viewportMargin, Math.min(requestedLeft, window.innerWidth - panelWidth - viewportMargin));

    const top = requestedTopBelow;

    return {
        left: `${left}px`,
        top: `${top}px`,
    };
}
