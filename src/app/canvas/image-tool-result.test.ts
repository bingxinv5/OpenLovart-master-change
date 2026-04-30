import { describe, expect, it, vi } from 'vitest';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { createSingleImageToolResultElement } from './image-tool-result';

describe('image-tool-result', () => {
    it('saves a tool blob, measures it, and builds a result element', async () => {
        const sourceElement = {
            id: 'source-1',
            type: 'image',
            x: 10,
            y: 20,
            width: 300,
            height: 200,
            content: 'imgref:source',
        } as CanvasElement;
        const resultBlob = new Blob(['result'], { type: 'image/png' });
        const saveBlob = vi.fn(async () => 'imgref:result');
        const buildDisplayMetricsOptions = vi.fn(() => ({
            maxWidth: 300,
            maxHeight: 360,
            anchor: { x: 10, y: 260, width: 300, height: 360 },
        }));
        const resolveImageDisplayMetrics = vi.fn(async () => ({
            x: 25,
            y: 280,
            width: 260,
            height: 180,
            aspectRatio: '16:9',
        }));
        const onContentSaved = vi.fn();
        const buildResultElement = vi.fn((params) => ({
            id: 'result-1',
            type: 'image',
            x: params.metrics?.x ?? 0,
            y: params.metrics?.y ?? 0,
            width: params.metrics?.width ?? 100,
            height: params.metrics?.height ?? 100,
            content: params.content,
            displayName: params.displayName,
            ...params.extraAttrs,
        } as CanvasElement));

        const result = await createSingleImageToolResultElement({
            sourceElement,
            resultBlob,
            metricsSource: 'annotate-image',
            displayName: '标注结果',
            extraAttrs: { annotationTitle: 'Title' },
            maxHeightPadding: 160,
            onContentSaved,
            saveBlob,
            resolveImageDisplayMetrics,
            buildDisplayMetricsOptions,
            buildResultElement,
        });

        expect(saveBlob).toHaveBeenCalledWith(resultBlob);
        expect(onContentSaved).toHaveBeenCalledOnce();
        expect(buildDisplayMetricsOptions).toHaveBeenCalledWith(sourceElement, 160);
        expect(resolveImageDisplayMetrics).toHaveBeenCalledWith(
            'imgref:result',
            'annotate-image',
            expect.objectContaining({ maxWidth: 300 }),
            resultBlob,
        );
        expect(result.element).toMatchObject({
            id: 'result-1',
            content: 'imgref:result',
            displayName: '标注结果',
            annotationTitle: 'Title',
            width: 260,
            height: 180,
        });
    });
});