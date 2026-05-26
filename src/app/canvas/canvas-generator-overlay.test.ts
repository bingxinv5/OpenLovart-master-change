import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@/components/lovart/canvas-types';

import { getGeneratorOverlayStyle, getSelectedGeneratorElement } from './canvas-generator-overlay';

function makeElement(id: string, attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id,
        type: 'image',
        x: 0,
        y: 0,
        ...attrs,
    };
}

const selectableOptions = {
    isDraggingElement: false,
    canvasSelectMode: null,
};

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

    it('selects generated media as generator panel targets without selecting plain uploads', () => {
        const uploadedImage = makeElement('uploaded-image', { content: 'imgref://uploaded' });
        const generatedImage = makeElement('generated-image', { content: 'imgref://generated', sourceGenerationTaskType: 'image' });
        const generatedVideo = makeElement('generated-video', { type: 'video', content: 'https://example.com/generated.mp4', sourceGenerationTaskType: 'video' });
        const elements = [uploadedImage, generatedImage, generatedVideo];

        expect(getSelectedGeneratorElement(elements, [uploadedImage.id], selectableOptions)).toBeNull();
        expect(getSelectedGeneratorElement(elements, [generatedImage.id], selectableOptions)?.id).toBe(generatedImage.id);
        expect(getSelectedGeneratorElement(elements, [generatedVideo.id], selectableOptions)?.id).toBe(generatedVideo.id);
    });
});