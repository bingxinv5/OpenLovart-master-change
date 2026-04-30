import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import { getTopLevelDraggedIds, resolveDragFrameAdoptions } from './canvas-drag-adoption';

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

describe('canvas-drag-adoption', () => {
    it('moves dragged elements into the smallest containing frame', () => {
        const elements = [
            makeElement('outer', { type: 'frame', x: 0, y: 0, width: 300, height: 300 }),
            makeElement('inner', { type: 'frame', x: 100, y: 100, width: 120, height: 120 }),
            makeElement('shape', { x: 0, y: 0, width: 20, height: 20 }),
        ];

        expect(resolveDragFrameAdoptions({
            elements,
            initialPositions: [{ id: 'shape', x: 0, y: 0 }],
            dragDelta: { dx: 110, dy: 110 },
        })).toEqual([{ elementId: 'shape', targetFrameId: 'inner' }]);
    });

    it('releases dragged children that end outside any frame', () => {
        const elements = [
            makeElement('frame', { type: 'frame', x: 0, y: 0, width: 100, height: 100 }),
            makeElement('shape', { x: 20, y: 20, width: 20, height: 20, parentFrameId: 'frame' }),
        ];

        expect(resolveDragFrameAdoptions({
            elements,
            initialPositions: [{ id: 'shape', x: 20, y: 20 }],
            dragDelta: { dx: 200, dy: 0 },
        })).toEqual([{ elementId: 'shape', targetFrameId: undefined }]);
    });

    it('does not adopt a dragged frame into its own descendants', () => {
        const elements = [
            makeElement('frame', { type: 'frame', x: 0, y: 0, width: 200, height: 200 }),
            makeElement('child-frame', { type: 'frame', x: 30, y: 30, width: 140, height: 140, parentFrameId: 'frame' }),
        ];

        expect(resolveDragFrameAdoptions({
            elements,
            initialPositions: [{ id: 'frame', x: 0, y: 0 }],
            dragDelta: { dx: 0, dy: 0 },
        })).toEqual([]);
    });

    it('filters nested dragged children from top-level drag ids', () => {
        const elements = [
            makeElement('frame', { type: 'frame' }),
            makeElement('child', { parentFrameId: 'frame' }),
        ];

        expect(getTopLevelDraggedIds([
            { id: 'frame', x: 0, y: 0 },
            { id: 'child', x: 10, y: 10 },
        ], elements)).toEqual(['frame']);
    });
});