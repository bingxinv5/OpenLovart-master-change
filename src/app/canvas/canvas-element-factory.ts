import type { CanvasElement, CanvasElementOfType } from '@/components/lovart/canvas-types';

type ElementFactoryDeps = {
    uuidFn: () => string;
};

type ImageElementFactoryDeps = ElementFactoryDeps & {
    defaultPresentation?: Partial<CanvasElement>;
};

type CanvasGeneratorElementType = Extract<CanvasElement['type'], 'image-generator' | 'video-generator' | 'storyboard-planner'>;

export type ImageDisplayMetrics = {
    x?: number;
    y?: number;
    width: number;
    height: number;
};

export function buildBelowElementDisplayMetricsOptions(element: CanvasElement, maxHeightPadding = 0) {
    const width = element.width || 400;
    const height = (element.height || 400) + maxHeightPadding;
    return {
        maxWidth: width,
        maxHeight: height,
        anchor: {
            x: element.x,
            y: element.y + (element.height || 0) + 40,
            width,
            height,
        },
    };
}

export function buildImageElement(
    attrs: Omit<CanvasElement, 'id' | 'type'>,
    deps: ImageElementFactoryDeps,
): CanvasElementOfType<'image'> {
    return {
        id: deps.uuidFn(),
        type: 'image' as const,
        ...attrs,
        ...deps.defaultPresentation,
    } as CanvasElementOfType<'image'>;
}

export function buildBelowSourceImageResultElement(params: {
    source: CanvasElement;
    metrics?: ImageDisplayMetrics | null;
    content: string;
    displayName?: string;
    extraAttrs?: Partial<CanvasElement>;
}, deps: ImageElementFactoryDeps) {
    const { source, metrics, content, displayName, extraAttrs } = params;
    return buildImageElement({
        x: metrics?.x ?? source.x,
        y: metrics?.y ?? source.y + (source.height || 0) + 40,
        width: metrics?.width ?? source.width,
        height: metrics?.height ?? source.height,
        displayName,
        content,
        ...extraAttrs,
    }, deps);
}

export function buildVideoElement(
    attrs: Omit<CanvasElement, 'id' | 'type'>,
    deps: ElementFactoryDeps,
): CanvasElementOfType<'video'> {
    return {
        id: deps.uuidFn(),
        type: 'video' as const,
        ...attrs,
    } as CanvasElementOfType<'video'>;
}

export function buildGeneratorElement<TType extends CanvasGeneratorElementType>(
    type: TType,
    attrs: Omit<CanvasElement, 'id' | 'type'>,
    deps: ElementFactoryDeps,
): CanvasElementOfType<TType> {
    return {
        id: deps.uuidFn(),
        type,
        ...attrs,
    } as CanvasElementOfType<TType>;
}
