/**
 * Pure computation functions for canvas element alignment, distribution,
 * layout-selection, and z-order reordering.
 *
 * Extracted from CanvasArea.tsx — all functions are side-effect-free and
 * operate on plain element arrays.
 */

import type { CanvasElement } from './canvas-types';
import type { CanvasElementPatchAttrs } from './canvas-element-patch';

// ── Types ──────────────────────────────────────────────────────────────

export type AlignGuide = {
    type: 'h' | 'v';
    pos: number;
    start: number;
    end: number;
};

export type AlignmentDirection = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';
export type DistributionAxis = 'horizontal' | 'vertical';
export type LayoutSelectionMode = 'row' | 'column' | 'grid';

export interface ElementBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

export interface ElementChange {
    id: string;
    attrs: CanvasElementPatchAttrs;
}

// ── Pure helpers ───────────────────────────────────────────────────────

/** Compute axis-aligned bounding box for a set of elements. */
export function getElementsBounds(els: CanvasElement[]): ElementBounds | null {
    if (els.length === 0) return null;
    const minX = Math.min(...els.map(el => el.x));
    const minY = Math.min(...els.map(el => el.y));
    const maxX = Math.max(...els.map(el => el.x + (el.width || 0)));
    const maxY = Math.max(...els.map(el => el.y + (el.height || 0)));
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Sort elements by their center position along the given axis. */
export function sortByAxisCenter(els: CanvasElement[], axis: 'horizontal' | 'vertical'): CanvasElement[] {
    return [...els].sort((a, b) => {
        if (axis === 'horizontal') {
            return (a.x + (a.width || 0) / 2) - (b.x + (b.width || 0) / 2);
        }
        return (a.y + (a.height || 0) / 2) - (b.y + (b.height || 0) / 2);
    });
}

/** Recursively collect all descendant IDs of a parent frame. */
export function getDescendantIds(parentId: string, allElements: CanvasElement[]): string[] {
    const result: string[] = [];
    const collect = (pid: string) => {
        allElements.forEach(c => {
            if (c.parentFrameId === pid) {
                result.push(c.id);
                if (c.type === 'frame') collect(c.id);
            }
        });
    };
    collect(parentId);
    return result;
}

// ── Alignment ──────────────────────────────────────────────────────────

/** Compute position changes + guide lines to align elements along a direction. */
export function computeAlignment(
    selectedElements: CanvasElement[],
    direction: AlignmentDirection,
): { changes: ElementChange[]; guides: AlignGuide[] } {
    if (selectedElements.length < 2) return { changes: [], guides: [] };

    const bounds = getElementsBounds(selectedElements);
    if (!bounds) return { changes: [], guides: [] };

    const changes: ElementChange[] = [];

    selectedElements.forEach(el => {
        const w = el.width || 0;
        const h = el.height || 0;
        switch (direction) {
            case 'left':
                changes.push({ id: el.id, attrs: { x: bounds.minX } });
                break;
            case 'center-h':
                changes.push({ id: el.id, attrs: { x: bounds.minX + (bounds.width - w) / 2 } });
                break;
            case 'right':
                changes.push({ id: el.id, attrs: { x: bounds.maxX - w } });
                break;
            case 'top':
                changes.push({ id: el.id, attrs: { y: bounds.minY } });
                break;
            case 'center-v':
                changes.push({ id: el.id, attrs: { y: bounds.minY + (bounds.height - h) / 2 } });
                break;
            case 'bottom':
                changes.push({ id: el.id, attrs: { y: bounds.maxY - h } });
                break;
        }
    });

    const guides: AlignGuide[] = [];
    if (direction === 'left') guides.push({ type: 'v', pos: bounds.minX, start: bounds.minY - 10, end: bounds.maxY + 10 });
    if (direction === 'right') guides.push({ type: 'v', pos: bounds.maxX, start: bounds.minY - 10, end: bounds.maxY + 10 });
    if (direction === 'center-h') guides.push({ type: 'v', pos: bounds.minX + bounds.width / 2, start: bounds.minY - 10, end: bounds.maxY + 10 });
    if (direction === 'top') guides.push({ type: 'h', pos: bounds.minY, start: bounds.minX - 10, end: bounds.maxX + 10 });
    if (direction === 'bottom') guides.push({ type: 'h', pos: bounds.maxY, start: bounds.minX - 10, end: bounds.maxX + 10 });
    if (direction === 'center-v') guides.push({ type: 'h', pos: bounds.minY + bounds.height / 2, start: bounds.minX - 10, end: bounds.maxX + 10 });

    return { changes, guides };
}

// ── Distribution ───────────────────────────────────────────────────────

/** Compute position changes + guide line for distributing elements evenly. */
export function computeDistribution(
    selectedElements: CanvasElement[],
    axis: DistributionAxis,
): { changes: ElementChange[]; guides: AlignGuide[] } {
    if (selectedElements.length < 3) return { changes: [], guides: [] };

    const changes: ElementChange[] = [];

    if (axis === 'horizontal') {
        const sorted = sortByAxisCenter(selectedElements, 'horizontal');
        const totalWidth = sorted.reduce((sum, el) => sum + (el.width || 0), 0);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const totalSpace = (last.x + (last.width || 0)) - first.x;
        const gap = Math.max(0, (totalSpace - totalWidth) / (sorted.length - 1));
        let currentX = first.x;
        sorted.forEach((el, i) => {
            if (i === 0) { currentX += (el.width || 0) + gap; return; }
            if (i === sorted.length - 1 && gap > 0) return;
            changes.push({ id: el.id, attrs: { x: currentX } });
            currentX += (el.width || 0) + gap;
        });
    } else {
        const sorted = sortByAxisCenter(selectedElements, 'vertical');
        const totalHeight = sorted.reduce((sum, el) => sum + (el.height || 0), 0);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const totalSpace = (last.y + (last.height || 0)) - first.y;
        const gap = Math.max(0, (totalSpace - totalHeight) / (sorted.length - 1));
        let currentY = first.y;
        sorted.forEach((el, i) => {
            if (i === 0) { currentY += (el.height || 0) + gap; return; }
            if (i === sorted.length - 1 && gap > 0) return;
            changes.push({ id: el.id, attrs: { y: currentY } });
            currentY += (el.height || 0) + gap;
        });
    }

    const bounds = getElementsBounds(selectedElements);
    const guides: AlignGuide[] = [];
    if (bounds) {
        if (axis === 'horizontal') {
            guides.push({ type: 'h', pos: bounds.minY + bounds.height / 2, start: bounds.minX, end: bounds.maxX });
        } else {
            guides.push({ type: 'v', pos: bounds.minX + bounds.width / 2, start: bounds.minY, end: bounds.maxY });
        }
    }

    return { changes, guides };
}

// ── Equal spacing ──────────────────────────────────────────────────────

/** Compute position changes for equal-gap spacing between elements. */
export function computeEqualSpacing(
    selectedElements: CanvasElement[],
    axis: DistributionAxis,
    spacing?: number,
): ElementChange[] {
    if (selectedElements.length < 2) return [];

    const changes: ElementChange[] = [];

    if (axis === 'horizontal') {
        const sorted = sortByAxisCenter(selectedElements, 'horizontal');
        const gap = spacing ?? 20;
        let currentX = sorted[0].x;
        sorted.forEach((el, i) => {
            if (i === 0) { currentX += (el.width || 0) + gap; return; }
            changes.push({ id: el.id, attrs: { x: currentX } });
            currentX += (el.width || 0) + gap;
        });
    } else {
        const sorted = sortByAxisCenter(selectedElements, 'vertical');
        const gap = spacing ?? 20;
        let currentY = sorted[0].y;
        sorted.forEach((el, i) => {
            if (i === 0) { currentY += (el.height || 0) + gap; return; }
            changes.push({ id: el.id, attrs: { y: currentY } });
            currentY += (el.height || 0) + gap;
        });
    }

    return changes;
}

// ── Layout selection (row / column / grid) ─────────────────────────────

/** Compute position changes + guide line for re-laying-out a selection. */
export function computeLayoutSelection(
    allElements: CanvasElement[],
    selectedIds: string[],
    mode: LayoutSelectionMode,
    layoutGap: number,
): { changes: ElementChange[]; guides: AlignGuide[] } {
    const selectedSet = new Set(selectedIds);
    const layoutTargets = allElements
        .filter(el => selectedSet.has(el.id) && el.type !== 'connector')
        .filter(el => !el.parentFrameId || !selectedSet.has(el.parentFrameId));

    if (layoutTargets.length < 2) return { changes: [], guides: [] };

    const bounds = getElementsBounds(layoutTargets);
    if (!bounds) return { changes: [], guides: [] };

    const placements = new Map<string, { x: number; y: number }>();
    const sorted = [...layoutTargets].sort((a, b) => {
        if (mode === 'row') return a.x - b.x || a.y - b.y;
        return a.y - b.y || a.x - b.x;
    });

    if (mode === 'row') {
        const totalWidth = sorted.reduce((sum, el) => sum + (el.width || 0), 0) + layoutGap * Math.max(0, sorted.length - 1);
        let currentX = bounds.minX + Math.max(0, (bounds.width - totalWidth) / 2);
        const centerY = bounds.minY + bounds.height / 2;

        sorted.forEach(el => {
            placements.set(el.id, {
                x: Math.round(currentX),
                y: Math.round(centerY - (el.height || 0) / 2),
            });
            currentX += (el.width || 0) + layoutGap;
        });
    } else if (mode === 'column') {
        const totalHeight = sorted.reduce((sum, el) => sum + (el.height || 0), 0) + layoutGap * Math.max(0, sorted.length - 1);
        let currentY = bounds.minY + Math.max(0, (bounds.height - totalHeight) / 2);
        const centerX = bounds.minX + bounds.width / 2;

        sorted.forEach(el => {
            placements.set(el.id, {
                x: Math.round(centerX - (el.width || 0) / 2),
                y: Math.round(currentY),
            });
            currentY += (el.height || 0) + layoutGap;
        });
    } else {
        const columnCount = Math.max(2, Math.ceil(Math.sqrt(sorted.length)));
        const rowCount = Math.ceil(sorted.length / columnCount);
        const cellWidth = Math.max(...sorted.map(el => el.width || 0));
        const cellHeight = Math.max(...sorted.map(el => el.height || 0));
        const totalWidth = columnCount * cellWidth + Math.max(0, columnCount - 1) * layoutGap;
        const totalHeight = rowCount * cellHeight + Math.max(0, rowCount - 1) * layoutGap;
        const startX = bounds.minX + Math.max(0, (bounds.width - totalWidth) / 2);
        const startY = bounds.minY + Math.max(0, (bounds.height - totalHeight) / 2);

        sorted.forEach((el, index) => {
            const column = index % columnCount;
            const row = Math.floor(index / columnCount);
            const cellX = startX + column * (cellWidth + layoutGap);
            const cellY = startY + row * (cellHeight + layoutGap);
            placements.set(el.id, {
                x: Math.round(cellX + (cellWidth - (el.width || 0)) / 2),
                y: Math.round(cellY + (cellHeight - (el.height || 0)) / 2),
            });
        });
    }

    const changeMap = new Map<string, CanvasElementPatchAttrs>();
    const queueChange = (id: string, attrs: CanvasElementPatchAttrs) => {
        changeMap.set(id, { ...(changeMap.get(id) || {}), ...attrs });
    };

    placements.forEach((position, id) => {
        const target = allElements.find(el => el.id === id);
        if (!target) return;

        const deltaX = position.x - target.x;
        const deltaY = position.y - target.y;
        queueChange(id, position);

        if (target.type === 'frame' && (deltaX !== 0 || deltaY !== 0)) {
            const descendantIds = getDescendantIds(target.id, allElements);
            descendantIds.forEach(descendantId => {
                const descendant = allElements.find(el => el.id === descendantId);
                if (!descendant) return;
                queueChange(descendantId, {
                    x: descendant.x + deltaX,
                    y: descendant.y + deltaY,
                });
            });
        }
    });

    const changes: ElementChange[] = Array.from(changeMap.entries()).map(([id, attrs]) => ({ id, attrs }));

    const guides: AlignGuide[] = mode === 'column'
        ? [{ type: 'v', pos: bounds.minX + bounds.width / 2, start: bounds.minY, end: bounds.maxY }]
        : [{ type: 'h', pos: bounds.minY + bounds.height / 2, start: bounds.minX, end: bounds.maxX }];

    return { changes, guides };
}

// ── Z-order reordering ─────────────────────────────────────────────────

type ReorderMode = 'forward' | 'backward' | 'front' | 'back';

/** Compute the new element array after reordering selected elements in z-order. */
export function computeReorder(
    elements: CanvasElement[],
    selectedIds: string[],
    mode: ReorderMode,
): { reordered: CanvasElement[]; didChange: boolean } {
    const selectedSet = new Set(selectedIds);

    const getRenderLane = (el: CanvasElement): 'frame' | 'content' | null => {
        if (el.hidden || el.type === 'connector') return null;
        return el.type === 'frame' ? 'frame' : 'content';
    };

    const getReorderScopeKey = (el: CanvasElement) => {
        const lane = getRenderLane(el);
        if (!lane) return null;
        return `${el.parentFrameId ?? '__root__'}::${lane}`;
    };

    const reorderLane = (laneElements: CanvasElement[], laneSelectedSet: Set<string>) => {
        if (laneSelectedSet.size === 0) return laneElements;

        switch (mode) {
            case 'front': {
                const unselected = laneElements.filter(el => !laneSelectedSet.has(el.id));
                const selected = laneElements.filter(el => laneSelectedSet.has(el.id));
                return [...unselected, ...selected];
            }
            case 'back': {
                const unselected = laneElements.filter(el => !laneSelectedSet.has(el.id));
                const selected = laneElements.filter(el => laneSelectedSet.has(el.id));
                return [...selected, ...unselected];
            }
            case 'forward': {
                const nextLane = [...laneElements];
                for (let i = nextLane.length - 2; i >= 0; i -= 1) {
                    const current = nextLane[i];
                    const next = nextLane[i + 1];
                    if (laneSelectedSet.has(current.id) && !laneSelectedSet.has(next.id)) {
                        nextLane[i] = next;
                        nextLane[i + 1] = current;
                    }
                }
                return nextLane;
            }
            case 'backward': {
                const nextLane = [...laneElements];
                for (let i = 1; i < nextLane.length; i += 1) {
                    const current = nextLane[i];
                    const previous = nextLane[i - 1];
                    if (laneSelectedSet.has(current.id) && !laneSelectedSet.has(previous.id)) {
                        nextLane[i] = previous;
                        nextLane[i - 1] = current;
                    }
                }
                return nextLane;
            }
        }
    };

    const laneGroups = new Map<string, { indices: number[]; elements: CanvasElement[]; selectedIds: Set<string> }>();
    elements.forEach((el, index) => {
        const scopeKey = getReorderScopeKey(el);
        if (!scopeKey) return;
        const group = laneGroups.get(scopeKey) ?? { indices: [], elements: [], selectedIds: new Set<string>() };
        group.indices.push(index);
        group.elements.push(el);
        if (selectedSet.has(el.id)) group.selectedIds.add(el.id);
        laneGroups.set(scopeKey, group);
    });

    const nextElements = [...elements];
    let didChange = false;
    for (const group of laneGroups.values()) {
        const reorderedLane = reorderLane(group.elements, group.selectedIds);
        if (!didChange) {
            didChange = reorderedLane.some((element, laneIndex) => element.id !== group.elements[laneIndex]?.id);
        }
        group.indices.forEach((elementIndex, laneIndex) => {
            nextElements[elementIndex] = reorderedLane[laneIndex];
        });
    }

    return { reordered: nextElements, didChange };
}
