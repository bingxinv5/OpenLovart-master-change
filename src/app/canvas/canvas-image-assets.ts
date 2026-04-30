import { fetchRemoteBlob } from '@/lib/blob-utils';
import { ensureImageRef, getImageBlob, getImageBlobUrl, isImageRef, saveImageBlob } from '@/lib/editor-kernel';
import {
    dataUrlToBlob,
    fitAspectRatioLabelToBounds,
    fitImageToBounds,
    getCanvasDisplaySize,
    inferImageAspectRatioLabel,
    readImageDimensions,
} from './canvas-page-utils';

export interface ImageMetricsAnchor {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ResolveImageDisplayMetricsOptions {
    maxWidth?: number;
    maxHeight?: number;
    anchor?: ImageMetricsAnchor;
}

export interface ImageDisplayMetrics {
    width: number;
    height: number;
    x?: number;
    y?: number;
    aspectRatio?: string;
}

export function fitImageDisplayMetrics(
    natural: { width: number; height: number },
    options?: ResolveImageDisplayMetricsOptions,
): ImageDisplayMetrics {
    const actualAspectRatio = inferImageAspectRatioLabel(natural.width, natural.height);
    const fitted = options?.maxWidth && options?.maxHeight
        ? fitImageToBounds(natural.width, natural.height, options.maxWidth, options.maxHeight)
        : getCanvasDisplaySize(natural.width, natural.height);

    if (!options?.anchor) {
        return {
            ...fitted,
            aspectRatio: actualAspectRatio,
        };
    }

    return {
        ...fitted,
        aspectRatio: actualAspectRatio,
        x: Math.round(options.anchor.x + (options.anchor.width - fitted.width) / 2),
        y: Math.round(options.anchor.y + (options.anchor.height - fitted.height) / 2),
    };
}

export async function normalizeGeneratedImageContent(
    content: string,
    source: string,
    options: {
        prefetchedBlob?: Blob | null;
        onStorageChanged?: () => void;
    } = {},
): Promise<string> {
    if (!content) return content;
    if (isImageRef(content)) return content;

    const notifyStorageChanged = () => {
        options.onStorageChanged?.();
    };

    try {
        if (content.startsWith('data:')) {
            const ref = await ensureImageRef(content);
            notifyStorageChanged();
            return ref;
        }

        if (content.startsWith('blob:')) {
            const blob = await fetch(content).then((response) => response.blob());
            const ref = await saveImageBlob(blob);
            if (ref) {
                notifyStorageChanged();
                return ref;
            }
            return content;
        }

        if (content.startsWith('http://') || content.startsWith('https://')) {
            const blob = options.prefetchedBlob ?? await fetchRemoteBlob(content, `lovart-${source}-image`);
            if (blob) {
                const ref = await saveImageBlob(blob);
                if (ref) {
                    notifyStorageChanged();
                    return ref;
                }
            }
        }
    } catch (error) {
        console.warn('[Workbench] Failed to localize generated image:', error);
    }

    return ensureImageRef(content);
}

export async function resolveImageDisplayMetrics(
    content: string,
    source: string,
    options?: ResolveImageDisplayMetricsOptions,
    prefetchedBlob?: Blob | null,
): Promise<ImageDisplayMetrics | null> {
    try {
        let blob: Blob | null = prefetchedBlob ?? null;

        if (!blob) {
            if (isImageRef(content)) {
                blob = await getImageBlob(content);
            } else if (content.startsWith('data:') || content.startsWith('blob:')) {
                blob = await dataUrlToBlob(content);
            } else if (content.startsWith('http://') || content.startsWith('https://')) {
                const filename = `lovart-${source}-image-metrics`;
                blob = await fetchRemoteBlob(content, filename);
            }
        }

        if (blob) {
            const natural = await readImageDimensions(blob);
            return fitImageDisplayMetrics(natural, options);
        }

        let imgSrc: string | null = null;
        if (isImageRef(content)) {
            imgSrc = await getImageBlobUrl(content);
        } else if (content) {
            imgSrc = content;
        }

        if (imgSrc) {
            const natural = await new Promise<{ width: number; height: number }>((resolve, reject) => {
                const img = new window.Image();
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = imgSrc;
            });
            return fitImageDisplayMetrics(natural, options);
        }

        return null;
    } catch (error) {
        console.warn('[Workbench] Failed to resolve image display metrics:', error);
        return null;
    }
}

export function resolveAspectRatioFallbackMetrics(
    aspectRatio: string | undefined,
    anchor?: ImageMetricsAnchor,
): ImageDisplayMetrics | null {
    if (!anchor) {
        return null;
    }

    const fitted = fitAspectRatioLabelToBounds(
        aspectRatio,
        Math.max(1, anchor.width),
        Math.max(1, anchor.height),
    );

    if (!fitted) {
        return null;
    }

    return {
        ...fitted,
        x: Math.round(anchor.x + (anchor.width - fitted.width) / 2),
        y: Math.round(anchor.y + (anchor.height - fitted.height) / 2),
    };
}