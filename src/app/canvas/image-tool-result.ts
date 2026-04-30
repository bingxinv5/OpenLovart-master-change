import type { CanvasElement } from '@/components/lovart/canvas-types';
import type { ImageDisplayMetrics, ResolveImageDisplayMetricsOptions } from './canvas-image-assets';

export type SaveImageToolBlob = (blob: Blob) => Promise<string>;
export type ResolveImageToolMetrics = (
    content: string,
    source: string,
    options?: ResolveImageDisplayMetricsOptions,
    prefetchedBlob?: Blob | null,
) => Promise<ImageDisplayMetrics | null>;
export type BuildImageToolMetricsOptions = (
    element: CanvasElement,
    maxHeightPadding?: number,
) => ResolveImageDisplayMetricsOptions;
export type BuildImageToolResultElement = (params: {
    source: CanvasElement;
    metrics: ImageDisplayMetrics | null;
    displayName?: string;
    content: string;
    extraAttrs?: Partial<CanvasElement>;
}) => CanvasElement;

export interface CreateSingleImageToolResultElementParams {
    sourceElement: CanvasElement;
    resultBlob: Blob;
    metricsSource: string;
    displayName?: string;
    extraAttrs?: Partial<CanvasElement>;
    maxHeightPadding?: number;
    onContentSaved?: () => void;
    saveBlob: SaveImageToolBlob;
    resolveImageDisplayMetrics: ResolveImageToolMetrics;
    buildDisplayMetricsOptions: BuildImageToolMetricsOptions;
    buildResultElement: BuildImageToolResultElement;
}

export async function createSingleImageToolResultElement(
    params: CreateSingleImageToolResultElementParams,
): Promise<{
    content: string;
    metrics: ImageDisplayMetrics | null;
    element: CanvasElement;
}> {
    const content = await params.saveBlob(params.resultBlob);
    params.onContentSaved?.();
    const metrics = await params.resolveImageDisplayMetrics(
        content,
        params.metricsSource,
        params.buildDisplayMetricsOptions(params.sourceElement, params.maxHeightPadding),
        params.resultBlob,
    );
    const element = params.buildResultElement({
        source: params.sourceElement,
        metrics,
        displayName: params.displayName,
        content,
        extraAttrs: params.extraAttrs,
    });

    return {
        content,
        metrics,
        element,
    };
}