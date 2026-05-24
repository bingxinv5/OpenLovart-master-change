import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import {
    canUseScreenSpaceResizeOverlayForElement,
    getAlwaysSuppressedResizeHandles,
    getSuppressedResizeHandlesForReferenceConnectionPriority,
    shouldPreferReferenceConnectionOnRight,
    type ScreenSpaceResizeOverlayState,
} from './ScreenSpaceResizeOverlay';

function makeElement(type: CanvasElement['type']): CanvasElement {
    return {
        id: type,
        type,
        x: 0,
        y: 0,
    };
}

describe('ScreenSpaceResizeOverlay', () => {
    it('allows regular canvas elements', () => {
        expect(canUseScreenSpaceResizeOverlayForElement(makeElement('image'))).toBe(true);
        expect(canUseScreenSpaceResizeOverlayForElement(makeElement('text'))).toBe(true);
        expect(canUseScreenSpaceResizeOverlayForElement(makeElement('frame'))).toBe(true);
    });

    it('blocks connector and generator panel elements', () => {
        expect(canUseScreenSpaceResizeOverlayForElement(null)).toBe(false);
        expect(canUseScreenSpaceResizeOverlayForElement(makeElement('connector'))).toBe(false);
        expect(canUseScreenSpaceResizeOverlayForElement(makeElement('image-generator'))).toBe(false);
        expect(canUseScreenSpaceResizeOverlayForElement(makeElement('video-generator'))).toBe(false);
        expect(canUseScreenSpaceResizeOverlayForElement(makeElement('storyboard-planner'))).toBe(false);
    });

    it('prefers reference connection on the right for narrow selected images', () => {
        const overlay: ScreenSpaceResizeOverlayState = {
            element: { ...makeElement('image'), width: 160, height: 96 },
            left: 0,
            top: 0,
            width: 160,
            height: 96,
        };

        expect(shouldPreferReferenceConnectionOnRight(overlay)).toBe(true);
        expect(getSuppressedResizeHandlesForReferenceConnectionPriority(overlay)).toEqual(['e']);
    });

    it('prefers reference connection on the right for large images at low zoom', () => {
        const overlay: ScreenSpaceResizeOverlayState = {
            element: { ...makeElement('image'), width: 1290, height: 890 },
            left: 0,
            top: 0,
            width: 430,
            height: 296,
        };

        expect(shouldPreferReferenceConnectionOnRight(overlay)).toBe(true);
        expect(getSuppressedResizeHandlesForReferenceConnectionPriority(overlay)).toEqual(['e']);
    });

    it('always suppresses the middle-right resize hit area for images', () => {
        const wideImageOverlay: ScreenSpaceResizeOverlayState = {
            element: { ...makeElement('image'), width: 320, height: 192 },
            left: 0,
            top: 0,
            width: 161,
            height: 96,
        };

        expect(shouldPreferReferenceConnectionOnRight(wideImageOverlay)).toBe(false);
        expect(getAlwaysSuppressedResizeHandles(wideImageOverlay)).toEqual(['e']);
        expect(getSuppressedResizeHandlesForReferenceConnectionPriority(wideImageOverlay)).toEqual([]);
    });

    it('keeps non-image overlays fully resizable', () => {
        const textOverlay: ScreenSpaceResizeOverlayState = {
            element: makeElement('text'),
            left: 0,
            top: 0,
            width: 120,
            height: 64,
        };

        expect(shouldPreferReferenceConnectionOnRight(textOverlay)).toBe(false);
        expect(getAlwaysSuppressedResizeHandles(textOverlay)).toEqual([]);
        expect(getSuppressedResizeHandlesForReferenceConnectionPriority(textOverlay)).toEqual([]);
    });
});