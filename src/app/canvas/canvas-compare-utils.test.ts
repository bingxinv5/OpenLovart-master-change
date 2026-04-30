import { describe, expect, it } from 'vitest';
import type { CanvasRenderMetrics } from '@/components/lovart/canvas-area-domains';
import type { ChunkResidencyState } from './canvas-runtime-types';
import { areCanvasRenderMetricsEqual, areChunkResidencyStatesEqual, areOrderedStringArraysEqual } from './canvas-compare-utils';

function makeMetrics(overrides: Partial<CanvasRenderMetrics> = {}): CanvasRenderMetrics {
    return {
        visibleCount: 10,
        totalCount: 100,
        culledCount: 90,
        virtualizedCount: 0,
        deferredCount: 0,
        maxVisibleElements: 180,
        viewportMargin: 240,
        partitionCount: 1,
        partitionTileSize: 520,
        ...overrides,
    };
}

function makeResidency(overrides: Partial<ChunkResidencyState> = {}): ChunkResidencyState {
    return {
        phase: 'idle',
        residentChunkIds: ['root', 'chunk-a'],
        unloadedChunkIds: ['chunk-b'],
        residentElementCount: 12,
        unloadedElementCount: 8,
        lastActivatedChunkLabel: 'chunk-a',
        lastReleasedChunkLabel: 'chunk-b',
        ...overrides,
    };
}

describe('canvas-compare-utils', () => {
    it('compares ordered string arrays by value and order', () => {
        expect(areOrderedStringArraysEqual(['a', 'b'], ['a', 'b'])).toBe(true);
        expect(areOrderedStringArraysEqual(['a', 'b'], ['b', 'a'])).toBe(false);
        expect(areOrderedStringArraysEqual(['a'], ['a', 'b'])).toBe(false);
    });

    it('compares render metrics fields', () => {
        const metrics = makeMetrics();
        expect(areCanvasRenderMetricsEqual(metrics, makeMetrics())).toBe(true);
        expect(areCanvasRenderMetricsEqual(null, makeMetrics())).toBe(false);
        expect(areCanvasRenderMetricsEqual(metrics, makeMetrics({ deferredCount: 1 }))).toBe(false);
    });

    it('compares chunk residency state fields', () => {
        const residency = makeResidency();
        expect(areChunkResidencyStatesEqual(residency, makeResidency())).toBe(true);
        expect(areChunkResidencyStatesEqual(residency, makeResidency({ phase: 'hydrating' }))).toBe(false);
        expect(areChunkResidencyStatesEqual(residency, makeResidency({ residentChunkIds: ['chunk-a', 'root'] }))).toBe(false);
        expect(areChunkResidencyStatesEqual(residency, makeResidency({ lastReleasedChunkLabel: undefined }))).toBe(false);
    });
});