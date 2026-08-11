import { describe, expect, it } from 'vitest';
import {
    LOW_ZOOM_OVERVIEW_ENTER_SCALE,
    LOW_ZOOM_OVERVIEW_EXIT_SCALE,
    resolveLowZoomOverviewActive,
} from './CanvasLowZoomOverviewLayer';

describe('resolveLowZoomOverviewActive', () => {
    it('enters at the low zoom threshold only while pan motion is active', () => {
        expect(resolveLowZoomOverviewActive({ motionActive: true, scale: LOW_ZOOM_OVERVIEW_ENTER_SCALE, wasActive: false })).toBe(true);
        expect(resolveLowZoomOverviewActive({ motionActive: false, scale: 0.14, wasActive: false })).toBe(false);
    });

    it('uses hysteresis until the exit threshold is reached', () => {
        expect(resolveLowZoomOverviewActive({ motionActive: true, scale: LOW_ZOOM_OVERVIEW_EXIT_SCALE - 0.01, wasActive: true })).toBe(true);
        expect(resolveLowZoomOverviewActive({ motionActive: true, scale: LOW_ZOOM_OVERVIEW_EXIT_SCALE, wasActive: true })).toBe(false);
    });
});
