import { describe, expect, it } from 'vitest';
import { calculateResizeBounds } from './canvas-resize-state';

describe('canvas-resize-state', () => {
    it('expands regular bounds by handle direction', () => {
        expect(calculateResizeBounds({
            start: { elementX: 10, elementY: 20, width: 100, height: 80 },
            handle: 'se',
            delta: { dx: 15, dy: 25 },
            preserveAspectRatio: false,
        })).toEqual({ x: 10, y: 20, width: 115, height: 105 });

        expect(calculateResizeBounds({
            start: { elementX: 10, elementY: 20, width: 100, height: 80 },
            handle: 'nw',
            delta: { dx: 15, dy: 25 },
            preserveAspectRatio: false,
        })).toEqual({ x: 25, y: 45, width: 85, height: 55 });
    });

    it('preserves image aspect ratio from horizontal handles', () => {
        expect(calculateResizeBounds({
            start: { elementX: 10, elementY: 20, width: 100, height: 50, aspectRatio: 2 },
            handle: 'e',
            delta: { dx: 20, dy: 100 },
            preserveAspectRatio: true,
        })).toEqual({ x: 10, y: 20, width: 120, height: 60 });
    });

    it('keeps north and west edges anchored when preserving aspect ratio', () => {
        expect(calculateResizeBounds({
            start: { elementX: 10, elementY: 20, width: 100, height: 50, aspectRatio: 2 },
            handle: 'nw',
            delta: { dx: 20, dy: 5 },
            preserveAspectRatio: true,
        })).toEqual({ x: 30, y: 30, width: 80, height: 40 });

        expect(calculateResizeBounds({
            start: { elementX: 10, elementY: 20, width: 100, height: 50, aspectRatio: 2 },
            handle: 'n',
            delta: { dx: 80, dy: 10 },
            preserveAspectRatio: true,
        })).toEqual({ x: 10, y: 30, width: 80, height: 40 });
    });
});