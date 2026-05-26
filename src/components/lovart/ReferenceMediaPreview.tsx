"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { WorkbenchImage } from './WorkbenchImage';
import { MediaLightboxPreviewOverlay, type MediaPreviewItem } from './CanvasMediaOverlays';
import type { CanvasElement } from './canvas-types';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';

export type ReferenceMediaPreviewKind = 'image' | 'video';

export interface ReferenceMediaPreviewSource {
    id: string;
    title: string;
    content: string | File;
    kind?: ReferenceMediaPreviewKind;
}

export interface ReferenceThumbnailHoverPreviewState {
    source: ReferenceMediaPreviewSource;
    rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;
}

const REFERENCE_THUMBNAIL_PREVIEW_OPEN_DELAY_MS = 80;
const REFERENCE_THUMBNAIL_PREVIEW_CLOSE_DELAY_MS = 100;

function toPreviewPx(value: number | undefined) {
    return `${Number.isFinite(value) ? value : 0}px`;
}

function isPreviewFile(value: string | File): value is File {
    return typeof File !== 'undefined' && value instanceof File;
}

function useObjectUrl(content: string | File | null | undefined) {
    const [objectUrl, setObjectUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!content || !isPreviewFile(content)) {
            setObjectUrl(null);
            return;
        }

        const nextUrl = URL.createObjectURL(content);
        setObjectUrl(nextUrl);
        return () => URL.revokeObjectURL(nextUrl);
    }, [content]);

    if (!content) return null;
    return typeof content === 'string' ? content : objectUrl;
}

function resolveHoverPreviewMetrics(rect: ReferenceThumbnailHoverPreviewState['rect']) {
    const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
    const edge = 12;
    const gap = 14;
    const size = Math.min(320, Math.max(224, Math.round(Math.min(viewportWidth, viewportHeight) * 0.28)));
    let left = Math.round(rect.right + gap);

    if (left + size > viewportWidth - edge) {
        left = Math.round(rect.left - size - gap);
    }

    left = Math.min(Math.max(edge, left), Math.max(edge, viewportWidth - size - edge));

    const anchorCenterY = rect.top + rect.height / 2;
    const top = Math.min(
        Math.max(edge, Math.round(anchorCenterY - size / 2)),
        Math.max(edge, viewportHeight - size - edge),
    );

    return { left, top, width: size, height: size };
}

export function useReferenceThumbnailHoverPreview() {
    const [preview, setPreview] = React.useState<ReferenceThumbnailHoverPreviewState | null>(null);
    const openTimerRef = React.useRef<number | null>(null);
    const closeTimerRef = React.useRef<number | null>(null);

    const clearOpenTimer = React.useCallback(() => {
        if (openTimerRef.current !== null) {
            window.clearTimeout(openTimerRef.current);
            openTimerRef.current = null;
        }
    }, []);

    const clearCloseTimer = React.useCallback(() => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, []);

    const closePreview = React.useCallback(() => {
        clearOpenTimer();
        clearCloseTimer();
        setPreview(null);
    }, [clearCloseTimer, clearOpenTimer]);

    const schedulePreviewOpen = React.useCallback((source: ReferenceMediaPreviewSource | null, target: HTMLElement | null) => {
        if (!source || !target || source.kind === 'video') {
            return;
        }

        const rect = target.getBoundingClientRect();
        clearOpenTimer();
        clearCloseTimer();
        openTimerRef.current = window.setTimeout(() => {
            setPreview({ source, rect });
            openTimerRef.current = null;
        }, REFERENCE_THUMBNAIL_PREVIEW_OPEN_DELAY_MS);
    }, [clearCloseTimer, clearOpenTimer]);

    const schedulePreviewClose = React.useCallback(() => {
        clearOpenTimer();
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(() => {
            setPreview(null);
            closeTimerRef.current = null;
        }, REFERENCE_THUMBNAIL_PREVIEW_CLOSE_DELAY_MS);
    }, [clearCloseTimer, clearOpenTimer]);

    React.useEffect(() => {
        return () => {
            clearOpenTimer();
            clearCloseTimer();
        };
    }, [clearCloseTimer, clearOpenTimer]);

    return { preview, schedulePreviewOpen, schedulePreviewClose, closePreview };
}

export function ReferenceThumbnailHoverPreview({ preview }: { preview: ReferenceThumbnailHoverPreviewState | null }) {
    const content = useObjectUrl(preview?.source.content);

    if (!preview || !content || typeof document === 'undefined') {
        return null;
    }

    const metrics = resolveHoverPreviewMetrics(preview.rect);
    const className = buildFloatingPanelPositionClassName(
        'reference-thumbnail-hover-preview',
        `${preview.source.id}-${Math.round(preview.rect.left)}-${Math.round(preview.rect.top)}`,
    );
    const css = `
.${className} {
    left: ${toPreviewPx(metrics.left)};
    top: ${toPreviewPx(metrics.top)};
    width: ${toPreviewPx(metrics.width)};
    height: ${toPreviewPx(metrics.height)};
}
`;

    return createPortal(
        <>
            <style>{css}</style>
            <div className={`${className} canvas-theme-panel pointer-events-none fixed z-[235] overflow-hidden rounded-2xl p-2`}>
                <WorkbenchImage
                    content={content}
                    debugId={`reference-hover-preview-${preview.source.id}`}
                    displayPixels={metrics.width * 3}
                    canvasScale={1}
                    prioritizeDetail
                    alt={preview.source.title}
                    containerClassName="h-full w-full overflow-hidden rounded-xl"
                    imageClassName="rounded-xl"
                    fit="cover"
                    surfaceMode="light"
                    loading="eager"
                    decoding="async"
                />
            </div>
        </>,
        document.body,
    );
}

export function ReferenceMediaLightbox({
    items,
    activeIndex,
    onActiveIndexChange,
    onClose,
}: {
    items: ReferenceMediaPreviewSource[];
    activeIndex: number;
    onActiveIndexChange: (index: number) => void;
    onClose: () => void;
}) {
    const [fileUrls, setFileUrls] = React.useState<Record<string, string>>({});

    React.useEffect(() => {
        const nextUrls: Record<string, string> = {};
        for (const item of items) {
            if (isPreviewFile(item.content)) {
                nextUrls[item.id] = URL.createObjectURL(item.content);
            }
        }

        setFileUrls(nextUrls);
        return () => {
            Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
        };
    }, [items]);

    const mediaItems = React.useMemo<MediaPreviewItem[]>(() => items.flatMap((item): MediaPreviewItem[] => {
        const content = typeof item.content === 'string' ? item.content : fileUrls[item.id];
        if (!content) {
            return [];
        }

        const element: CanvasElement = {
            id: `reference-lightbox-${item.id}`,
            type: item.kind === 'video' ? 'video' : 'image',
            x: 0,
            y: 0,
            width: item.kind === 'video' ? 1280 : 1024,
            height: item.kind === 'video' ? 720 : 1024,
            content,
        };

        return [{ element }];
    }), [fileUrls, items]);

    if (mediaItems.length === 0) {
        return null;
    }

    if (typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <MediaLightboxPreviewOverlay
            items={mediaItems}
            activeIndex={activeIndex}
            onActiveIndexChange={onActiveIndexChange}
            onClose={onClose}
        />,
        document.body,
    );
}