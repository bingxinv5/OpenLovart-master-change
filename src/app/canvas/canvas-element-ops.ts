/**
 * Pure element-operation helpers extracted from page.tsx.
 *
 * Every function here is side-effect-free: no React state, no DOM, no storage.
 * Functions that need a UUID generator accept a `uuidFn` parameter.
 */

import type { CanvasElement, CanvasFrameElement, CanvasImageElement } from '@/components/lovart/canvas-types';
import { isImageRef, getImageDataUrl } from '@/lib/editor-kernel';

// ── Geometry / bounds ─────────────────────────────────────────────────

/** Build {x,y,width,height} centered on a given point. */
export function buildCenteredElementBounds(
    center: { x: number; y: number },
    width: number,
    height: number,
): { x: number; y: number; width: number; height: number } {
    return {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
    };
}

/** Calculate the canvas-space center from a mouse position, pan & scale; fallback to viewport center. */
export function calculateCanvasCenter(
    mousePos: { x: number; y: number } | null,
    pan: { x: number; y: number },
    scale: number,
    viewportWidth: number,
    viewportHeight: number,
): { x: number; y: number } {
    if (mousePos) return { ...mousePos };
    return {
        x: (viewportWidth / 2 - pan.x) / scale,
        y: (viewportHeight / 2 - pan.y) / scale,
    };
}

// ── Selection helpers ─────────────────────────────────────────────────

/** BFS-expand a set of IDs to include all frame descendants. */
export function collectSelectionWithFrameChildren(
    ids: string[],
    elements: CanvasElement[],
): string[] {
    const expanded = new Set(ids);
    const queue = [...ids];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        for (const element of elements) {
            if (element.parentFrameId === currentId && !expanded.has(element.id)) {
                expanded.add(element.id);
                if (element.type === 'frame') {
                    queue.push(element.id);
                }
            }
        }
    }

    return Array.from(expanded);
}

// ── Frame construction ────────────────────────────────────────────────

/** Build a group-frame that wraps the given items with padding. */
export function buildAutoGroupFrame(
    items: CanvasElement[],
    frameName: string,
    uuidFn: () => string,
): { frame: CanvasFrameElement; frameId: string } | null {
    const targetElements = items.filter(item => item.type !== 'connector');
    if (targetElements.length === 0) return null;

    const xs = targetElements.map(item => item.x);
    const ys = targetElements.map(item => item.y);
    const xe = targetElements.map(item => item.x + (item.width || 0));
    const ye = targetElements.map(item => item.y + (item.height || 0));
    const padding = 20;
    const frameId = uuidFn();

    const frame: CanvasFrameElement = {
            id: frameId,
            type: 'frame',
            x: Math.min(...xs) - padding,
            y: Math.min(...ys) - padding,
            width: Math.max(...xe) - Math.min(...xs) + padding * 2,
            height: Math.max(...ye) - Math.min(...ys) + padding * 2,
            framePreset: 'Custom',
            frameBgColor: '#FFFFFF',
            frameClip: true,
            frameName,
            groupFrame: true,
    };

    return {
        frame,
        frameId,
    };
}

// ── Image-element guards ──────────────────────────────────────────────

/** Check whether an element is a valid image with content. */
export function isValidImageElement(
    element: CanvasElement,
): element is CanvasImageElement & { content: string } {
    return element.type === 'image' && !!element.content;
}

// ── Reference-image resolution ────────────────────────────────────────

/** Resolve an element's savedReferenceImages JSON to data-URL array. */
export async function resolveElementReferenceImages(
    element: CanvasElement,
): Promise<string[]> {
    if (!element.savedReferenceImages?.trim()) return [];

    try {
        const parsed = JSON.parse(element.savedReferenceImages);
        if (!Array.isArray(parsed)) return [];

        const resolved = await Promise.all(parsed.map(async (item) => {
            if (typeof item !== 'string' || !item.trim()) return null;
            if (isImageRef(item)) return await getImageDataUrl(item);
            return item;
        }));

        return resolved.filter((item): item is string => typeof item === 'string' && item.length > 0);
    } catch {
        return [];
    }
}

/** Resolve an element's savedFrameImages JSON to typed image array. */
export async function resolveElementFrameImages(
    element: CanvasElement,
): Promise<Array<{ image: string; image_type: string }>> {
    if (!element.savedFrameImages?.trim()) return [];

    try {
        const parsed = JSON.parse(element.savedFrameImages);
        if (!Array.isArray(parsed)) return [];

        const resolved = await Promise.all(parsed.map(async (item) => {
            if (!item || typeof item !== 'object') return null;

            const frame = item as { image?: unknown; imageType?: unknown; image_type?: unknown };
            if (typeof frame.image !== 'string' || !frame.image.trim()) return null;

            const image = isImageRef(frame.image) ? await getImageDataUrl(frame.image) : frame.image;
            if (!image) return null;

            const imageType = typeof frame.imageType === 'string'
                ? frame.imageType
                : typeof frame.image_type === 'string'
                    ? frame.image_type
                    : 'reference';

            return { image, image_type: imageType };
        }));

        return resolved.filter((item): item is { image: string; image_type: string } => !!item);
    } catch {
        return [];
    }
}

// ── Content blob resolution ───────────────────────────────────────────

/** Resolve an element's content string to a Blob. */
export async function resolveCanvasContentBlob(
    content: string,
    remoteFilename: string,
    deps: {
        getImageBlob: (ref: string) => Promise<Blob | null>;
        dataUrlToBlob: (url: string) => Promise<Blob>;
        fetchRemoteBlob: (url: string, filename: string) => Promise<Blob | null>;
    },
): Promise<Blob | null> {
    if (isImageRef(content)) return deps.getImageBlob(content);
    if (content.startsWith('data:') || content.startsWith('blob:')) return deps.dataUrlToBlob(content);
    if (content.startsWith('http://') || content.startsWith('https://')) return deps.fetchRemoteBlob(content, remoteFilename);
    return null;
}
