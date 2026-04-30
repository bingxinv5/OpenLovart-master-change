import { useCallback } from 'react';
import { hasCurrentCanvasLegacyMigration, markCanvasLegacyMigrationApplied, type CanvasElement } from '@/components/lovart/canvas-types';
import { cleanupUnusedImages, elementStore } from '@/lib/editor-kernel';
import { debugLog } from '@/lib/debug-log';
import { collectRetainedLocalImageRefs } from '@/lib/local-image-ref-usage';
import type { WorkbenchSettings } from '@/lib/workbench-settings';
import { fetchRemoteBlob } from '@/lib/blob-utils';
import {
    BACKGROUND_IMAGE_FIX_BATCH_SIZE,
    BACKGROUND_IMAGE_FIX_CONCURRENCY,
} from './canvas-runtime-types';
import {
    collectImageRefsFromElements,
    getElementViewportPriority,
    getViewportBounds,
    mapWithConcurrency,
} from './canvas-media-utils';

type ImageDisplayMetrics = { width: number; height: number; x?: number; y?: number };

interface UseCanvasImageMigrationOptions {
    scale: number;
    pan: { x: number; y: number };
    workbenchSettings: WorkbenchSettings;
    refreshStorageEstimate: () => Promise<void> | void;
    normalizeGeneratedImageContent: (content: string, source: string, prefetchedBlob?: Blob | null) => Promise<string>;
    resolveImageDisplayMetrics: (
        content: string,
        source: string,
        options: {
            maxWidth: number;
            maxHeight: number;
            anchor: { x: number; y: number; width: number; height: number };
        },
        prefetchedBlob?: Blob | null,
    ) => Promise<ImageDisplayMetrics | null>;
}

export function useCanvasImageMigration({
    scale,
    pan,
    workbenchSettings,
    refreshStorageEstimate,
    normalizeGeneratedImageContent,
    resolveImageDisplayMetrics,
}: UseCanvasImageMigrationOptions) {
    const syncImageStoreCleanup = useCallback(async (currentElements: CanvasElement[]) => {
        try {
            const persistedRefs = await elementStore.collectAllImageRefs();
            const liveRefs = new Set<string>([
                ...persistedRefs,
                ...collectImageRefsFromElements(currentElements),
                ...collectRetainedLocalImageRefs(),
            ]);
            const removedCount = await cleanupUnusedImages(liveRefs);
            if (removedCount > 0) {
                debugLog(`[ImageStore] Cleaned ${removedCount} orphaned images`);
            }
            await refreshStorageEstimate();
        } catch (error) {
            console.warn('[ImageStore] Cleanup skipped:', error);
        }
    }, [refreshStorageEstimate]);

    const normalizeLoadedImageElements = useCallback(async (
        loadedElements: CanvasElement[],
        options?: {
            onProgress?: (elements: CanvasElement[], normalizedIds: string[]) => void;
        },
    ) => {
        const normalizedIds: string[] = [];

        const viewport = getViewportBounds(scale, pan);
        const prioritizedElements = loadedElements
            .map((element, index) => ({
                element,
                index,
                priority: element.type === 'image' ? getElementViewportPriority(element, viewport) : Number.MAX_SAFE_INTEGER,
            }))
            .sort((a, b) => a.priority - b.priority);

        const normalizedElements = [...loadedElements];

        for (let start = 0; start < prioritizedElements.length; start += BACKGROUND_IMAGE_FIX_BATCH_SIZE) {
            const batch = prioritizedElements.slice(start, start + BACKGROUND_IMAGE_FIX_BATCH_SIZE);
            const batchNormalizedIds: string[] = [];

            const batchResults = await mapWithConcurrency(batch, BACKGROUND_IMAGE_FIX_CONCURRENCY, async ({ element, index }) => {
                if (element.type !== 'image' || !element.content) {
                    return { index, element, changed: false };
                }

                const originalContent = element.content;
                const hasCurrentLegacyMigration = hasCurrentCanvasLegacyMigration(element);
                let loadBlob: Blob | null = null;
                const isRemoteUrl = originalContent.startsWith('http://') || originalContent.startsWith('https://');
                if (isRemoteUrl) {
                    loadBlob = await fetchRemoteBlob(originalContent, 'lovart-load-image');
                }
                const localizedContent = isRemoteUrl
                    ? await normalizeGeneratedImageContent(originalContent, 'load-localize', loadBlob)
                    : originalContent;

                const nextElement: CanvasElement = {
                    ...element,
                    content: localizedContent,
                    imageFit: element.imageFit || workbenchSettings.defaultImageFit,
                    imageSurface: element.imageSurface || workbenchSettings.defaultImageSurface,
                };

                const isLegacyPresentation = !hasCurrentLegacyMigration && (!element.imageFit || !element.imageSurface);
                const shouldMeasure = isLegacyPresentation;
                const hasLocalizedContent = localizedContent !== originalContent;

                if (!shouldMeasure) {
                    const changed = hasLocalizedContent || nextElement.imageFit !== element.imageFit || nextElement.imageSurface !== element.imageSurface;
                    if (changed) {
                        normalizedIds.push(element.id);
                        batchNormalizedIds.push(element.id);
                    }
                    return { index, element: changed ? markCanvasLegacyMigrationApplied(nextElement) : nextElement, changed };
                }

                const metrics = await resolveImageDisplayMetrics(localizedContent, 'load-legacy', {
                    maxWidth: element.width || 400,
                    maxHeight: element.height || 400,
                    anchor: {
                        x: element.x,
                        y: element.y,
                        width: element.width || 400,
                        height: element.height || 400,
                    },
                }, loadBlob);

                if (!metrics) {
                    const changed = hasLocalizedContent || nextElement.imageFit !== element.imageFit || nextElement.imageSurface !== element.imageSurface;
                    if (changed) {
                        normalizedIds.push(element.id);
                        batchNormalizedIds.push(element.id);
                    }
                    return { index, element: changed ? markCanvasLegacyMigrationApplied(nextElement) : nextElement, changed };
                }

                const hasVisualChange =
                    nextElement.width !== metrics.width ||
                    nextElement.height !== metrics.height ||
                    nextElement.x !== metrics.x ||
                    nextElement.y !== metrics.y ||
                    hasLocalizedContent ||
                    nextElement.imageFit !== element.imageFit ||
                    nextElement.imageSurface !== element.imageSurface;

                if (hasVisualChange) {
                    normalizedIds.push(element.id);
                    batchNormalizedIds.push(element.id);
                }

                const normalizedElement: CanvasElement = {
                    ...nextElement,
                    width: metrics.width,
                    height: metrics.height,
                    x: metrics.x ?? nextElement.x,
                    y: metrics.y ?? nextElement.y,
                };

                return {
                    index,
                    changed: hasVisualChange,
                    element: hasVisualChange ? markCanvasLegacyMigrationApplied(normalizedElement) : normalizedElement,
                };
            });

            for (const result of batchResults) {
                normalizedElements[result.index] = result.element;
            }

            if (batchNormalizedIds.length > 0) {
                options?.onProgress?.([...normalizedElements], batchNormalizedIds);
            }

            if (start + BACKGROUND_IMAGE_FIX_BATCH_SIZE < prioritizedElements.length) {
                await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
            }
        }

        return {
            elements: normalizedElements,
            normalizedIds,
        };
    }, [normalizeGeneratedImageContent, pan, resolveImageDisplayMetrics, scale, workbenchSettings.defaultImageFit, workbenchSettings.defaultImageSurface]);

    return {
        syncImageStoreCleanup,
        normalizeLoadedImageElements,
    };
}