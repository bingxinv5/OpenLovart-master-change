import type { CSSProperties } from 'react';
import type { CanvasElement, CanvasGenerationPanelElement } from '@/components/lovart/canvas-types';
import { isCanvasGenerationPanelElement } from '@/components/lovart/canvas-types';
import { getCanvasElementRenderSize } from '@/lib/canvas-element-bounds';
import { canvasPointToScreen, getCanvasRenderPan } from '@/components/lovart/canvas-viewport-utils';

/** @deprecated Use CanvasGenerationPanelElement from canvas-types directly. */
export type SelectedGeneratorElement = CanvasGenerationPanelElement;

const GENERATOR_PANEL_WIDTH = 620;
const STORYBOARD_PANEL_WIDTH = 560;
const GENERATOR_PANEL_FIXED_SCALE = 1.16;

function getGeneratorPanelScale(type: CanvasElement['type']) {
    return type === 'storyboard-planner' ? 1 : GENERATOR_PANEL_FIXED_SCALE;
}

function getViewportWidth(override: number | undefined) {
    if (Number.isFinite(override) && (override ?? 0) > 0) {
        return override as number;
    }

    return typeof window === 'undefined' ? null : window.innerWidth;
}

function resolveElementDimension(value: number, fallback: number) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getSelectedGeneratorElement(
    elements: CanvasElement[],
    selectedIds: string[],
    options: {
        isDraggingElement: boolean;
        canvasSelectMode: string | null;
    },
): CanvasGenerationPanelElement | null {
    if (selectedIds.length !== 1 || options.isDraggingElement || options.canvasSelectMode) {
        return null;
    }

    const selectedElement = elements.find((element) => element.id === selectedIds[0]);
    if (!isCanvasGenerationPanelElement(selectedElement)) {
        return null;
    }

    return selectedElement;
}

export function getGeneratorOverlayStyle(
    element: Pick<CanvasElement, 'type' | 'x' | 'y' | 'width' | 'height'>,
    scale: number,
    pan: { x: number; y: number },
    options: { viewportWidth?: number; devicePixelRatio?: number } = {},
): CSSProperties {
    const fallbackWidth = element.type === 'storyboard-planner' ? 560 : 400;
    const fallbackHeight = element.type === 'storyboard-planner'
        ? 320
        : 400;
    const renderSize = getCanvasElementRenderSize(element);
    const panelWidth = element.type === 'storyboard-planner' ? STORYBOARD_PANEL_WIDTH : GENERATOR_PANEL_WIDTH;
    const panelScale = getGeneratorPanelScale(element.type);
    const panelVisualWidth = panelWidth * panelScale;
    const viewportMargin = 16;
    const anchorGap = 20;
    const renderPan = getCanvasRenderPan(pan, options.devicePixelRatio);
    const elementScreenPoint = canvasPointToScreen({ x: element.x, y: element.y }, scale, renderPan);
    const elementLeft = elementScreenPoint.x;
    const elementTop = elementScreenPoint.y;
    const elementWidth = resolveElementDimension(renderSize.width, fallbackWidth) * scale;
    const elementHeight = resolveElementDimension(renderSize.height, fallbackHeight) * scale;
    const requestedLeft = elementLeft + (elementWidth / 2) - (panelVisualWidth / 2);
    const requestedTopBelow = elementTop + elementHeight + anchorGap;
    const viewportWidth = getViewportWidth(options.viewportWidth);

    const left = viewportWidth
        ? Math.max(viewportMargin, Math.min(requestedLeft, viewportWidth - panelVisualWidth - viewportMargin))
        : requestedLeft;

    const top = requestedTopBelow;

    return {
        left: `${left}px`,
        top: `${top}px`,
        ...(panelScale !== 1 ? {
            transform: `scale(${panelScale})`,
            transformOrigin: 'top left',
        } : {}),
    };
}
