import { useCallback } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { createGenerationIdlePatch } from '@/lib/generation-task-state';
import { fetchRemoteBlob } from '@/lib/blob-utils';
import { removeGeneration } from './generation-persistence';
import type { ImageDisplayMetrics, ResolveImageDisplayMetricsOptions } from './canvas-image-assets';

export interface ImageFinalizeAnchor {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ImageFinalizerWorkbenchSettings {
    defaultImageFit: CanvasElement['imageFit'];
    defaultImageSurface: CanvasElement['imageSurface'];
}

export type NormalizeGeneratedImageContentFn = (
    content: string,
    source: string,
    prefetchedBlob?: Blob | null,
) => Promise<string>;

export type ResolveImageDisplayMetricsFn = (
    content: string,
    source: string,
    options?: ResolveImageDisplayMetricsOptions,
    prefetchedBlob?: Blob | null,
) => Promise<ImageDisplayMetrics | null>;

export type ResolveAspectRatioFallbackMetricsFn = (
    aspectRatio: string | undefined,
    anchor?: ImageFinalizeAnchor,
) => ImageDisplayMetrics | null;

export type PersistGeneratedAssetToDiskFn = (
    content: string,
    kind: 'image' | 'video',
    source: string,
    prefetchedBlob?: Blob | null,
) => Promise<void>;

export type PrimeRuntimeImageRenderSrcFn = (elementId: string, blob: Blob) => void;

export type RecordProjectMediaItemFn = (params: {
    kind: 'image' | 'video' | 'audio';
    content: string;
    taskId?: string;
    prompt?: string;
    sourceElement?: CanvasElement | null;
    sourceElementId?: string;
}) => void;

export interface UseImageFinalizerParams {
    elementsMapRef: React.MutableRefObject<Map<string, CanvasElement>>;
    currentProjectIdRef: React.MutableRefObject<string | null>;
    dirtyTrackerRef: React.MutableRefObject<{ markModified(elementId: string): void }>;
    setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
    workbenchSettings: ImageFinalizerWorkbenchSettings;
    normalizeGeneratedImageContent: NormalizeGeneratedImageContentFn;
    resolveImageDisplayMetrics: ResolveImageDisplayMetricsFn;
    resolveAspectRatioFallbackMetrics: ResolveAspectRatioFallbackMetricsFn;
    persistGeneratedAssetToDisk: PersistGeneratedAssetToDiskFn;
    primeRuntimeImageRenderSrc: PrimeRuntimeImageRenderSrcFn;
    recordProjectMediaItem: RecordProjectMediaItemFn;
}

export function normalizeImageTaskId(taskId?: string | null): string | undefined {
    return typeof taskId === 'string' && taskId.trim().length > 0
        ? taskId.trim()
        : undefined;
}

export function buildImageFinalizeAnchor(element: CanvasElement): ImageFinalizeAnchor {
    return {
        x: element.x,
        y: element.y,
        width: element.width || 400,
        height: element.height || 400,
    };
}

export function buildPendingImageElement(
    element: CanvasElement,
    params: {
        imageUrl: string;
        taskId?: string | null;
        previewMetrics?: ImageDisplayMetrics | null;
        defaultImageSurface: CanvasElement['imageSurface'];
    },
): CanvasElement {
    const normalizedTaskId = normalizeImageTaskId(params.taskId);

    return {
        ...element,
        type: 'image',
        content: params.imageUrl,
        flowReferenceImages: element.savedReferenceImages || element.flowReferenceImages,
        referenceImageId: undefined,
        savedReferenceImages: undefined,
        savedReferenceImage: undefined,
        imageFit: 'cover',
        imageSurface: element.imageSurface || params.defaultImageSurface,
        width: params.previewMetrics?.width ?? element.width,
        height: params.previewMetrics?.height ?? element.height,
        x: params.previewMetrics?.x ?? element.x,
        y: params.previewMetrics?.y ?? element.y,
        sourceGenerationTaskId: normalizedTaskId,
        sourceGenerationTaskType: normalizedTaskId ? 'image' : undefined,
        ...createGenerationIdlePatch(),
    };
}

export function buildFinalizedAiEditedImageElement(
    element: CanvasElement,
    params: {
        content: string;
        metrics?: ImageDisplayMetrics | null;
        taskId?: string | null;
        defaultImageFit: CanvasElement['imageFit'];
        defaultImageSurface: CanvasElement['imageSurface'];
    },
): CanvasElement {
    const normalizedTaskId = normalizeImageTaskId(params.taskId);

    return {
        ...element,
        type: 'image',
        content: params.content,
        selectedAspectRatio: params.metrics?.aspectRatio ?? element.selectedAspectRatio,
        imageFit: element.imageFit || params.defaultImageFit,
        imageSurface: element.imageSurface || params.defaultImageSurface,
        width: params.metrics?.width ?? element.width,
        height: params.metrics?.height ?? element.height,
        x: params.metrics?.x ?? element.x,
        y: params.metrics?.y ?? element.y,
        sourceGenerationTaskId: normalizedTaskId,
        sourceGenerationTaskType: normalizedTaskId ? 'image' : undefined,
        ...createGenerationIdlePatch(),
    };
}

export function buildFinalizedGeneratedImageElement(
    element: CanvasElement,
    previousElement: CanvasElement | null,
    params: {
        content: string;
        metrics?: ImageDisplayMetrics | null;
        taskId?: string | null;
        defaultImageFit: CanvasElement['imageFit'];
        defaultImageSurface: CanvasElement['imageSurface'];
    },
): CanvasElement {
    const normalizedTaskId = normalizeImageTaskId(params.taskId);

    return {
        ...element,
        type: 'image',
        content: params.content,
        flowReferenceImages: previousElement?.flowReferenceImages || previousElement?.savedReferenceImages,
        referenceImageId: undefined,
        savedReferenceImages: undefined,
        savedReferenceImage: undefined,
        selectedAspectRatio: params.metrics?.aspectRatio ?? element.selectedAspectRatio,
        imageFit: params.defaultImageFit,
        imageSurface: element.imageSurface || params.defaultImageSurface,
        width: params.metrics?.width ?? element.width,
        height: params.metrics?.height ?? element.height,
        x: params.metrics?.x ?? element.x,
        y: params.metrics?.y ?? element.y,
        sourceGenerationTaskId: normalizedTaskId,
        sourceGenerationTaskType: normalizedTaskId ? 'image' : undefined,
        ...createGenerationIdlePatch(),
    };
}

async function prefetchFinalImage(
    elementId: string,
    resultUrl: string,
    source: string,
    primeRuntimeImageRenderSrc: PrimeRuntimeImageRenderSrcFn,
): Promise<Blob | null> {
    if (!resultUrl.startsWith('http://') && !resultUrl.startsWith('https://')) {
        return null;
    }

    const prefetchedBlob = await fetchRemoteBlob(resultUrl, `lovart-${source}-image`);
    if (prefetchedBlob) {
        primeRuntimeImageRenderSrc(elementId, prefetchedBlob);
    }
    return prefetchedBlob;
}

async function resolveFinalImageMetrics(params: {
    finalContent: string;
    resultUrl: string;
    source: string;
    anchor?: ImageFinalizeAnchor;
    prefetchedBlob?: Blob | null;
    previousAspectRatio?: string;
    resolveImageDisplayMetrics: ResolveImageDisplayMetricsFn;
    resolveAspectRatioFallbackMetrics?: ResolveAspectRatioFallbackMetricsFn;
}): Promise<ImageDisplayMetrics | null> {
    const displayOptions = params.anchor ? {
        maxWidth: params.anchor.width,
        maxHeight: params.anchor.height,
        anchor: params.anchor,
    } : undefined;

    let imageMetrics = await params.resolveImageDisplayMetrics(
        params.finalContent,
        params.source,
        displayOptions,
        params.prefetchedBlob,
    );

    if (!imageMetrics && params.finalContent !== params.resultUrl) {
        imageMetrics = await params.resolveImageDisplayMetrics(
            params.resultUrl,
            params.source,
            displayOptions,
            params.prefetchedBlob,
        );
    }

    if (!imageMetrics && params.resolveAspectRatioFallbackMetrics) {
        return params.resolveAspectRatioFallbackMetrics(params.previousAspectRatio, params.anchor);
    }

    return imageMetrics;
}

export function useImageFinalizer(params: UseImageFinalizerParams) {
    const finalizeAiEditedImageElement = useCallback(async (
        elementId: string,
        resultUrl: string,
        source: string,
        anchor?: ImageFinalizeAnchor,
        taskId?: string | null,
    ) => {
        const normalizedTaskId = normalizeImageTaskId(taskId);
        const prefetchedBlob = await prefetchFinalImage(
            elementId,
            resultUrl,
            source,
            params.primeRuntimeImageRenderSrc,
        );
        const finalContent = await params.normalizeGeneratedImageContent(resultUrl, source, prefetchedBlob);
        const imageMetrics = await resolveFinalImageMetrics({
            finalContent,
            resultUrl,
            source,
            anchor,
            prefetchedBlob,
            resolveImageDisplayMetrics: params.resolveImageDisplayMetrics,
        });

        void params.persistGeneratedAssetToDisk(finalContent, 'image', source, prefetchedBlob);
        params.setElements((prev) => prev.map((item) => (
            item.id === elementId
                ? buildFinalizedAiEditedImageElement(item, {
                    content: finalContent,
                    metrics: imageMetrics,
                    taskId: normalizedTaskId,
                    defaultImageFit: params.workbenchSettings.defaultImageFit,
                    defaultImageSurface: params.workbenchSettings.defaultImageSurface,
                })
                : item
        )));
        params.dirtyTrackerRef.current.markModified(elementId);

        const projectId = params.currentProjectIdRef.current;
        if (projectId) {
            removeGeneration(projectId, elementId);
        }
    }, [params]);

    const replaceGeneratorWithPendingImage = useCallback((
        elementId: string,
        imageUrl: string,
        taskId?: string | null,
    ) => {
        const normalizedTaskId = normalizeImageTaskId(taskId);
        params.setElements((prev) => prev.map((item) => {
            if (item.id !== elementId) {
                return item;
            }

            const previewMetrics = params.resolveAspectRatioFallbackMetrics(
                item.selectedAspectRatio,
                buildImageFinalizeAnchor(item),
            );
            return buildPendingImageElement(item, {
                imageUrl,
                taskId: normalizedTaskId,
                previewMetrics,
                defaultImageSurface: params.workbenchSettings.defaultImageSurface,
            });
        }));
        params.dirtyTrackerRef.current.markModified(elementId);

        const projectId = params.currentProjectIdRef.current;
        if (projectId) {
            removeGeneration(projectId, elementId);
        }
    }, [params]);

    const finalizeGeneratedImageElement = useCallback(async (
        elementId: string,
        resultUrl: string,
        source: string,
        anchor?: ImageFinalizeAnchor,
        taskId?: string | null,
    ) => {
        const previousElement = params.elementsMapRef.current.get(elementId) || null;
        const normalizedTaskId = normalizeImageTaskId(taskId);
        const prefetchedBlob = await prefetchFinalImage(
            elementId,
            resultUrl,
            source,
            params.primeRuntimeImageRenderSrc,
        );
        const finalContent = await params.normalizeGeneratedImageContent(resultUrl, source, prefetchedBlob);
        const imageMetrics = await resolveFinalImageMetrics({
            finalContent,
            resultUrl,
            source,
            anchor,
            prefetchedBlob,
            previousAspectRatio: previousElement?.selectedAspectRatio,
            resolveImageDisplayMetrics: params.resolveImageDisplayMetrics,
            resolveAspectRatioFallbackMetrics: params.resolveAspectRatioFallbackMetrics,
        });

        void params.persistGeneratedAssetToDisk(finalContent, 'image', source, prefetchedBlob);
        params.setElements((prev) => prev.map((item) => (
            item.id === elementId
                ? buildFinalizedGeneratedImageElement(item, previousElement, {
                    content: finalContent,
                    metrics: imageMetrics,
                    taskId: normalizedTaskId,
                    defaultImageFit: params.workbenchSettings.defaultImageFit,
                    defaultImageSurface: params.workbenchSettings.defaultImageSurface,
                })
                : item
        )));
        params.dirtyTrackerRef.current.markModified(elementId);

        const projectId = params.currentProjectIdRef.current;
        if (projectId) {
            removeGeneration(projectId, elementId);
        }
        params.recordProjectMediaItem({
            kind: 'image',
            content: finalContent,
            taskId: normalizedTaskId,
            sourceElement: previousElement,
            sourceElementId: elementId,
        });
    }, [params]);

    const finalizePolledImageResult = useCallback(async (
        element: CanvasElement,
        resultUrl: string,
    ) => {
        const anchor = buildImageFinalizeAnchor(element);

        if (element.type === 'image') {
            await finalizeAiEditedImageElement(element.id, resultUrl, 'poll-ai-edit', anchor, element.generatingTaskId);
            return;
        }

        replaceGeneratorWithPendingImage(element.id, resultUrl, element.generatingTaskId);
        await finalizeGeneratedImageElement(element.id, resultUrl, 'poll', anchor, element.generatingTaskId);
    }, [finalizeAiEditedImageElement, finalizeGeneratedImageElement, replaceGeneratorWithPendingImage]);

    return {
        finalizeAiEditedImageElement,
        replaceGeneratorWithPendingImage,
        finalizeGeneratedImageElement,
        finalizePolledImageResult,
    };
}