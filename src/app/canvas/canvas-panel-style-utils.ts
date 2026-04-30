import type { CanvasElement } from '@/components/lovart/canvas-types';

export interface ElementPanelStyleOptions {
    fallbackHeight?: number;
    gap?: number;
}

export function getElementPanelStyle(
    element: Pick<CanvasElement, 'x' | 'y' | 'height'> | null | undefined,
    scale: number,
    pan: { x: number; y: number },
    options: ElementPanelStyleOptions = {},
) {
    if (!element) {
        return undefined;
    }

    const fallbackHeight = options.fallbackHeight ?? 300;
    const gap = options.gap ?? 20;

    return {
        left: `${(element.x * scale) + pan.x}px`,
        top: `${((element.y + (element.height || fallbackHeight)) * scale) + pan.y + gap}px`,
    };
}