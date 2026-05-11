import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import type { CanvasChunkManifestEntry } from './project-storage';
import {
    buildActiveChunkSummary,
    buildCanvasRuntimeElements,
    buildChunkPanelEntries,
    buildChunkResidencyState,
} from './canvas-chunk-runtime';

function makeElement(id: string, attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id,
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        ...attrs,
    };
}

function makeChunk(id: string, attrs: Partial<CanvasChunkManifestEntry> = {}): CanvasChunkManifestEntry {
    return {
        id,
        label: id,
        elementIds: [],
        elementCount: 1,
        ...attrs,
    };
}

describe('canvas chunk runtime helpers', () => {
    it('activates root, viewport, selected, highlighted, and pinned chunks', () => {
        const elements = [
            makeElement('root-element'),
            makeElement('near-frame', { type: 'frame', x: 100, y: 100, width: 200, height: 200 }),
            makeElement('near-child', { x: 120, y: 120, parentFrameId: 'near-frame' }),
            makeElement('far-frame', { type: 'frame', x: 8000, y: 8000, width: 200, height: 200 }),
            makeElement('far-child', { x: 8020, y: 8020, parentFrameId: 'far-frame' }),
            makeElement('selected-frame', { type: 'frame', x: 12000, y: 12000, width: 200, height: 200 }),
            makeElement('selected-child', { x: 12020, y: 12020, parentFrameId: 'selected-frame' }),
            makeElement('pinned-frame', { type: 'frame', x: 16000, y: 16000, width: 200, height: 200 }),
            makeElement('pinned-child', { x: 16020, y: 16020, parentFrameId: 'pinned-frame' }),
        ];
        const chunkManifest = [
            makeChunk('root', { elementIds: ['root-element'] }),
            makeChunk('near', { topFrameId: 'near-frame', elementIds: ['near-frame', 'near-child'], elementCount: 2 }),
            makeChunk('far', { topFrameId: 'far-frame', elementIds: ['far-frame', 'far-child'], elementCount: 2 }),
            makeChunk('selected', { topFrameId: 'selected-frame', elementIds: ['selected-frame', 'selected-child'], elementCount: 2 }),
            makeChunk('pinned', { topFrameId: 'pinned-frame', elementIds: ['pinned-frame', 'pinned-child'], elementCount: 2 }),
        ];
        const elementById = new Map(elements.map((element) => [element.id, element]));
        const elementChunkIdById = new Map<string, string>([
            ['root-element', 'root'],
            ['near-frame', 'near'],
            ['near-child', 'near'],
            ['far-frame', 'far'],
            ['far-child', 'far'],
            ['selected-frame', 'selected'],
            ['selected-child', 'selected'],
            ['pinned-frame', 'pinned'],
            ['pinned-child', 'pinned'],
        ]);

        const result = buildActiveChunkSummary({
            elements,
            chunkManifest,
            hasRootChunk: true,
            elementById,
            elementChunkIdById,
            selectedIds: ['selected-child'],
            highlightedLayerIds: ['far-child'],
            highlightedResultId: null,
            pinnedChunkIds: ['pinned', 'missing'],
            validChunkIdSet: new Set(chunkManifest.map((chunk) => chunk.id)),
            pan: { x: 0, y: 0 },
            scale: 1,
            viewportSize: { width: 1200, height: 800 },
        });

        expect(result.activeChunkIds).toEqual(['root', 'near', 'selected', 'far', 'pinned']);
        expect(result.releasedChunkIds).toEqual([]);
        expect(result.activeElements.map((element) => element.id)).toEqual(elements.map((element) => element.id));
    });

    it('orders residency by manifest and counts resident and unloaded elements', () => {
        const chunkManifest = [
            makeChunk('root', { elementCount: 3 }),
            makeChunk('a', { elementCount: 2 }),
            makeChunk('b', { elementCount: 5 }),
        ];
        const chunkMetaById = new Map(chunkManifest.map((chunk) => [chunk.id, chunk]));

        const result = buildChunkResidencyState({
            residentChunkIds: ['b', 'root'],
            phase: 'hydrating',
            chunkManifest,
            chunkMetaById,
            labels: { lastActivatedChunkLabel: 'B' },
        });

        expect(result.residentChunkIds).toEqual(['root', 'b']);
        expect(result.unloadedChunkIds).toEqual(['a']);
        expect(result.residentElementCount).toBe(8);
        expect(result.unloadedElementCount).toBe(2);
        expect(result.lastActivatedChunkLabel).toBe('B');
    });

    it('filters runtime elements to resident chunks and falls back to active chunks', () => {
        const elements = [
            makeElement('root-element'),
            makeElement('a-element'),
            makeElement('b-element'),
        ];
        const elementChunkIdById = new Map<string, string>([
            ['root-element', 'root'],
            ['a-element', 'a'],
            ['b-element', 'b'],
        ]);

        expect(buildCanvasRuntimeElements(elements, 3, ['b'], ['a'], elementChunkIdById).map((element) => element.id)).toEqual(['b-element']);
        expect(buildCanvasRuntimeElements(elements, 3, [], ['a'], elementChunkIdById).map((element) => element.id)).toEqual(['a-element']);
        expect(buildCanvasRuntimeElements(elements, 0, ['b'], ['a'], elementChunkIdById)).toBe(elements);
    });

    it('activates a frame chunk when a child protrudes into the viewport', () => {
        const elements = [
            makeElement('far-frame', { type: 'frame', x: 8000, y: 8000, width: 200, height: 200 }),
            makeElement('protruding-child', { x: 100, y: 100, width: 160, height: 120, parentFrameId: 'far-frame' }),
        ];
        const chunkManifest = [
            makeChunk('far', { topFrameId: 'far-frame', elementIds: ['far-frame', 'protruding-child'], elementCount: 2 }),
        ];
        const elementById = new Map(elements.map((element) => [element.id, element]));
        const elementChunkIdById = new Map<string, string>([
            ['far-frame', 'far'],
            ['protruding-child', 'far'],
        ]);

        const result = buildActiveChunkSummary({
            elements,
            chunkManifest,
            hasRootChunk: false,
            elementById,
            elementChunkIdById,
            selectedIds: [],
            highlightedLayerIds: [],
            highlightedResultId: null,
            pinnedChunkIds: [],
            validChunkIdSet: new Set(['far']),
            pan: { x: 0, y: 0 },
            scale: 1,
            viewportSize: { width: 1200, height: 800 },
        });

        expect(result.activeChunkIds).toEqual(['far']);
        expect(result.activeElements.map((element) => element.id)).toEqual(['far-frame', 'protruding-child']);
    });

    it('sorts chunk panel entries by pinned, active, then element count', () => {
        const chunkManifest = [
            makeChunk('a', { elementCount: 2 }),
            makeChunk('b', { elementCount: 9 }),
            makeChunk('c', { elementCount: 4 }),
        ];

        const result = buildChunkPanelEntries(chunkManifest, ['a'], [], ['c']);

        expect(result.map((chunk) => chunk.id)).toEqual(['c', 'a', 'b']);
        expect(result.find((chunk) => chunk.id === 'c')?.isPinned).toBe(true);
        expect(result.find((chunk) => chunk.id === 'a')?.isActive).toBe(true);
    });
});