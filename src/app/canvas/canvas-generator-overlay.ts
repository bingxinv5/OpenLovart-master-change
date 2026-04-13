import type { CSSProperties } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';

type GeneratorElementType = 'image-generator' | 'video-generator' | 'storyboard-planner';

export type SelectedGeneratorElement = CanvasElement & {
    type: GeneratorElementType;
};

export function getSelectedGeneratorElement(
    elements: CanvasElement[],
    selectedIds: string[],
    options: {
        isDraggingElement: boolean;
        canvasSelectMode: string | null;
    },
): SelectedGeneratorElement | null {
    if (selectedIds.length !== 1 || options.isDraggingElement || options.canvasSelectMode) {
        return null;
    }

    const selectedElement = elements.find((element) => element.id === selectedIds[0]);
    if (!selectedElement) {
        return null;
    }

    if (selectedElement.type !== 'image-generator' && selectedElement.type !== 'video-generator' && selectedElement.type !== 'storyboard-planner') {
        return null;
    }

    return selectedElement as SelectedGeneratorElement;
}

export function getGeneratorOverlayStyle(
    element: Pick<CanvasElement, 'type' | 'x' | 'y' | 'height'>,
    scale: number,
    pan: { x: number; y: number },
): CSSProperties {
    const fallbackHeight = element.type === 'video-generator'
        ? 300
        : element.type === 'storyboard-planner'
            ? 320
            : 400;
    const left = (element.x * scale) + pan.x;
    const top = ((element.y + (element.height || fallbackHeight)) * scale) + pan.y + 20;

    return {
        left: `${left}px`,
        top: `${top}px`,
    };
}
