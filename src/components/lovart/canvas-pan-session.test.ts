import { describe, expect, it } from 'vitest';
import {
    CANVAS_PAN_REBASE_DISTANCE_PX,
    isCanvasPrimaryButton,
    isSameCanvasPan,
    resolveCanvasMouseDownIntent,
    shouldRebaseCanvasPan,
} from './canvas-pan-session';

describe('canvas pan session', () => {
    it('rebases only after the screen-space threshold', () => {
        const anchor = { x: 10, y: -20 };
        expect(shouldRebaseCanvasPan(anchor, { x: 10 + CANVAS_PAN_REBASE_DISTANCE_PX - 1, y: -20 })).toBe(false);
        expect(shouldRebaseCanvasPan(anchor, { x: 10, y: -20 - CANVAS_PAN_REBASE_DISTANCE_PX })).toBe(true);
    });

    it('compares both pan axes', () => {
        expect(isSameCanvasPan({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
        expect(isSameCanvasPan({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(false);
    });

    it.each(['blank', 'image', 'frame', 'connector-hit-path', 'canvas-control'])(
        'routes middle mouse to pan on %s',
        () => {
            expect(resolveCanvasMouseDownIntent(1, 'select')).toBe('pan');
        },
    );

    it('preserves hand, primary, and context-menu routing', () => {
        expect(resolveCanvasMouseDownIntent(0, 'hand')).toBe('pan');
        expect(resolveCanvasMouseDownIntent(0, 'select')).toBe('primary');
        expect(resolveCanvasMouseDownIntent(2, 'select')).toBe('ignore');
        expect(isCanvasPrimaryButton(0)).toBe(true);
        expect(isCanvasPrimaryButton(1)).toBe(false);
        expect(isCanvasPrimaryButton(2)).toBe(false);
    });
});
