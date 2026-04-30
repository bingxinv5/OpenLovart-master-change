import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import {
    collectDragInitialPositions,
    createFrameElementFromDrawBox,
    createMarkElementAtPoint,
    createPathElementFromPoints,
    getDragSelectionAnchor,
} from './canvas-pointer-element-factories';

describe('canvas-pointer-element-factories', () => {
    it('creates numbered marks targeting the topmost media element', () => {
        const elements: CanvasElement[] = [
            { id: 'image-a', type: 'image', x: 0, y: 0, width: 100, height: 100, content: 'img-a' },
            { id: 'video-b', type: 'video', x: 20, y: 20, width: 100, height: 100, content: 'video-b' },
            { id: 'mark-1', type: 'mark', x: 1, y: 1, markNumber: 4 },
        ];

        const { element, targetElement } = createMarkElementAtPoint({
            point: { x: 40, y: 40 },
            elements,
            nextId: () => 'mark-2',
        });

        expect(element).toMatchObject({
            id: 'mark-2',
            type: 'mark',
            x: 24,
            y: 10,
            markNumber: 5,
            markTargetId: 'video-b',
        });
        expect(targetElement?.id).toBe('video-b');
    });

    it('creates a frame and returns root elements whose centers are inside it', () => {
        const elements: CanvasElement[] = [
            { id: 'inside', type: 'image', x: 10, y: 10, width: 20, height: 20, content: 'img' },
            { id: 'child', type: 'image', x: 20, y: 20, width: 20, height: 20, content: 'img', parentFrameId: 'old-frame' },
            { id: 'connector', type: 'connector', x: 20, y: 20, connectorFrom: 'a', connectorTo: 'b' },
            { id: 'outside', type: 'image', x: 200, y: 200, width: 20, height: 20, content: 'img' },
        ];

        const result = createFrameElementFromDrawBox({
            box: { startX: 0, startY: 0, currentX: 100.4, currentY: 90.4 },
            elements,
            nextId: () => 'frame-1',
        });

        expect(result?.frame).toMatchObject({
            id: 'frame-1',
            type: 'frame',
            x: 0,
            y: 0,
            width: 100,
            height: 90,
        });
        expect(result?.containedElementIds).toEqual(['inside']);
    });

    it('skips tiny frame draw boxes', () => {
        expect(createFrameElementFromDrawBox({
            box: { startX: 0, startY: 0, currentX: 19, currentY: 25 },
            elements: [],
            nextId: () => 'frame-1',
        })).toBeNull();
    });

    it('creates normalized path elements from free-draw points', () => {
        const element = createPathElementFromPoints({
            points: [{ x: 10, y: 20 }, { x: 30, y: 10 }, { x: 15, y: 40 }],
            nextId: () => 'path-1',
        });

        expect(element).toMatchObject({
            id: 'path-1',
            type: 'path',
            x: 10,
            y: 10,
            width: 20,
            height: 30,
            points: [{ x: 0, y: 10 }, { x: 20, y: 0 }, { x: 5, y: 30 }],
        });
    });

    it('collects selected frames with recursive descendants for dragging', () => {
        const elements: CanvasElement[] = [
            { id: 'frame', type: 'frame', x: 0, y: 0, width: 100, height: 100 },
            { id: 'child', type: 'image', x: 10, y: 10, width: 20, height: 20, content: 'img', parentFrameId: 'frame' },
            { id: 'nested-frame', type: 'frame', x: 20, y: 20, width: 40, height: 40, parentFrameId: 'frame' },
            { id: 'nested-child', type: 'text', x: 25, y: 25, content: 'text', parentFrameId: 'nested-frame' },
            { id: 'other', type: 'text', x: 200, y: 200, content: 'text' },
        ];

        expect(collectDragInitialPositions(elements, ['frame'])).toEqual([
            { id: 'frame', x: 0, y: 0 },
            { id: 'child', x: 10, y: 10 },
            { id: 'nested-frame', x: 20, y: 20 },
            { id: 'nested-child', x: 25, y: 25 },
        ]);
        expect(getDragSelectionAnchor(elements, ['child', 'other'])).toEqual({ x: 10, y: 10 });
    });
});