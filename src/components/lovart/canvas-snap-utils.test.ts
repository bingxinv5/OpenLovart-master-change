import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import {
    computeMoveSnap,
    computeResizeSnap,
    createEmptyMoveSnapLockState,
    createEmptyResizeSnapLockState,
    type MoveSnapLockState,
} from './canvas-snap-utils';

function makeElement(id: string, overrides: Partial<CanvasElement>): CanvasElement {
    return {
        id,
        type: 'image',
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        ...overrides,
    };
}

describe('canvas-snap-utils', () => {
    it('snaps dragged element edges to nearby element targets', () => {
        const result = computeMoveSnap({
            draggedElement: makeElement('dragged', { width: 20, height: 20 }),
            draggedInitial: { id: 'dragged', x: 90, y: 0 },
            draggedIds: new Set(['dragged']),
            dx: 5,
            dy: 0,
            otherElements: [makeElement('target', { x: 120, y: 0, width: 40, height: 40 })],
            threshold: 10,
            releaseThreshold: 18,
            snapDisabled: false,
            lockState: createEmptyMoveSnapLockState(),
        });

        expect(result.snapDx).toBe(5);
        expect(result.snapDy).toBe(0);
        expect(result.guides).toContainEqual({ type: 'v', pos: 120, start: 0, end: 40 });
        expect(result.nextLockState.x?.target).toBe(120);
    });

    it('honors move snap locks until the release threshold is exceeded', () => {
        const lockState: MoveSnapLockState = {
            x: { point: 'right', target: 120, guide: { type: 'v', pos: 120, start: 0, end: 40 } },
            y: null,
        };
        const result = computeMoveSnap({
            draggedElement: makeElement('dragged', { width: 20, height: 20 }),
            draggedInitial: { id: 'dragged', x: 90, y: 0 },
            draggedIds: new Set(['dragged']),
            dx: 13,
            dy: 0,
            otherElements: [],
            threshold: 10,
            releaseThreshold: 18,
            snapDisabled: false,
            lockState,
        });

        expect(result.snapDx).toBe(-3);
        expect(result.guides).toContainEqual(lockState.x?.guide);
        expect(result.nextLockState.x?.target).toBe(120);
    });

    it('snaps active resize edges to nearby targets', () => {
        const result = computeResizeSnap({
            elementId: 'resized',
            handle: 'e',
            bounds: { x: 0, y: 0, width: 98, height: 40 },
            targets: [makeElement('target', { x: 100, y: 0, width: 30, height: 50 })],
            threshold: 10,
            releaseThreshold: 18,
            snapDisabled: false,
            lockState: createEmptyResizeSnapLockState(),
        });

        expect(result.bounds).toEqual({ x: 0, y: 0, width: 100, height: 40 });
        expect(result.guides).toContainEqual({ type: 'v', pos: 100, start: 0, end: 50 });
        expect(result.nextLockState.x?.target).toBe(100);
    });

    it('clears resize locks when snapping is disabled', () => {
        const result = computeResizeSnap({
            elementId: 'resized',
            handle: 'e',
            bounds: { x: 0, y: 0, width: 98, height: 40 },
            targets: [makeElement('target', { x: 100, y: 0, width: 30, height: 50 })],
            threshold: 10,
            releaseThreshold: 18,
            snapDisabled: true,
            lockState: {
                x: { edge: 'right', target: 100, guide: { type: 'v', pos: 100, start: 0, end: 50 } },
                y: null,
            },
        });

        expect(result.bounds).toEqual({ x: 0, y: 0, width: 98, height: 40 });
        expect(result.guides).toEqual([]);
        expect(result.nextLockState).toEqual({ x: null, y: null });
    });
});