import { describe, expect, it } from 'vitest';
import { fitImageDisplayMetrics, resolveAspectRatioFallbackMetrics } from './canvas-image-assets';

describe('canvas-image-assets', () => {
    it('fits natural image metrics into canvas display bounds', () => {
        expect(fitImageDisplayMetrics({ width: 4096, height: 2048 })).toEqual({
            width: 600,
            height: 300,
            aspectRatio: undefined,
        });
    });

    it('centers fitted metrics within an anchor', () => {
        expect(fitImageDisplayMetrics({ width: 1600, height: 900 }, {
            maxWidth: 400,
            maxHeight: 400,
            anchor: { x: 100, y: 200, width: 400, height: 400 },
        })).toEqual({
            width: 400,
            height: 225,
            x: 100,
            y: 288,
            aspectRatio: '16:9',
        });
    });

    it('builds fallback metrics from an aspect ratio label', () => {
        expect(resolveAspectRatioFallbackMetrics('16:9', {
            x: 10,
            y: 20,
            width: 400,
            height: 400,
        })).toEqual({
            width: 400,
            height: 225,
            x: 10,
            y: 108,
            aspectRatio: '16:9',
        });
    });

    it('returns null without an anchor or valid ratio', () => {
        expect(resolveAspectRatioFallbackMetrics('16:9')).toBeNull();
        expect(resolveAspectRatioFallbackMetrics('auto', { x: 0, y: 0, width: 100, height: 100 })).toBeNull();
    });
});