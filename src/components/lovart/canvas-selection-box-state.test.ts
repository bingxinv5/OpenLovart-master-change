import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import { CANVAS_REFERENCE_CONNECTOR_KIND } from './canvas-reference-connectors';
import {
    createSelectionBox,
    getSelectionBoxScreenRect,
    resolveSelectionBoxSelectedIds,
    updateSelectionBox,
} from './canvas-selection-box-state';

function makeElement(id: string, attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id,
        type: 'shape',
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        ...attrs,
    };
}

describe('canvas-selection-box-state', () => {
    it('creates and updates selection boxes without changing mode metadata', () => {
        const box = createSelectionBox({
            start: { x: 10, y: 20 },
            current: { x: 10, y: 20 },
            additiveSelection: true,
            fallbackSelectionId: 'fallback',
        });

        expect(updateSelectionBox(box, { x: 30, y: 40 })).toEqual({
            startX: 10,
            startY: 20,
            currentX: 30,
            currentY: 40,
            mode: 'add',
            fallbackSelectionId: 'fallback',
        });
    });

    it('maps canvas rects to screen rects through scale and pan', () => {
        const rect = getSelectionBoxScreenRect({
            startX: 30,
            startY: 10,
            currentX: 10,
            currentY: 40,
            mode: 'replace',
        }, {
            scale: 2,
            pan: { x: 5, y: -10 },
        });

        expect(rect).toEqual({ left: 25, top: 10, width: 40, height: 60 });
    });

    it('replaces selection with box-selected element ids', () => {
        const ids = resolveSelectionBoxSelectedIds({
            box: { startX: 0, startY: 0, currentX: 50, currentY: 50, mode: 'replace' },
            elements: [
                makeElement('inside', { x: 10, y: 10 }),
                makeElement('outside', { x: 100, y: 100 }),
            ],
            selectedIds: ['existing'],
        });

        expect(ids).toEqual(['inside']);
    });

    it('adds box-selected ids and keeps tiny-click fallback behavior', () => {
        const elements = [makeElement('inside', { x: 10, y: 10 })];

        expect(resolveSelectionBoxSelectedIds({
            box: { startX: 0, startY: 0, currentX: 50, currentY: 50, mode: 'add' },
            elements,
            selectedIds: ['existing'],
        })).toEqual(['existing', 'inside']);

        expect(resolveSelectionBoxSelectedIds({
            box: { startX: 0, startY: 0, currentX: 2, currentY: 2, mode: 'add', fallbackSelectionId: 'fallback' },
            elements,
            selectedIds: ['existing'],
        })).toEqual(['existing', 'fallback']);
    });

    it('selects reference connectors whose curve bounds cross the selection box', () => {
        const image = makeElement('image-a', { type: 'image', x: 0, y: 0, width: 100, height: 100, content: 'imgref://a' });
        const generator = makeElement('generator-a', { type: 'image-generator', x: 220, y: 160, width: 140, height: 80 });
        const connector = makeElement('connector-a', {
            type: 'connector',
            connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
            connectorFrom: image.id,
            connectorTo: generator.id,
        });

        expect(resolveSelectionBoxSelectedIds({
            box: { startX: 145, startY: 112, currentX: 175, currentY: 142, mode: 'replace' },
            elements: [image, generator, connector],
            selectedIds: [],
        })).toEqual([connector.id]);

        expect(resolveSelectionBoxSelectedIds({
            box: { startX: 160, startY: 126, currentX: 161, currentY: 127, mode: 'replace' },
            elements: [image, generator, connector],
            selectedIds: ['existing'],
        })).toEqual([]);
    });
});