import { describe, expect, it } from 'vitest';
import {
    resolveFloatingPanelScale,
    resolveFloatingPanelScreenPosition,
} from './floating-panel-position';

const anchor = {
    x: 100,
    y: 200,
    width: 400,
    height: 400,
};

describe('resolveFloatingPanelScreenPosition', () => {
    it('tracks the current visual pan without changing panel scale', () => {
        const initial = resolveFloatingPanelScreenPosition({
            anchor,
            viewport: { scale: 0.5, pan: { x: 10, y: 20 } },
            panelWidth: 620,
            panelHeight: 240,
            panelScale: 1.16,
        });
        const moved = resolveFloatingPanelScreenPosition({
            anchor,
            viewport: { scale: 0.5, pan: { x: 130, y: -40 } },
            panelWidth: 620,
            panelHeight: 240,
            panelScale: 1.16,
        });

        expect(moved.left - initial.left).toBeCloseTo(120);
        expect(moved.top - initial.top).toBeCloseTo(-60);
    });

    it('projects the anchor with the visual scale while the panel remains screen-sized', () => {
        const halfScale = resolveFloatingPanelScreenPosition({
            anchor,
            viewport: { scale: 0.5, pan: { x: 0, y: 0 } },
            panelWidth: 620,
            panelHeight: 200,
            panelScale: 1.16,
        });
        const quarterScale = resolveFloatingPanelScreenPosition({
            anchor,
            viewport: { scale: 0.25, pan: { x: 0, y: 0 } },
            panelWidth: 620,
            panelHeight: 200,
            panelScale: 1.16,
        });

        expect(halfScale.top).toBe(320);
        expect(quarterScale.top).toBe(170);
        expect(resolveFloatingPanelScale('scale(1.16)')).toBe(1.16);
    });

    it('flips above the anchor when the panel does not fit below', () => {
        const position = resolveFloatingPanelScreenPosition({
            anchor: { x: 500, y: 800, width: 200, height: 100 },
            viewport: { scale: 1, pan: { x: 0, y: 0 } },
            panelWidth: 620,
            panelHeight: 200,
            panelScale: 1.16,
            viewportWidth: 1440,
            viewportHeight: 960,
        });

        expect(position.placement).toBe('above');
        expect(position.top).toBeCloseTo(548);
    });

    it('clamps the panel inside the viewport margins', () => {
        const position = resolveFloatingPanelScreenPosition({
            anchor: { x: -1000, y: -1000, width: 100, height: 100 },
            viewport: { scale: 1, pan: { x: 0, y: 0 } },
            panelWidth: 620,
            panelHeight: 1200,
            panelScale: 1,
            viewportWidth: 800,
            viewportHeight: 600,
            margin: 16,
        });

        expect(position.left).toBe(16);
        expect(position.top).toBe(16);
    });
});
