import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import {
    buildFinalizedGeneratedImageElement,
    buildImageFinalizeAnchor,
    buildPendingImageElement,
    normalizeImageTaskId,
} from './use-image-finalizer';

function createElement(attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id: 'element-1',
        type: 'image-generator',
        x: 10,
        y: 20,
        width: 300,
        height: 200,
        ...attrs,
    } as CanvasElement;
}

describe('use-image-finalizer helpers', () => {
    it('normalizes task ids', () => {
        expect(normalizeImageTaskId(' task-1 ')).toBe('task-1');
        expect(normalizeImageTaskId('   ')).toBeUndefined();
        expect(normalizeImageTaskId(null)).toBeUndefined();
    });

    it('builds a stable finalize anchor from element bounds', () => {
        expect(buildImageFinalizeAnchor(createElement({ width: 0, height: undefined }))).toEqual({
            x: 10,
            y: 20,
            width: 400,
            height: 400,
        });
    });

    it('turns a generator into a pending image preview', () => {
        const result = buildPendingImageElement(createElement({
            selectedAspectRatio: '16:9',
            savedReferenceImages: '["imgref:a"]',
        }), {
            imageUrl: 'https://example.com/result.png',
            taskId: ' task-2 ',
            previewMetrics: { x: 30, y: 40, width: 160, height: 90, naturalWidth: 1600, naturalHeight: 900, aspectRatio: '16:9' },
            defaultImageSurface: 'light',
        });

        expect(result).toMatchObject({
            type: 'image',
            content: 'https://example.com/result.png',
            flowReferenceImages: '["imgref:a"]',
            savedReferenceImages: '["imgref:a"]',
            imageFit: 'cover',
            imageSurface: 'light',
            x: 30,
            y: 40,
            width: 160,
            height: 90,
            mediaNaturalWidth: 1600,
            mediaNaturalHeight: 900,
            sourceGenerationTaskId: 'task-2',
            sourceGenerationTaskType: 'image',
            generatingTaskId: undefined,
        });
    });

    it('finalizes generated image elements with measured metrics and preserved panel references', () => {
        const previous = createElement({
            flowReferenceImages: '["imgref:flow"]',
            selectedAspectRatio: '21:9',
        });
        const result = buildFinalizedGeneratedImageElement(createElement({ imageFit: 'cover' }), previous, {
            content: 'imgref:final',
            metrics: { x: 50, y: 60, width: 500, height: 250, naturalWidth: 1000, naturalHeight: 500, aspectRatio: '2:1' },
            taskId: 'task-3',
            defaultImageFit: 'contain',
            defaultImageSurface: 'checker',
        });

        expect(result).toMatchObject({
            type: 'image',
            content: 'imgref:final',
            flowReferenceImages: '["imgref:flow"]',
            referenceImageId: undefined,
            savedReferenceImages: '["imgref:flow"]',
            imageFit: 'contain',
            imageSurface: 'checker',
            selectedAspectRatio: '2:1',
            x: 50,
            y: 60,
            width: 500,
            height: 250,
            mediaNaturalWidth: 1000,
            mediaNaturalHeight: 500,
            sourceGenerationTaskId: 'task-3',
            sourceGenerationTaskType: 'image',
            generatingTaskId: undefined,
        });
    });
});