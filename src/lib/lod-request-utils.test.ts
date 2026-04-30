import { describe, expect, it } from 'vitest';
import {
    getEffectiveDevicePixelRatio,
    getFinalRequestPixels,
    getPreviewRequestPixels,
    getPriorityFinalRequestPixels,
    getPriorityPreviewRequestPixels,
    shouldRequestFinalLod,
} from './lod-request-utils';

describe('lod-request-utils', () => {
    it('keeps normal previews light while prioritizing selected image detail', () => {
        expect(getPreviewRequestPixels(2000, 0.1)).toBe(32);
        expect(getPriorityPreviewRequestPixels(2000, 0.1)).toBe(256);
        expect(getPreviewRequestPixels(120, 1)).toBe(256);
        expect(getPriorityPreviewRequestPixels(120, 1)).toBe(256);
    });

    it('promotes priority final LOD even at very low canvas zoom', () => {
        expect(getFinalRequestPixels(2000, 0.1)).toBe(32);
        expect(getPriorityFinalRequestPixels(2000, 0.1)).toBe(512);
        expect(getPriorityFinalRequestPixels(2000, 0.2)).toBe(256);
    });

    it('maps large final display sizes toward higher tiers and original fallback', () => {
        expect(getFinalRequestPixels(384, 1)).toBe(256);
        expect(getFinalRequestPixels(385, 1)).toBe(1024);
        expect(getFinalRequestPixels(1537, 1)).toBe(2048);
        expect(getFinalRequestPixels(3073, 1)).toBe(4096);
    });

    it('caps device pixel ratio more aggressively while zoomed out', () => {
        expect(getEffectiveDevicePixelRatio(0.75, 4)).toBe(2);
        expect(getEffectiveDevicePixelRatio(1, 4)).toBe(3);
        expect(getEffectiveDevicePixelRatio(1, 1)).toBe(1);
    });

    it('allows prioritized images to bypass the ordinary low-zoom final gate', () => {
        const lowZoomState = {
            isNearViewport: true,
            isScaleSettled: true,
            canvasScale: 0.1,
            previewRequestPixels: 256,
            finalRequestPixels: 512,
        };

        expect(shouldRequestFinalLod(lowZoomState)).toBe(false);
        expect(shouldRequestFinalLod({ ...lowZoomState, prioritizeDetail: true })).toBe(true);
    });

    it('does not request final LOD while interaction or visibility gates are closed', () => {
        const readyState = {
            isNearViewport: true,
            isScaleSettled: true,
            canvasScale: 1,
            previewRequestPixels: 256,
            finalRequestPixels: 1024,
        };

        expect(shouldRequestFinalLod({ ...readyState, deferFinalUpgrade: true })).toBe(false);
        expect(shouldRequestFinalLod({ ...readyState, isNearViewport: false })).toBe(false);
        expect(shouldRequestFinalLod({ ...readyState, isScaleSettled: false })).toBe(false);
        expect(shouldRequestFinalLod({ ...readyState, finalRequestPixels: 256 })).toBe(false);
    });
});