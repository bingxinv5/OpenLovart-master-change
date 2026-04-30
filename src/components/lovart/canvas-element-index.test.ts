import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import { buildCanvasElementIndex } from './canvas-element-index';

function makeElement(id: string, overrides: Partial<CanvasElement>): CanvasElement {
    return {
        id,
        type: 'shape',
        x: 0,
        y: 0,
        ...overrides,
    };
}

describe('canvas-element-index', () => {
    it('indexes all elements while classifying visible connectors, frame children, and hidden ids', () => {
        const visibleConnector = makeElement('connector-visible', { type: 'connector', connectorFrom: 'a', connectorTo: 'b' });
        const hiddenConnector = makeElement('connector-hidden', { type: 'connector', hidden: true });
        const childA = makeElement('child-a', { type: 'image', parentFrameId: 'frame-1' });
        const childB = makeElement('child-b', { type: 'text', parentFrameId: 'frame-1' });
        const hiddenChild = makeElement('child-hidden', { type: 'shape', parentFrameId: 'frame-1', hidden: true });

        const index = buildCanvasElementIndex([
            makeElement('frame-1', { type: 'frame' }),
            visibleConnector,
            hiddenConnector,
            childA,
            childB,
            hiddenChild,
        ]);

        expect(index.elementMap.get('connector-hidden')).toBe(hiddenConnector);
        expect(index.connectorElements).toEqual([visibleConnector]);
        expect(index.frameChildCounts.get('frame-1')).toBe(2);
        expect(index.hiddenElementIds).toEqual(['connector-hidden', 'child-hidden']);
    });
});