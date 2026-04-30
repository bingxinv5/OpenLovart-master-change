import type { CanvasRenderMetrics } from '@/components/lovart/canvas-area-domains';
import type { ChunkResidencyState } from './canvas-runtime-types';

export function areCanvasRenderMetricsEqual(left: CanvasRenderMetrics | null, right: CanvasRenderMetrics) {
    return !!left
        && left.visibleCount === right.visibleCount
        && left.totalCount === right.totalCount
        && left.culledCount === right.culledCount
        && left.virtualizedCount === right.virtualizedCount
        && left.deferredCount === right.deferredCount
        && left.maxVisibleElements === right.maxVisibleElements
        && left.viewportMargin === right.viewportMargin
        && left.partitionCount === right.partitionCount
        && left.partitionTileSize === right.partitionTileSize;
}

export function areOrderedStringArraysEqual(left: string[], right: string[]) {
    if (left === right) {
        return true;
    }

    if (left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }

    return true;
}

export function areChunkResidencyStatesEqual(left: ChunkResidencyState, right: ChunkResidencyState) {
    return left.phase === right.phase
        && areOrderedStringArraysEqual(left.residentChunkIds, right.residentChunkIds)
        && areOrderedStringArraysEqual(left.unloadedChunkIds, right.unloadedChunkIds)
        && left.residentElementCount === right.residentElementCount
        && left.unloadedElementCount === right.unloadedElementCount
        && left.lastActivatedChunkLabel === right.lastActivatedChunkLabel
        && left.lastReleasedChunkLabel === right.lastReleasedChunkLabel;
}