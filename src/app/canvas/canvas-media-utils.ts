/**
 * canvas-media-utils.ts — 图片尺寸、缩略图和视口计算工具
 *
 * 包含图片尺寸计算、视口碰撞检测等纯计算函数。
 * 几何布局评分位于 canvas-geometry-utils.ts。
 */

import type { CanvasElement } from '@/components/lovart/canvas-types';
import type { WorkbenchSettings } from '@/lib/workbench-settings';
import { isImageRef, saveImage } from '@/lib/editor-kernel';
import { pickProjectThumbnailCandidate } from '@/lib/project-thumbnail';
import { getCachedVideoThumbnailDataUrl } from '@/lib/video-load-state';
import { getViewportSize } from './canvas-focus';
import { MAX_CANVAS_IMAGE_SIZE, STORAGE_CRITICAL_THRESHOLD, STORAGE_WARN_THRESHOLD, STORAGE_INFO_THRESHOLD } from './canvas-runtime-types';

const KNOWN_IMAGE_ASPECT_RATIOS = [
    { label: '1:1', width: 1, height: 1 },
    { label: '4:3', width: 4, height: 3 },
    { label: '3:4', width: 3, height: 4 },
    { label: '16:9', width: 16, height: 9 },
    { label: '9:16', width: 9, height: 16 },
    { label: '2:3', width: 2, height: 3 },
    { label: '3:2', width: 3, height: 2 },
    { label: '4:5', width: 4, height: 5 },
    { label: '5:4', width: 5, height: 4 },
    { label: '21:9', width: 21, height: 9 },
] as const;

// ── Image Sizing Utilities ───────────────────────────────────

export function getCanvasDisplaySize(naturalWidth: number, naturalHeight: number) {
    let width = naturalWidth;
    let height = naturalHeight;

    if (width > MAX_CANVAS_IMAGE_SIZE || height > MAX_CANVAS_IMAGE_SIZE) {
        if (width >= height) {
            height = Math.round(height * (MAX_CANVAS_IMAGE_SIZE / width));
            width = MAX_CANVAS_IMAGE_SIZE;
        } else {
            width = Math.round(width * (MAX_CANVAS_IMAGE_SIZE / height));
            height = MAX_CANVAS_IMAGE_SIZE;
        }
    }

    return { width, height };
}

export async function readImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file);
            const dimensions = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            return dimensions;
        } catch {
            // Fallback to HTMLImageElement decoding for environments where
            // createImageBitmap cannot decode user-provided uploads reliably.
        }
    }

    return new Promise((resolve, reject) => {
        const img = new window.Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
            URL.revokeObjectURL(url);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to decode image'));
        };
        img.src = url;
    });
}

export function fitImageToBounds(
    naturalWidth: number,
    naturalHeight: number,
    maxWidth: number,
    maxHeight: number,
): { width: number; height: number } {
    if (naturalWidth <= 0 || naturalHeight <= 0) {
        return { width: maxWidth, height: maxHeight };
    }

    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
    return {
        width: Math.max(1, Math.round(naturalWidth * scale)),
        height: Math.max(1, Math.round(naturalHeight * scale)),
    };
}

export function parseAspectRatioLabel(
    aspectRatio: string | undefined | null,
): { label: string; width: number; height: number } | null {
    if (!aspectRatio || aspectRatio === 'auto') {
        return null;
    }

    const preset = KNOWN_IMAGE_ASPECT_RATIOS.find((item) => item.label === aspectRatio);
    if (preset) {
        return {
            label: preset.label,
            width: preset.width,
            height: preset.height,
        };
    }

    const matched = aspectRatio.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
    if (!matched) {
        return null;
    }

    const width = Number.parseInt(matched[1], 10);
    const height = Number.parseInt(matched[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }

    return {
        label: `${width}:${height}`,
        width,
        height,
    };
}

export function fitAspectRatioLabelToBounds(
    aspectRatio: string | undefined | null,
    maxWidth: number,
    maxHeight: number,
): { width: number; height: number; aspectRatio: string } | null {
    const parsed = parseAspectRatioLabel(aspectRatio);
    if (!parsed) {
        return null;
    }

    return {
        ...fitImageToBounds(parsed.width, parsed.height, maxWidth, maxHeight),
        aspectRatio: parsed.label,
    };
}

export function inferImageAspectRatioLabel(
    naturalWidth: number,
    naturalHeight: number,
): string | undefined {
    if (naturalWidth <= 0 || naturalHeight <= 0) {
        return undefined;
    }

    const actualRatio = naturalWidth / naturalHeight;
    let closestLabel: string | undefined;
    let closestRelativeDelta = Number.POSITIVE_INFINITY;

    for (const preset of KNOWN_IMAGE_ASPECT_RATIOS) {
        const presetRatio = preset.width / preset.height;
        const relativeDelta = Math.abs(actualRatio - presetRatio) / presetRatio;

        if (relativeDelta < closestRelativeDelta) {
            closestRelativeDelta = relativeDelta;
            closestLabel = preset.label;
        }
    }

    return closestRelativeDelta <= 0.04 ? closestLabel : undefined;
}

// ── Concurrency Utility ──────────────────────────────────────

export async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            results[index] = await mapper(items[index], index);
        }
    });

    await Promise.all(workers);
    return results;
}

// ── Collection Utilities ─────────────────────────────────────

export function collectImageRefsFromElements(elements: CanvasElement[]): string[] {
    return elements
        .map(element => element.content)
        .filter((content): content is string => typeof content === 'string' && isImageRef(content));
}

// ── UI Helper Utilities ──────────────────────────────────────

export function getStorageBadgeClass(usageRatio: number): string {
    if (usageRatio >= STORAGE_CRITICAL_THRESHOLD) return 'bg-red-50 text-red-600';
    if (usageRatio >= STORAGE_WARN_THRESHOLD) return 'bg-amber-50 text-amber-600';
    if (usageRatio >= STORAGE_INFO_THRESHOLD) return 'bg-blue-50 text-blue-600';
    return 'bg-gray-100 text-gray-500';
}

export function getDefaultImagePresentation(settings: WorkbenchSettings) {
    return {
        imageFit: settings.defaultImageFit,
        imageSurface: settings.defaultImageSurface,
    } as const;
}

// ── Viewport Utilities ───────────────────────────────────────

export function getViewportBounds(scale: number, pan: { x: number; y: number }) {
    const viewport = getViewportSize(1440, 900);

    return {
        minX: (-pan.x) / scale,
        minY: (-pan.y) / scale,
        maxX: (viewport.width - pan.x) / scale,
        maxY: (viewport.height - pan.y) / scale,
    };
}

export function getElementViewportPriority(element: CanvasElement, viewport: ReturnType<typeof getViewportBounds>) {
    const width = element.width || 0;
    const height = element.height || 0;
    const elMinX = element.x;
    const elMinY = element.y;
    const elMaxX = element.x + width;
    const elMaxY = element.y + height;

    const intersects = elMaxX >= viewport.minX && elMinX <= viewport.maxX && elMaxY >= viewport.minY && elMinY <= viewport.maxY;
    if (intersects) {
        return 0;
    }

    const centerX = element.x + width / 2;
    const centerY = element.y + height / 2;
    const viewportCenterX = (viewport.minX + viewport.maxX) / 2;
    const viewportCenterY = (viewport.minY + viewport.maxY) / 2;
    const dx = centerX - viewportCenterX;
    const dy = centerY - viewportCenterY;
    return dx * dx + dy * dy;
}

// ── Project Thumbnail ────────────────────────────────────────

export async function deriveProjectThumbnail(elements: CanvasElement[], uuidFn: () => string): Promise<string | null> {
    const candidate = pickProjectThumbnailCandidate(elements);
    if (!candidate) return null;

    if (candidate.kind === 'image') {
        return candidate.content;
    }

    const thumbnailDataUrl = await getCachedVideoThumbnailDataUrl(candidate.content);
    if (!thumbnailDataUrl) return null;

    return await saveImage(thumbnailDataUrl, uuidFn());
}
