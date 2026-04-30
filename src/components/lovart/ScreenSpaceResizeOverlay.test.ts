import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import { canUseScreenSpaceResizeOverlayForElement } from './ScreenSpaceResizeOverlay';

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
});