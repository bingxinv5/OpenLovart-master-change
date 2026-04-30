import { describe, expect, it } from 'vitest';
import {
    buildLayerDragHintLabel,
    buildLayerDragPayload,
    canApplyLayerDropReorder,
    canApplyLayerTestReorder,
    getLayerDropPlacement,
    normalizeLayerMoveToParentDetail,
    normalizeLayerReorderDetail,
    readLayerDragIds,
    type LayerDragDataTransferReader,
} from './layers-dnd-model';

function makeDataTransfer(values: Record<string, string>): LayerDragDataTransferReader {
    return {
        getData(type: string) {
            return values[type] || '';
        },
    };
}

describe('layers dnd model', () => {
    it('builds single or multi selection drag payloads', () => {
        expect(buildLayerDragPayload({
            primaryId: 'a',
            selectedIds: ['a', 'b'],
            isPrimarySelected: true,
        })).toEqual({ primaryId: 'a', ids: ['a', 'b'] });

        expect(buildLayerDragPayload({
            primaryId: 'c',
            selectedIds: ['a', 'b'],
            isPrimarySelected: false,
        })).toEqual({ primaryId: 'c', ids: ['c'] });
    });

    it('reads JSON drag ids and falls back to active or plain text ids', () => {
        expect(readLayerDragIds({
            dataTransfer: makeDataTransfer({
                'application/json': JSON.stringify({ primaryId: 'a', ids: [' a ', '', 'b'] }),
                'text/plain': 'plain',
            }),
            fallbackDraggingId: 'active',
        })).toEqual(['a', 'b']);

        expect(readLayerDragIds({
            dataTransfer: makeDataTransfer({
                'application/json': '{bad-json',
                'text/plain': 'plain',
            }),
            fallbackDraggingId: null,
        })).toEqual(['plain']);

        expect(readLayerDragIds({
            dataTransfer: makeDataTransfer({ 'text/plain': 'plain' }),
            fallbackDraggingId: 'active',
        })).toEqual(['active']);
    });

    it('normalizes test move and reorder details', () => {
        expect(normalizeLayerMoveToParentDetail({
            draggedIds: [' a ', '', 'b'],
            parentId: ' frame ',
        })).toEqual({ draggedIds: ['a', 'b'], parentId: 'frame' });

        expect(normalizeLayerMoveToParentDetail({ draggedId: ' a ', parentId: null })).toEqual({
            draggedIds: ['a'],
            parentId: undefined,
        });

        expect(normalizeLayerMoveToParentDetail({ draggedIds: [] })).toBeNull();

        expect(normalizeLayerReorderDetail({
            draggedIds: [' a ', 'b'],
            targetId: ' c ',
            placement: 'after',
        })).toEqual({ draggedIds: ['a', 'b'], targetId: 'c', placement: 'after' });

        expect(normalizeLayerReorderDetail({ draggedId: 'a', targetId: 'a', placement: 'before' })).toBeNull();
        expect(normalizeLayerReorderDetail({ draggedId: 'a', targetId: 'b' })).toBeNull();
    });

    it('guards reorder drops and test reorders', () => {
        const ids = new Set(['a', 'target']);
        const hasElement = (id: string) => ids.has(id);

        expect(canApplyLayerDropReorder({ draggedIds: ['missing', 'a'], targetId: 'target', hasElement })).toBe(true);
        expect(canApplyLayerDropReorder({ draggedIds: ['target'], targetId: 'target', hasElement })).toBe(false);
        expect(canApplyLayerDropReorder({ draggedIds: ['missing'], targetId: 'target', hasElement })).toBe(false);

        expect(canApplyLayerTestReorder({ draggedIds: ['a'], targetId: 'target', hasElement })).toBe(true);
        expect(canApplyLayerTestReorder({ draggedIds: ['missing', 'a'], targetId: 'target', hasElement })).toBe(false);
        expect(canApplyLayerTestReorder({ draggedIds: ['a'], targetId: 'missing', hasElement })).toBe(false);
    });

    it('computes row placement and drag hints', () => {
        expect(getLayerDropPlacement(12, 10, 10)).toBe('before');
        expect(getLayerDropPlacement(18, 10, 10)).toBe('after');

        const getLabel = (id: string) => ({ frame: '主画板', target: '目标图层' }[id] || null);
        expect(buildLayerDragHintLabel({
            draggingId: 'a',
            parentDropTarget: 'root',
            dropIndicator: null,
            draggedCount: 1,
            getLabel,
        })).toBe('释放后移到根层级');

        expect(buildLayerDragHintLabel({
            draggingId: 'a',
            parentDropTarget: 'frame',
            dropIndicator: null,
            draggedCount: 1,
            getLabel,
        })).toBe('释放后加入“主画板”');

        expect(buildLayerDragHintLabel({
            draggingId: 'a',
            parentDropTarget: null,
            dropIndicator: { targetId: 'target', placement: 'before' },
            draggedCount: 1,
            getLabel,
        })).toBe('释放后排到前面 · 目标图层');

        expect(buildLayerDragHintLabel({
            draggingId: 'a',
            parentDropTarget: null,
            dropIndicator: null,
            draggedCount: 3,
            getLabel,
        })).toBe('正在拖动 3 个图层');
    });
});