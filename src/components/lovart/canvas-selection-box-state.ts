import type { CanvasElement } from './canvas-types';
import { getBoxSelectedElementIds } from './canvas-hit-test';

export interface SelectionBoxState {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    mode: 'replace' | 'add';
    fallbackSelectionId?: string;
}

export function createSelectionBox(params: {
    start: { x: number; y: number };
    current: { x: number; y: number };
    additiveSelection: boolean;
    fallbackSelectionId?: string;
}): SelectionBoxState {
    return {
        startX: params.start.x,
        startY: params.start.y,
        currentX: params.current.x,
        currentY: params.current.y,
        mode: params.additiveSelection ? 'add' : 'replace',
        fallbackSelectionId: params.fallbackSelectionId,
    };
}

export function updateSelectionBox(box: SelectionBoxState, current: { x: number; y: number }): SelectionBoxState {
    return { ...box, currentX: current.x, currentY: current.y };
}

export function getSelectionBoxCanvasRect(box: SelectionBoxState) {
    return {
        x1: Math.min(box.startX, box.currentX),
        y1: Math.min(box.startY, box.currentY),
        x2: Math.max(box.startX, box.currentX),
        y2: Math.max(box.startY, box.currentY),
        width: Math.abs(box.currentX - box.startX),
        height: Math.abs(box.currentY - box.startY),
    };
}

export function getSelectionBoxScreenRect(box: SelectionBoxState, params: {
    scale: number;
    pan: { x: number; y: number };
}) {
    const rect = getSelectionBoxCanvasRect(box);
    return {
        left: rect.x1 * params.scale + params.pan.x,
        top: rect.y1 * params.scale + params.pan.y,
        width: rect.width * params.scale,
        height: rect.height * params.scale,
    };
}

export function resolveSelectionBoxSelectedIds(params: {
    box: SelectionBoxState;
    elements: CanvasElement[];
    selectedIds: string[];
    clickThreshold?: number;
}): string[] {
    const { box, elements, selectedIds } = params;
    const clickThreshold = params.clickThreshold ?? 4;
    const rect = getSelectionBoxCanvasRect(box);
    const boxSelectedIds = getBoxSelectedElementIds(elements, rect);

    if (rect.width < clickThreshold && rect.height < clickThreshold && box.fallbackSelectionId) {
        return box.mode === 'add'
            ? Array.from(new Set([...selectedIds, box.fallbackSelectionId]))
            : [box.fallbackSelectionId];
    }

    return box.mode === 'add'
        ? Array.from(new Set([...selectedIds, ...boxSelectedIds]))
        : boxSelectedIds;
}