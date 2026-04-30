import type { CanvasElement } from './canvas-types';

export interface DragInitialPosition {
    id: string;
    x: number;
    y: number;
}

export interface DragFrameAdoptionAction {
    elementId: string;
    targetFrameId?: string;
}

export function getDragDescendantIds(parentId: string, elements: CanvasElement[]): Set<string> {
    const descendants = new Set<string>();
    const collect = (frameId: string) => {
        elements.forEach((candidate) => {
            if (candidate.parentFrameId === frameId && !descendants.has(candidate.id)) {
                descendants.add(candidate.id);
                if (candidate.type === 'frame') {
                    collect(candidate.id);
                }
            }
        });
    };
    collect(parentId);
    return descendants;
}

export function getTopLevelDraggedIds(initialPositions: DragInitialPosition[], elements: CanvasElement[]): string[] {
    return initialPositions
        .map((position) => position.id)
        .filter((id) => {
            const element = elements.find((candidate) => candidate.id === id);
            if (element?.parentFrameId && initialPositions.some((position) => position.id === element.parentFrameId)) {
                return false;
            }
            return true;
        });
}

export function resolveDragFrameAdoptions({
    elements,
    initialPositions,
    dragDelta,
}: {
    elements: CanvasElement[];
    initialPositions: DragInitialPosition[];
    dragDelta: { dx: number; dy: number };
}): DragFrameAdoptionAction[] {
    const committedPositions = new Map<string, { x: number; y: number }>();
    for (const position of initialPositions) {
        committedPositions.set(position.id, { x: position.x + dragDelta.dx, y: position.y + dragDelta.dy });
    }

    const topDragIds = getTopLevelDraggedIds(initialPositions, elements);
    const actions: DragFrameAdoptionAction[] = [];

    topDragIds.forEach((movedId) => {
        const element = elements.find((candidate) => candidate.id === movedId);
        if (!element || element.type === 'connector') {
            return;
        }

        const finalPosition = committedPositions.get(movedId);
        const finalX = finalPosition ? finalPosition.x : element.x;
        const finalY = finalPosition ? finalPosition.y : element.y;
        const elementCenterX = finalX + (element.width || 0) / 2;
        const elementCenterY = finalY + (element.height || 0) / 2;
        const ownDescendants = element.type === 'frame' ? getDragDescendantIds(element.id, elements) : new Set<string>();

        const targetCandidates = elements.filter((frame) =>
            frame.type === 'frame'
            && frame.id !== movedId
            && !ownDescendants.has(frame.id)
            && !topDragIds.includes(frame.id)
            && elementCenterX >= frame.x
            && elementCenterX <= frame.x + (frame.width || 0)
            && elementCenterY >= frame.y
            && elementCenterY <= frame.y + (frame.height || 0),
        );
        const targetFrame = targetCandidates.length > 0
            ? targetCandidates.reduce((best, frame) => {
                const area = (frame.width || 0) * (frame.height || 0);
                const bestArea = (best.width || 0) * (best.height || 0);
                return area < bestArea ? frame : best;
            })
            : null;

        if (targetFrame && targetFrame.id !== element.parentFrameId) {
            actions.push({ elementId: movedId, targetFrameId: targetFrame.id });
            return;
        }

        if (!targetFrame && element.parentFrameId) {
            actions.push({ elementId: movedId, targetFrameId: undefined });
        }
    });

    return actions;
}