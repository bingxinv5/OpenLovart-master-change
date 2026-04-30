import type { SpatialIndex } from '@/lib/editor-kernel';
import type { CanvasElement } from './canvas-types';
import { isCanvasElementOfType } from './canvas-types';

export interface CanvasRenderPlanInput {
    elements: CanvasElement[];
    selectedIds: string[];
    pan: { x: number; y: number };
    scale: number;
    viewportSize: { width: number; height: number };
    spatialIndex?: Pick<SpatialIndex, 'search' | 'size'>;
    isDragging: boolean;
    isPanning: boolean;
    isResizing: boolean;
    isSelecting: boolean;
}

export interface CanvasRenderPlan {
    visibleElements: CanvasElement[];
    culledCount: number;
    virtualizedCount: number;
    deferredCount: number;
    maxVisibleElements: number;
    viewportMargin: number;
    partitionCount: number;
    partitionTileSize: number;
}

function clampValue(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function isAlwaysRenderedElement(element: CanvasElement, selectedSet: Set<string>) {
    return selectedSet.has(element.id) || isCanvasElementOfType(element, 'frame') || isCanvasElementOfType(element, 'connector');
}

export function buildCanvasRenderPlan({
    elements,
    selectedIds,
    pan,
    scale,
    viewportSize,
    spatialIndex,
    isDragging,
    isPanning,
    isResizing,
    isSelecting,
}: CanvasRenderPlanInput): CanvasRenderPlan {
    const dynamicViewportMargin = clampValue(Math.round(240 / Math.max(scale, 0.16)), 180, 1400);
    const viewportPixels = Math.max(1, viewportSize.width * viewportSize.height);
    const baseVisibleCap = clampValue(Math.round(viewportPixels / 7200), 180, 900);
    const interactionPenalty = (isPanning || isDragging || isResizing || isSelecting) ? 80 : 0;
    const zoomAdjustment = scale <= 0.2 ? -100 : scale <= 0.45 ? -40 : scale >= 1.75 ? 120 : scale >= 1.1 ? 40 : 0;
    const maxVisibleElements = clampValue(baseVisibleCap + zoomAdjustment - interactionPenalty, 160, 1000);
    const partitionTileSize = clampValue(Math.round(520 / Math.max(scale, 0.2)), 260, 1400);

    if (viewportSize.width === 0 || viewportSize.height === 0) {
        const visibleFallback = elements.filter(el => !el.hidden);
        return {
            visibleElements: visibleFallback,
            culledCount: 0,
            virtualizedCount: 0,
            deferredCount: 0,
            maxVisibleElements,
            viewportMargin: dynamicViewportMargin,
            partitionCount: 1,
            partitionTileSize,
        };
    }

    const vpLeft = (-pan.x / scale) - dynamicViewportMargin;
    const vpTop = (-pan.y / scale) - dynamicViewportMargin;
    const vpRight = (viewportSize.width - pan.x) / scale + dynamicViewportMargin;
    const vpBottom = (viewportSize.height - pan.y) / scale + dynamicViewportMargin;

    const selectedSet = new Set(selectedIds);
    let candidateIds: Set<string>;

    if (spatialIndex && spatialIndex.size > 0) {
        const hits = spatialIndex.search({ minX: vpLeft, minY: vpTop, maxX: vpRight, maxY: vpBottom });
        candidateIds = new Set(hits);
        for (const el of elements) {
            if (el.hidden) continue;
            if (isAlwaysRenderedElement(el, selectedSet)) {
                candidateIds.add(el.id);
            }
        }
    } else {
        candidateIds = new Set<string>();
        for (const el of elements) {
            if (el.hidden) continue;
            if (isAlwaysRenderedElement(el, selectedSet)) {
                candidateIds.add(el.id);
                continue;
            }
            const elRight = el.x + (el.width || 0);
            const elBottom = el.y + (el.height || 0);
            if (elRight >= vpLeft && el.x <= vpRight && elBottom >= vpTop && el.y <= vpBottom) {
                candidateIds.add(el.id);
            }
        }
    }

    const initiallyVisibleCount = candidateIds.size;
    let visible = elements.filter(el => !el.hidden && candidateIds.has(el.id));

    let virtualizedCount = 0;
    let deferredCount = 0;
    let partitionCount = 0;
    if (visible.length > maxVisibleElements) {
        const vpCenterX = (vpLeft + vpRight) / 2;
        const vpCenterY = (vpTop + vpBottom) / 2;
        const alwaysRender: CanvasElement[] = [];
        const sortable: CanvasElement[] = [];

        for (const el of visible) {
            if (isAlwaysRenderedElement(el, selectedSet)) {
                alwaysRender.push(el);
            } else {
                sortable.push(el);
            }
        }

        const remaining = maxVisibleElements - alwaysRender.length;
        if (remaining > 0 && sortable.length > remaining) {
            const partitions = new Map<string, CanvasElement[]>();
            for (const el of sortable) {
                const centerX = el.x + (el.width || 0) / 2;
                const centerY = el.y + (el.height || 0) / 2;
                const tileX = Math.floor(centerX / partitionTileSize);
                const tileY = Math.floor(centerY / partitionTileSize);
                const key = `${tileX}:${tileY}`;
                const bucket = partitions.get(key) || [];
                bucket.push(el);
                partitions.set(key, bucket);
            }

            partitionCount = partitions.size;
            const orderedPartitions = Array.from(partitions.entries())
                .map(([key, bucket]) => {
                    bucket.sort((a, b) => {
                        const dA = Math.abs(a.x + (a.width || 0) / 2 - vpCenterX) + Math.abs(a.y + (a.height || 0) / 2 - vpCenterY);
                        const dB = Math.abs(b.x + (b.width || 0) / 2 - vpCenterX) + Math.abs(b.y + (b.height || 0) / 2 - vpCenterY);
                        return dA - dB;
                    });
                    const [tileX, tileY] = key.split(':').map(Number);
                    return {
                        bucket,
                        distance: Math.abs((tileX + 0.5) * partitionTileSize - vpCenterX) + Math.abs((tileY + 0.5) * partitionTileSize - vpCenterY),
                    };
                })
                .sort((a, b) => a.distance - b.distance);

            const nextVisible: CanvasElement[] = [];
            let consumed = 0;
            while (consumed < remaining) {
                let progressed = false;
                for (const partition of orderedPartitions) {
                    const candidate = partition.bucket.shift();
                    if (!candidate) {
                        continue;
                    }
                    nextVisible.push(candidate);
                    consumed += 1;
                    progressed = true;
                    if (consumed >= remaining) {
                        break;
                    }
                }

                if (!progressed) {
                    break;
                }
            }

            deferredCount = Math.max(0, sortable.length - nextVisible.length);
            sortable.length = 0;
            sortable.push(...nextVisible);
        } else {
            partitionCount = sortable.length > 0 ? 1 : 0;
        }

        virtualizedCount = Math.max(0, visible.length - (alwaysRender.length + sortable.length));
        visible = [...alwaysRender, ...sortable];
    } else {
        partitionCount = visible.length > 0 ? 1 : 0;
    }

    return {
        visibleElements: visible,
        culledCount: Math.max(0, elements.filter(el => !el.hidden).length - initiallyVisibleCount),
        virtualizedCount,
        deferredCount,
        maxVisibleElements,
        viewportMargin: dynamicViewportMargin,
        partitionCount,
        partitionTileSize,
    };
}