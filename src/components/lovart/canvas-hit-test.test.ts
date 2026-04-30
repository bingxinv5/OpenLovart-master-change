import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import {
    elementContainsCanvasPoint,
    getBoxSelectedElementIds,
    getInnermostFrameAtCanvasPoint,
    getTopElementAtCanvasPoint,
    shouldIncludeElementInBoxSelection,
} from './canvas-hit-test';

function makeElement(id: string, attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id,
        type: 'shape',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        ...attrs,
    };
}

describe('canvas-hit-test', () => {
    it('uses text and mark fallback dimensions for point hits', () => {
        expect(elementContainsCanvasPoint(makeElement('text', { type: 'text', width: undefined, height: undefined }), 199, 39)).toBe(true);
        expect(elementContainsCanvasPoint(makeElement('mark', { type: 'mark', width: undefined, height: undefined }), 31, 31)).toBe(true);
        expect(elementContainsCanvasPoint(makeElement('connector', { type: 'connector' }), 10, 10)).toBe(false);
        expect(elementContainsCanvasPoint(makeElement('hidden', { hidden: true }), 10, 10)).toBe(false);
    });

    it('prefers topmost non-frame elements before frames', () => {
        const frame = makeElement('frame', { type: 'frame', x: 0, y: 0, width: 300, height: 300 });
        const shape = makeElement('shape', { x: 20, y: 20, width: 40, height: 40 });
        const laterShape = makeElement('later-shape', { x: 20, y: 20, width: 40, height: 40 });

        expect(getTopElementAtCanvasPoint([frame, shape, laterShape], 30, 30)?.id).toBe('later-shape');
        expect(getTopElementAtCanvasPoint([frame], 30, 30)?.id).toBe('frame');
    });

    it('box-selects intersecting non-frame elements but requires full frame containment', () => {
        const bounds = { x1: 10, y1: 10, x2: 90, y2: 90 };

        expect(shouldIncludeElementInBoxSelection(makeElement('shape', { x: 80, y: 80, width: 30, height: 30 }), bounds)).toBe(true);
        expect(shouldIncludeElementInBoxSelection(makeElement('frame-partial', { type: 'frame', x: 80, y: 80, width: 30, height: 30 }), bounds)).toBe(false);
        expect(shouldIncludeElementInBoxSelection(makeElement('frame-inside', { type: 'frame', x: 20, y: 20, width: 30, height: 30 }), bounds)).toBe(true);
    });

    it('returns selected ids in source order', () => {
        expect(getBoxSelectedElementIds([
            makeElement('outside', { x: 200, y: 200 }),
            makeElement('inside-a', { x: 20, y: 20 }),
            makeElement('inside-b', { x: 40, y: 40 }),
        ], { x1: 0, y1: 0, x2: 120, y2: 120 })).toEqual(['inside-a', 'inside-b']);
    });

    it('finds the smallest frame under the point while honoring excluded frame ids', () => {
        const outer = makeElement('outer', { type: 'frame', x: 0, y: 0, width: 300, height: 300 });
        const inner = makeElement('inner', { type: 'frame', x: 50, y: 50, width: 80, height: 80 });
        const excluded = makeElement('excluded', { type: 'frame', x: 55, y: 55, width: 20, height: 20 });

        expect(getInnermostFrameAtCanvasPoint([outer, inner, excluded], 60, 60)?.id).toBe('excluded');
        expect(getInnermostFrameAtCanvasPoint([outer, inner, excluded], 60, 60, { excludedFrameIds: new Set(['excluded']) })?.id).toBe('inner');
    });
});