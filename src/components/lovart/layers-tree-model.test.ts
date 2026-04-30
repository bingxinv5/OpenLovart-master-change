import { describe, expect, it } from 'vitest';
import { getLayerLabel, getStoryboardAuditState, LayerTreeBuilder, type FlattenedLayerRow } from './layers-tree-model';
import type { CanvasElement } from './canvas-types';

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

function flatten(elements: CanvasElement[], overrides: Partial<Parameters<typeof LayerTreeBuilder.flattenRows>[0]> = {}) {
    const layerTree = LayerTreeBuilder.buildTree(elements);
    return LayerTreeBuilder.flattenRows({
        layerTree,
        expandedMap: {},
        selectedIdSet: new Set(),
        draggingId: null,
        ...overrides,
    });
}

describe('LayerTreeBuilder', () => {
    it('builds a reversed layer tree, skips connectors, and keeps orphaned children at root', () => {
        const layerTree = LayerTreeBuilder.buildTree([
            makeElement('frame', { type: 'frame' }),
            makeElement('child', { parentFrameId: 'frame' }),
            makeElement('connector', { type: 'connector' }),
            makeElement('orphan', { parentFrameId: 'missing-frame' }),
        ]);

        expect(layerTree.map((node) => node.element.id)).toEqual(['orphan', 'frame']);
        expect(layerTree[1].children.map((node) => node.element.id)).toEqual(['child']);
    });

    it('flattens expanded rows with stable offsets and row heights', () => {
        const frame = makeElement('frame', { type: 'frame' });
        const child = makeElement('child', { parentFrameId: 'frame' });
        const result = flatten([frame, child], {
            selectedIdSet: new Set(['child']),
            draggingId: 'dragged',
        });

        expect(result.rows.map((row) => ({
            id: row.element.id,
            depth: row.depth,
            top: row.top,
            height: row.height,
        }))).toEqual([
            { id: 'frame', depth: 0, top: 0, height: 72 },
            { id: 'child', depth: 1, top: 72, height: 208 },
        ]);
        expect(result.totalHeight).toBe(280);
    });

    it('does not include collapsed descendants in flattened rows', () => {
        const result = flatten([
            makeElement('frame', { type: 'frame' }),
            makeElement('child', { parentFrameId: 'frame' }),
        ], {
            expandedMap: { frame: false },
        });

        expect(result.rows.map((row) => row.element.id)).toEqual(['frame']);
        expect(result.totalHeight).toBe(40);
    });

    it('filters by label, layer type, storyboard-only, and storyboard audit state', () => {
        const flattenedRows = flatten([
            makeElement('ready', {
                displayName: 'A ready shot',
                storyboardShotCode: 'A01',
                storyboardSceneType: '中景',
                storyboardDuration: '3s',
            }),
            makeElement('invalid', {
                storyboardShotCode: 'bad code',
                storyboardSceneType: '近景',
                storyboardDuration: '3s',
            }),
            makeElement('text', { type: 'text', content: 'caption' }),
        ]).rows;

        expect(LayerTreeBuilder.filterRows({
            flattenedRows,
            layerQuery: 'ready',
            layerFilterType: 'all',
            layerSortMode: 'canvas',
            storyboardOnly: false,
            storyboardAuditFilter: 'all',
        }).rows.map((row) => row.element.id)).toEqual(['ready']);

        expect(LayerTreeBuilder.filterRows({
            flattenedRows,
            layerQuery: '',
            layerFilterType: 'text',
            layerSortMode: 'canvas',
            storyboardOnly: false,
            storyboardAuditFilter: 'all',
        }).rows.map((row) => row.element.id)).toEqual(['text']);

        expect(LayerTreeBuilder.filterRows({
            flattenedRows,
            layerQuery: '',
            layerFilterType: 'all',
            layerSortMode: 'canvas',
            storyboardOnly: true,
            storyboardAuditFilter: 'invalid',
        }).rows.map((row) => row.element.id)).toEqual(['invalid']);
    });

    it('sorts storyboard rows by parsed shot code', () => {
        const flattenedRows = flatten([
            makeElement('shot-10', { storyboardShotCode: 'A10' }),
            makeElement('shot-2', { storyboardShotCode: 'A02' }),
            makeElement('shot-b', { storyboardShotCode: 'B01' }),
        ]).rows;

        const result = LayerTreeBuilder.filterRows({
            flattenedRows,
            layerQuery: '',
            layerFilterType: 'all',
            layerSortMode: 'storyboard-shot',
            storyboardOnly: true,
            storyboardAuditFilter: 'all',
        });

        expect(result.rows.map((row) => row.element.id)).toEqual(['shot-2', 'shot-10', 'shot-b']);
        expect(result.rows.map((row) => row.top)).toEqual([0, 40, 80]);
    });

    it('returns virtualized rows with overscan around the viewport', () => {
        const rows: FlattenedLayerRow[] = Array.from({ length: 20 }, (_, index) => ({
            element: makeElement(`row-${index}`),
            children: [],
            depth: 0,
            hasChildren: false,
            expanded: true,
            top: index * 10,
            height: 10,
        }));

        const result = LayerTreeBuilder.visibleRows(rows, 100, 10);

        expect(result[0].element.id).toBe('row-1');
        expect(result[result.length - 1].element.id).toBe('row-19');
    });
});

describe('layer row helpers', () => {
    it('uses display, frame, text, shape, and fallback labels', () => {
        expect(getLayerLabel(makeElement('named', { displayName: '  Hero  ' }))).toBe('Hero');
        expect(getLayerLabel(makeElement('frame', { type: 'frame', frameName: '  Main frame  ' }))).toBe('Main frame');
        expect(getLayerLabel(makeElement('text', { type: 'text', content: 'abcdefghijklmnopqrstuv' }))).toBe('abcdefghijklmnopqr');
        expect(getLayerLabel(makeElement('shape', { type: 'shape', shapeType: 'circle' }))).toBe('圆形');
        expect(getLayerLabel(makeElement('mark', { type: 'mark', markNumber: 7 }))).toBe('标记 7');
    });

    it('summarizes storyboard audit states', () => {
        expect(getStoryboardAuditState(makeElement('ready', {
            storyboardShotCode: 'A01',
            storyboardSceneType: '中景',
            storyboardDuration: '3s',
        })).isReady).toBe(true);

        expect(getStoryboardAuditState(makeElement('partial', {
            storyboardShotCode: 'A02',
        })).isPartial).toBe(true);

        expect(getStoryboardAuditState(makeElement('invalid', {
            storyboardShotCode: 'bad code',
        })).hasValidationError).toBe(true);

        expect(getStoryboardAuditState(makeElement('untracked')).isUntracked).toBe(true);
    });
});