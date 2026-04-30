import { describe, expect, it } from 'vitest';
import { calculatePanInertiaVelocity, stepPanInertia, trimPanVelocityPoints } from './canvas-pan-inertia';

describe('canvas-pan-inertia', () => {
    it('keeps only the newest velocity samples', () => {
        expect(trimPanVelocityPoints([
            { x: 0, y: 0, t: 0 },
            { x: 1, y: 0, t: 1 },
            { x: 2, y: 0, t: 2 },
        ], 2)).toEqual([
            { x: 1, y: 0, t: 1 },
            { x: 2, y: 0, t: 2 },
        ]);
    });

    it('calculates clamped inertia velocity from recent samples', () => {
        expect(calculatePanInertiaVelocity([
            { x: 0, y: 0, t: 0 },
            { x: 100, y: 0, t: 16 },
        ])).toEqual({ vx: 15, vy: 0 });
    });

    it('skips stale or tiny velocity samples', () => {
        expect(calculatePanInertiaVelocity([
            { x: 0, y: 0, t: 0 },
            { x: 20, y: 0, t: 300 },
        ])).toBeNull();

        expect(calculatePanInertiaVelocity([
            { x: 0, y: 0, t: 0 },
            { x: 1, y: 0, t: 100 },
        ])).toBeNull();
    });

    it('applies friction before moving the pan point', () => {
        expect(stepPanInertia({ x: 0, y: 0 }, { vx: 10, vy: 0 }, { friction: 0.5, minVelocity: 1 })).toEqual({
            pan: { x: 5, y: 0 },
            velocity: { vx: 5, vy: 0 },
            shouldContinue: true,
        });

        expect(stepPanInertia({ x: 0, y: 0 }, { vx: 1, vy: 0 }, { friction: 0.4, minVelocity: 0.5 })).toEqual({
            pan: { x: 0, y: 0 },
            velocity: { vx: 0.4, vy: 0 },
            shouldContinue: false,
        });
    });
});