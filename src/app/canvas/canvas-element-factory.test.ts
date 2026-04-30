import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CanvasElement, CanvasImageElement, CanvasStoryboardPlannerElement, CanvasVideoElement } from '@/components/lovart/canvas-types';
import {
    buildBelowElementDisplayMetricsOptions,
    buildBelowSourceImageResultElement,
    buildGeneratorElement,
    buildImageElement,
    buildVideoElement,
} from './canvas-element-factory';

const uuidFn = () => 'fixed-id';

function makeSource(overrides: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id: 'source-id',
        type: 'image',
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        content: 'imgref:source',
        ...overrides,
    };
}

describe('canvas-element-factory', () => {
    it('builds panel metrics options below a source element', () => {
        expect(buildBelowElementDisplayMetricsOptions(makeSource(), 50)).toEqual({
            maxWidth: 200,
            maxHeight: 150,
            anchor: {
                x: 10,
                y: 160,
                width: 200,
                height: 150,
            },
        });
    });

    it('builds image elements with injected id and default presentation', () => {
        const element = buildImageElement({
            x: 1,
            y: 2,
            width: 300,
            height: 200,
            content: 'imgref:new',
        }, {
            uuidFn,
            defaultPresentation: { imageFit: 'contain', imageSurface: 'checker' },
        });

        expectTypeOf(element).toEqualTypeOf<CanvasImageElement>();
        expect(element).toMatchObject({
            id: 'fixed-id',
            type: 'image',
            imageFit: 'contain',
            imageSurface: 'checker',
        });
    });

    it('builds image results below the source when metrics are missing', () => {
        expect(buildBelowSourceImageResultElement({
            source: makeSource(),
            content: 'imgref:result',
            displayName: 'result image',
            extraAttrs: { annotationTitle: 'A' },
        }, { uuidFn })).toMatchObject({
            id: 'fixed-id',
            type: 'image',
            x: 10,
            y: 160,
            width: 200,
            height: 100,
            content: 'imgref:result',
            displayName: 'result image',
            annotationTitle: 'A',
        });
    });

    it('uses measured result metrics when provided', () => {
        expect(buildBelowSourceImageResultElement({
            source: makeSource(),
            metrics: { x: 30, y: 40, width: 120, height: 90 },
            content: 'imgref:result',
        }, { uuidFn })).toMatchObject({
            x: 30,
            y: 40,
            width: 120,
            height: 90,
        });
    });

    it('builds video and generator elements', () => {
        const videoElement = buildVideoElement({ x: 0, y: 0, width: 400, height: 300, content: 'video' }, { uuidFn });
        const plannerElement = buildGeneratorElement('storyboard-planner', { x: 0, y: 0, width: 420, height: 320 }, { uuidFn });

        expectTypeOf(videoElement).toEqualTypeOf<CanvasVideoElement>();
        expectTypeOf(plannerElement).toEqualTypeOf<CanvasStoryboardPlannerElement>();
        expect(videoElement).toMatchObject({
            id: 'fixed-id',
            type: 'video',
        });
        expect(plannerElement).toMatchObject({
            id: 'fixed-id',
            type: 'storyboard-planner',
        });
    });
});