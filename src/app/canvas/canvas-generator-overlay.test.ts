import { describe, expect, it } from 'vitest';

import { getGeneratorOverlayStyle } from './canvas-generator-overlay';

describe('getGeneratorOverlayStyle', () => {
    it('uses a fixed enlarged panel scale for generator nodes', () => {
        const style = getGeneratorOverlayStyle({
            type: 'image-generator',
            x: 100,
            y: 200,
            width: 711,
            height: 400,
        }, 1, { x: 0, y: 0 });

        expect(Number.parseFloat(String(style.left))).toBeCloseTo(95.9);
        expect(style).toMatchObject({
            top: '620px',
            transform: 'scale(1.16)',
            transformOrigin: 'top left',
        });
        expect(style).not.toHaveProperty('width');
    });

    it('keeps the panel scale independent from node ratio and canvas zoom', () => {
        const squareStyle = getGeneratorOverlayStyle({
            type: 'image-generator',
            x: 0,
            y: 0,
            width: 400,
            height: 400,
        }, 1, { x: 0, y: 0 });
        const wideZoomedStyle = getGeneratorOverlayStyle({
            type: 'image-generator',
            x: 0,
            y: 0,
            width: 933,
            height: 400,
        }, 0.5, { x: 0, y: 0 });

        expect(squareStyle.transform).toBe('scale(1.16)');
        expect(wideZoomedStyle.transform).toBe(squareStyle.transform);
    });

    it('uses the same square fallback for image and video generator overlays', () => {
        const imageStyle = getGeneratorOverlayStyle({
            type: 'image-generator',
            x: 0,
            y: 0,
        }, 1, { x: 0, y: 0 });
        const videoStyle = getGeneratorOverlayStyle({
            type: 'video-generator',
            x: 0,
            y: 0,
        }, 1, { x: 0, y: 0 });

        expect(imageStyle.top).toBe('420px');
        expect(videoStyle.top).toBe(imageStyle.top);
        expect(videoStyle.transform).toBe(imageStyle.transform);
    });
});