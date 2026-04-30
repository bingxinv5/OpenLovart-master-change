import type { AlignGuide } from './canvas-alignment';
import type { CanvasElement } from './canvas-types';

type MoveSnapPoint = 'left' | 'center' | 'right';
type MoveSnapVerticalPoint = 'top' | 'center' | 'bottom';
type ResizeSnapEdgeX = 'left' | 'right';
type ResizeSnapEdgeY = 'top' | 'bottom';
type VerticalAlignGuide = AlignGuide & { type: 'v' };
type HorizontalAlignGuide = AlignGuide & { type: 'h' };

export type MoveSnapLockState = {
    x: { point: MoveSnapPoint; target: number; guide: VerticalAlignGuide } | null;
    y: { point: MoveSnapVerticalPoint; target: number; guide: HorizontalAlignGuide } | null;
};

export type ResizeSnapLockState = {
    x: { edge: ResizeSnapEdgeX; target: number; guide: VerticalAlignGuide } | null;
    y: { edge: ResizeSnapEdgeY; target: number; guide: HorizontalAlignGuide } | null;
};

export interface ComputeMoveSnapInput {
    draggedElement: CanvasElement | null | undefined;
    draggedInitial: { id: string; x: number; y: number } | undefined;
    draggedIds: Set<string>;
    dx: number;
    dy: number;
    otherElements: CanvasElement[];
    threshold: number;
    releaseThreshold: number;
    snapDisabled: boolean;
    lockState: MoveSnapLockState;
}

export function createEmptyMoveSnapLockState(): MoveSnapLockState {
    return { x: null, y: null };
}

export function createEmptyResizeSnapLockState(): ResizeSnapLockState {
    return { x: null, y: null };
}

export function computeMoveSnap({
    draggedElement,
    draggedInitial,
    draggedIds,
    dx,
    dy,
    otherElements,
    threshold,
    releaseThreshold,
    snapDisabled,
    lockState,
}: ComputeMoveSnapInput): { snapDx: number; snapDy: number; guides: AlignGuide[]; nextLockState: MoveSnapLockState } {
    if (!draggedElement || !draggedInitial) {
        return { snapDx: 0, snapDy: 0, guides: [], nextLockState: lockState };
    }

    const draggedWidth = draggedElement.width || 0;
    const draggedHeight = draggedElement.height || 0;
    const rawX = draggedInitial.x + dx;
    const rawY = draggedInitial.y + dy;
    const draggedLeft = rawX;
    const draggedCenterX = rawX + draggedWidth / 2;
    const draggedRight = rawX + draggedWidth;
    const draggedTop = rawY;
    const draggedCenterY = rawY + draggedHeight / 2;
    const draggedBottom = rawY + draggedHeight;
    const snapTargets = otherElements.filter((element) => !draggedIds.has(element.id) && element.type !== 'connector');
    const nextLockState: MoveSnapLockState = {
        x: lockState.x,
        y: lockState.y,
    };
    let snapDx = 0;
    let snapDy = 0;
    const guides: AlignGuide[] = [];

    let bestSnapX: { delta: number; target: number; point: MoveSnapPoint; guide: VerticalAlignGuide | null } = { delta: 0, target: 0, point: 'left', guide: null };
    let bestSnapXDist = threshold + 1;
    let bestSnapY: { delta: number; target: number; point: MoveSnapVerticalPoint; guide: HorizontalAlignGuide | null } = { delta: 0, target: 0, point: 'top', guide: null };
    let bestSnapYDist = threshold + 1;

    snapTargets.forEach((other) => {
        const otherWidth = other.width || 0;
        const otherHeight = other.height || 0;
        const otherLeft = other.x;
        const otherCenterX = other.x + otherWidth / 2;
        const otherRight = other.x + otherWidth;
        const otherTop = other.y;
        const otherCenterY = other.y + otherHeight / 2;
        const otherBottom = other.y + otherHeight;

        const xPairs: Array<{ point: MoveSnapPoint; dragged: number; target: number }> = [
            { point: 'left', dragged: draggedLeft, target: otherLeft },
            { point: 'left', dragged: draggedLeft, target: otherCenterX },
            { point: 'left', dragged: draggedLeft, target: otherRight },
            { point: 'center', dragged: draggedCenterX, target: otherLeft },
            { point: 'center', dragged: draggedCenterX, target: otherCenterX },
            { point: 'center', dragged: draggedCenterX, target: otherRight },
            { point: 'right', dragged: draggedRight, target: otherLeft },
            { point: 'right', dragged: draggedRight, target: otherCenterX },
            { point: 'right', dragged: draggedRight, target: otherRight },
        ];

        xPairs.forEach(({ point, dragged, target }) => {
            const dist = Math.abs(dragged - target);
            if (dist <= threshold && dist < bestSnapXDist) {
                bestSnapXDist = dist;
                bestSnapX = {
                    delta: target - dragged,
                    target,
                    point,
                    guide: {
                        type: 'v',
                        pos: target,
                        start: Math.min(rawY, otherTop),
                        end: Math.max(rawY + draggedHeight, otherBottom),
                    },
                };
            }
        });

        const yPairs: Array<{ point: MoveSnapVerticalPoint; dragged: number; target: number }> = [
            { point: 'top', dragged: draggedTop, target: otherTop },
            { point: 'top', dragged: draggedTop, target: otherCenterY },
            { point: 'top', dragged: draggedTop, target: otherBottom },
            { point: 'center', dragged: draggedCenterY, target: otherTop },
            { point: 'center', dragged: draggedCenterY, target: otherCenterY },
            { point: 'center', dragged: draggedCenterY, target: otherBottom },
            { point: 'bottom', dragged: draggedBottom, target: otherTop },
            { point: 'bottom', dragged: draggedBottom, target: otherCenterY },
            { point: 'bottom', dragged: draggedBottom, target: otherBottom },
        ];

        yPairs.forEach(({ point, dragged, target }) => {
            const dist = Math.abs(dragged - target);
            if (dist <= threshold && dist < bestSnapYDist) {
                bestSnapYDist = dist;
                bestSnapY = {
                    delta: target - dragged,
                    target,
                    point,
                    guide: {
                        type: 'h',
                        pos: target,
                        start: Math.min(rawX, otherLeft),
                        end: Math.max(rawX + draggedWidth, otherRight),
                    },
                };
            }
        });
    });

    if (snapDisabled) {
        nextLockState.x = null;
        nextLockState.y = null;
    } else {
        const lockedX = nextLockState.x;
        if (lockedX) {
            const lockedPoint = lockedX.point === 'left' ? draggedLeft : lockedX.point === 'center' ? draggedCenterX : draggedRight;
            if (Math.abs(lockedPoint - lockedX.target) <= releaseThreshold) {
                snapDx = lockedX.target - lockedPoint;
                guides.push(lockedX.guide);
            } else {
                nextLockState.x = null;
            }
        }

        if (!nextLockState.x && bestSnapXDist <= threshold) {
            snapDx = bestSnapX.delta;
            if (bestSnapX.guide) {
                guides.push(bestSnapX.guide);
                nextLockState.x = {
                    point: bestSnapX.point,
                    target: bestSnapX.target,
                    guide: bestSnapX.guide,
                };
            }
        }

        const lockedY = nextLockState.y;
        if (lockedY) {
            const lockedPoint = lockedY.point === 'top' ? draggedTop : lockedY.point === 'center' ? draggedCenterY : draggedBottom;
            if (Math.abs(lockedPoint - lockedY.target) <= releaseThreshold) {
                snapDy = lockedY.target - lockedPoint;
                guides.push(lockedY.guide);
            } else {
                nextLockState.y = null;
            }
        }

        if (!nextLockState.y && bestSnapYDist <= threshold) {
            snapDy = bestSnapY.delta;
            if (bestSnapY.guide) {
                guides.push(bestSnapY.guide);
                nextLockState.y = {
                    point: bestSnapY.point,
                    target: bestSnapY.target,
                    guide: bestSnapY.guide,
                };
            }
        }

        if (bestSnapXDist > threshold && !guides.some((guide) => guide.type === 'v')) {
            nextLockState.x = null;
        }
        if (bestSnapYDist > threshold && !guides.some((guide) => guide.type === 'h')) {
            nextLockState.y = null;
        }
    }

    const finalDragX = rawX + snapDx;
    const finalDragY = rawY + snapDy;
    const finalDragRight = finalDragX + draggedWidth;
    const finalDragBottom = finalDragY + draggedHeight;
    const hSorted = [...snapTargets].sort((left, right) => left.x - right.x);
    const vSorted = [...snapTargets].sort((left, right) => left.y - right.y);

    for (let index = 0; index < hSorted.length - 1; index += 1) {
        const first = hSorted[index];
        const second = hSorted[index + 1];
        const gap = second.x - (first.x + (first.width || 0));
        if (gap <= 0) continue;

        const gapDragToFirst = first.x - finalDragRight;
        if (Math.abs(gapDragToFirst - gap) <= threshold && gapDragToFirst > 0) {
            const snapAdjustment = gapDragToFirst - gap;
            if (Math.abs(snapAdjustment) < Math.abs(snapDx) || bestSnapXDist > threshold) {
                guides.push({ type: 'h', pos: (finalDragY + finalDragBottom) / 2, start: finalDragRight, end: first.x });
                guides.push({ type: 'h', pos: (first.y + first.y + (first.height || 0)) / 2, start: first.x + (first.width || 0), end: second.x });
            }
        }

        const gapSecondToDrag = finalDragX - (second.x + (second.width || 0));
        if (Math.abs(gapSecondToDrag - gap) <= threshold && gapSecondToDrag > 0) {
            guides.push({ type: 'h', pos: (first.y + first.y + (first.height || 0)) / 2, start: first.x + (first.width || 0), end: second.x });
            guides.push({ type: 'h', pos: (finalDragY + finalDragBottom) / 2, start: second.x + (second.width || 0), end: finalDragX });
        }
    }

    for (let index = 0; index < vSorted.length - 1; index += 1) {
        const first = vSorted[index];
        const second = vSorted[index + 1];
        const gap = second.y - (first.y + (first.height || 0));
        if (gap <= 0) continue;

        const gapDragToFirst = first.y - finalDragBottom;
        if (Math.abs(gapDragToFirst - gap) <= threshold && gapDragToFirst > 0) {
            guides.push({ type: 'v', pos: (finalDragX + finalDragRight) / 2, start: finalDragBottom, end: first.y });
            guides.push({ type: 'v', pos: (first.x + first.x + (first.width || 0)) / 2, start: first.y + (first.height || 0), end: second.y });
        }

        const gapSecondToDrag = finalDragY - (second.y + (second.height || 0));
        if (Math.abs(gapSecondToDrag - gap) <= threshold && gapSecondToDrag > 0) {
            guides.push({ type: 'v', pos: (first.x + first.x + (first.width || 0)) / 2, start: first.y + (first.height || 0), end: second.y });
            guides.push({ type: 'v', pos: (finalDragX + finalDragRight) / 2, start: second.y + (second.height || 0), end: finalDragY });
        }
    }

    return { snapDx, snapDy, guides, nextLockState };
}

export interface ComputeResizeSnapInput {
    elementId: string;
    handle: string;
    bounds: { x: number; y: number; width: number; height: number };
    targets: CanvasElement[];
    threshold: number;
    releaseThreshold: number;
    snapDisabled: boolean;
    lockState: ResizeSnapLockState;
}

export function computeResizeSnap({
    elementId,
    handle,
    bounds,
    targets,
    threshold,
    releaseThreshold,
    snapDisabled,
    lockState,
}: ComputeResizeSnapInput): { bounds: { x: number; y: number; width: number; height: number }; guides: AlignGuide[]; nextLockState: ResizeSnapLockState } {
    const activeLeft = handle.includes('w');
    const activeRight = handle.includes('e');
    const activeTop = handle.includes('n');
    const activeBottom = handle.includes('s');
    const nextBounds = {
        x: bounds.x,
        y: bounds.y,
        width: Math.max(10, bounds.width),
        height: Math.max(10, bounds.height),
    };
    const tentativeLeft = nextBounds.x;
    const tentativeRight = nextBounds.x + nextBounds.width;
    const tentativeTop = nextBounds.y;
    const tentativeBottom = nextBounds.y + nextBounds.height;
    const guides: AlignGuide[] = [];
    const nextLockState: ResizeSnapLockState = {
        x: lockState.x,
        y: lockState.y,
    };
    const resizeTargets = targets.filter((target) => target.id !== elementId && target.type !== 'connector');

    let bestSnapX: { dist: number; delta: number; target: number; edge: ResizeSnapEdgeX; guide: VerticalAlignGuide | null } = {
        dist: threshold + 1,
        delta: 0,
        target: 0,
        edge: activeLeft ? 'left' : 'right',
        guide: null,
    };
    let bestSnapY: { dist: number; delta: number; target: number; edge: ResizeSnapEdgeY; guide: HorizontalAlignGuide | null } = {
        dist: threshold + 1,
        delta: 0,
        target: 0,
        edge: activeTop ? 'top' : 'bottom',
        guide: null,
    };

    resizeTargets.forEach((other) => {
        const otherWidth = other.width || 0;
        const otherHeight = other.height || 0;
        const otherLeft = other.x;
        const otherRight = other.x + otherWidth;
        const otherTop = other.y;
        const otherBottom = other.y + otherHeight;
        const otherCenterX = other.x + otherWidth / 2;
        const otherCenterY = other.y + otherHeight / 2;
        const xTargets = [otherLeft, otherCenterX, otherRight];
        const yTargets = [otherTop, otherCenterY, otherBottom];

        if (activeLeft || activeRight) {
            const movingX = activeLeft ? tentativeLeft : tentativeRight;
            xTargets.forEach((targetX) => {
                const dist = Math.abs(movingX - targetX);
                if (dist < bestSnapX.dist) {
                    bestSnapX = {
                        dist,
                        delta: targetX - movingX,
                        target: targetX,
                        edge: activeLeft ? 'left' : 'right',
                        guide: {
                            type: 'v',
                            pos: targetX,
                            start: Math.min(tentativeTop, otherTop),
                            end: Math.max(tentativeBottom, otherBottom),
                        },
                    };
                }
            });
        }

        if (activeTop || activeBottom) {
            const movingY = activeTop ? tentativeTop : tentativeBottom;
            yTargets.forEach((targetY) => {
                const dist = Math.abs(movingY - targetY);
                if (dist < bestSnapY.dist) {
                    bestSnapY = {
                        dist,
                        delta: targetY - movingY,
                        target: targetY,
                        edge: activeTop ? 'top' : 'bottom',
                        guide: {
                            type: 'h',
                            pos: targetY,
                            start: Math.min(tentativeLeft, otherLeft),
                            end: Math.max(tentativeRight, otherRight),
                        },
                    };
                }
            });
        }
    });

    if (snapDisabled) {
        nextLockState.x = null;
        nextLockState.y = null;
    } else {
        const lockedResizeX = nextLockState.x;
        if (lockedResizeX) {
            const movingX = lockedResizeX.edge === 'left' ? tentativeLeft : tentativeRight;
            if (Math.abs(movingX - lockedResizeX.target) <= releaseThreshold) {
                const lockedDelta = lockedResizeX.target - movingX;
                if (lockedResizeX.edge === 'left') {
                    nextBounds.x += lockedDelta;
                    nextBounds.width -= lockedDelta;
                } else {
                    nextBounds.width += lockedDelta;
                }
                guides.push(lockedResizeX.guide);
            } else {
                nextLockState.x = null;
            }
        }

        if (!nextLockState.x && bestSnapX.dist <= threshold) {
            if (activeLeft) {
                nextBounds.x += bestSnapX.delta;
                nextBounds.width -= bestSnapX.delta;
            } else if (activeRight) {
                nextBounds.width += bestSnapX.delta;
            }
            if (bestSnapX.guide) {
                guides.push(bestSnapX.guide);
                nextLockState.x = {
                    edge: bestSnapX.edge,
                    target: bestSnapX.target,
                    guide: bestSnapX.guide,
                };
            }
        }

        const lockedResizeY = nextLockState.y;
        if (lockedResizeY) {
            const movingY = lockedResizeY.edge === 'top' ? tentativeTop : tentativeBottom;
            if (Math.abs(movingY - lockedResizeY.target) <= releaseThreshold) {
                const lockedDelta = lockedResizeY.target - movingY;
                if (lockedResizeY.edge === 'top') {
                    nextBounds.y += lockedDelta;
                    nextBounds.height -= lockedDelta;
                } else {
                    nextBounds.height += lockedDelta;
                }
                guides.push(lockedResizeY.guide);
            } else {
                nextLockState.y = null;
            }
        }

        if (!nextLockState.y && bestSnapY.dist <= threshold) {
            if (activeTop) {
                nextBounds.y += bestSnapY.delta;
                nextBounds.height -= bestSnapY.delta;
            } else if (activeBottom) {
                nextBounds.height += bestSnapY.delta;
            }
            if (bestSnapY.guide) {
                guides.push(bestSnapY.guide);
                nextLockState.y = {
                    edge: bestSnapY.edge,
                    target: bestSnapY.target,
                    guide: bestSnapY.guide,
                };
            }
        }

        if (bestSnapX.dist > threshold && !guides.some((guide) => guide.type === 'v')) {
            nextLockState.x = null;
        }
        if (bestSnapY.dist > threshold && !guides.some((guide) => guide.type === 'h')) {
            nextLockState.y = null;
        }
    }

    nextBounds.width = Math.max(10, nextBounds.width);
    nextBounds.height = Math.max(10, nextBounds.height);

    return { bounds: nextBounds, guides, nextLockState };
}