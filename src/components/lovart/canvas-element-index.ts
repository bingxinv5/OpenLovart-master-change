import type { CanvasConnectorElement, CanvasElement } from './canvas-types';
import { isCanvasElementOfType } from './canvas-types';

export interface CanvasElementIndex {
    elementMap: Map<string, CanvasElement>;
    connectorElements: CanvasConnectorElement[];
    frameChildCounts: Map<string, number>;
    hiddenElementIds: string[];
}

export function buildCanvasElementIndex(elements: CanvasElement[]): CanvasElementIndex {
    const elementMap = new Map<string, CanvasElement>();
    const connectorElements: CanvasConnectorElement[] = [];
    const frameChildCounts = new Map<string, number>();
    const hiddenElementIds: string[] = [];

    for (const element of elements) {
        elementMap.set(element.id, element);

        if (element.hidden) {
            hiddenElementIds.push(element.id);
            continue;
        }

        if (isCanvasElementOfType(element, 'connector')) {
            connectorElements.push(element);
        }

        if (element.parentFrameId) {
            frameChildCounts.set(element.parentFrameId, (frameChildCounts.get(element.parentFrameId) || 0) + 1);
        }
    }

    return {
        elementMap,
        connectorElements,
        frameChildCounts,
        hiddenElementIds,
    };
}