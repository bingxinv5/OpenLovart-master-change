"use client";

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { WorkbenchImage } from './WorkbenchImage';
import type { CanvasElement } from './canvas-types';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';

export type ImagePreviewMetrics = {
    width: number;
    height: number;
    left: number;
    top: number;
};

export type MediaPreviewItem = {
    element: CanvasElement;
    resolvedImageSrc?: string;
};

export type MediaLightboxSize = {
    width: number;
    height: number;
    displayPixels: number;
};

export type MediaLightboxSourceSize = {
    width: number;
    height: number;
};

function toOverlayPx(value: number | undefined) {
    return `${Number.isFinite(value) ? value : 0}px`;
}

function getMediaPreviewBaseSize(element: CanvasElement) {
    const fallbackWidth = element.type === 'video' ? 1280 : 1024;
    const fallbackHeight = element.type === 'video' ? 720 : 1024;
    return {
        width: Math.max(1, element.width || fallbackWidth),
        height: Math.max(1, element.height || fallbackHeight),
    };
}

export function isMediaPreviewElement(element: CanvasElement) {
    return !element.hidden && !!element.content && (element.type === 'image' || element.type === 'video');
}

export function sortMediaPreviewElements(elements: CanvasElement[]) {
    return [...elements].sort((a, b) => {
        const aSize = getMediaPreviewBaseSize(a);
        const bSize = getMediaPreviewBaseSize(b);
        const aBottom = a.y + aSize.height;
        const bBottom = b.y + bSize.height;
        const verticalOverlap = Math.min(aBottom, bBottom) - Math.max(a.y, b.y);
        const sameVisualRow = verticalOverlap > Math.min(aSize.height, bSize.height) * 0.45;

        if (sameVisualRow && a.x !== b.x) {
            return a.x - b.x;
        }

        if (a.y !== b.y) {
            return a.y - b.y;
        }

        return a.x - b.x;
    });
}

export function resolveMediaPreviewElements(elements: CanvasElement[]) {
    return sortMediaPreviewElements(elements.filter(isMediaPreviewElement));
}

export function resolveMediaLightboxSize(
    element: CanvasElement,
    viewportSize: { width: number; height: number },
    sourceSize?: MediaLightboxSourceSize,
): MediaLightboxSize {
    const fallbackSize = getMediaPreviewBaseSize(element);
    const baseSize = sourceSize && sourceSize.width > 0 && sourceSize.height > 0 ? sourceSize : fallbackSize;
    const aspectRatio = baseSize.width / baseSize.height;
    const maxWidth = Math.max(240, viewportSize.width - 48);
    const maxHeight = Math.max(240, viewportSize.height - 48);
    let width = maxWidth;
    let height = width / aspectRatio;

    if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
    }

    return {
        width: Math.round(width),
        height: Math.round(height),
        displayPixels: Math.max(baseSize.width, baseSize.height, width, height, 4096) * 2,
    };
}

export function resolveActiveImagePreviewElement(
    elements: CanvasElement[],
    activeImagePreviewId: string | null,
    scale: number,
    disabled = false,
) {
    if (disabled || scale > 0.12 || !activeImagePreviewId) {
        return null;
    }

    return elements.find((element) => element.id === activeImagePreviewId && !element.hidden && element.type === 'image' && !!element.content) || null;
}

export function resolveImagePreviewMetrics({
    element,
    scale,
    pan,
    viewportSize,
}: {
    element: CanvasElement | null;
    scale: number;
    pan: { x: number; y: number };
    viewportSize: { width: number; height: number };
}): ImagePreviewMetrics | null {
    if (!element) {
        return null;
    }

    const baseWidth = Math.max(1, element.width || 240);
    const baseHeight = Math.max(1, element.height || 240);
    const aspectRatio = baseWidth / baseHeight;
    const maxSide = 240;
    const minSide = 144;

    let width = baseWidth;
    let height = baseHeight;

    if (width >= height) {
        width = maxSide;
        height = Math.max(minSide, Math.round(width / aspectRatio));
    } else {
        height = maxSide;
        width = Math.max(minSide, Math.round(height * aspectRatio));
    }

    const screenX = element.x * scale + pan.x;
    const screenY = element.y * scale + pan.y;
    const screenWidth = baseWidth * scale;
    const anchorCenterX = screenX + screenWidth / 2;
    const offsetY = 18;
    const left = Math.min(Math.max(12, Math.round(anchorCenterX - width / 2)), Math.max(12, viewportSize.width - width - 12));
    const preferredTop = Math.round(screenY - height - offsetY);
    const top = preferredTop >= 12
        ? preferredTop
        : Math.min(Math.max(12, Math.round(screenY + Math.max(baseHeight * scale, 20) + offsetY)), Math.max(12, viewportSize.height - height - 12));

    return { width, height, left, top };
}

export function useImageHoverPreview({
    elements,
    activeImagePreviewId,
    scale,
    pan,
    viewportSize,
    disabled = false,
}: {
    elements: CanvasElement[];
    activeImagePreviewId: string | null;
    scale: number;
    pan: { x: number; y: number };
    viewportSize: { width: number; height: number };
    disabled?: boolean;
}) {
    const element = useMemo(() => (
        resolveActiveImagePreviewElement(elements, activeImagePreviewId, scale, disabled)
    ), [activeImagePreviewId, disabled, elements, scale]);

    const metrics = useMemo(() => resolveImagePreviewMetrics({
        element,
        scale,
        pan,
        viewportSize,
    }), [element, pan, scale, viewportSize]);

    return { element, metrics };
}

export function VideoPlaybackOverlay({
    elements,
    activeVideoId,
    scale,
    pan,
    onClose,
}: {
    elements: CanvasElement[];
    activeVideoId: string | null;
    scale: number;
    pan: { x: number; y: number };
    onClose: () => void;
}) {
    return (
        <>
            {elements.filter((element) => !element.hidden && element.type === 'video' && element.content && activeVideoId === element.id).map((element) => {
                const screenX = element.x * scale + pan.x;
                const screenY = element.y * scale + pan.y;
                const screenWidth = (element.width || 400) * scale;
                const screenHeight = (element.height || 300) * scale;
                const overlayClassName = buildFloatingPanelPositionClassName('canvas-video-overlay-position', element.id);
                const overlayCss = `
.${overlayClassName} {
    left: ${toOverlayPx(screenX)};
    top: ${toOverlayPx(screenY)};
    width: ${toOverlayPx(screenWidth)};
    height: ${toOverlayPx(screenHeight)};
}
`;
                return (
                    <div
                        key={`video-overlay-${element.id}`}
                        className={`${overlayClassName} absolute z-[100] rounded-lg overflow-hidden shadow-2xl`}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <style>{overlayCss}</style>
                        <video
                            key={element.content}
                            src={element.content}
                            className="block h-full w-full bg-[#111] object-contain"
                            controls
                            autoPlay
                            loop
                            playsInline
                            preload="auto"
                        />
                        <button
                            className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                            onClick={onClose}
                            title="关闭播放"
                        >
                            ✕
                        </button>
                    </div>
                );
            })}
        </>
    );
}

export function ImagePreviewPanel({
    element,
    metrics,
    resolvedImageSrc,
}: {
    element: CanvasElement | null;
    metrics: ImagePreviewMetrics | null;
    resolvedImageSrc?: string;
}) {
    if (!element?.content || !metrics) {
        return null;
    }
    const previewClassName = buildFloatingPanelPositionClassName('active-image-preview-position', element.id);
    const previewCss = `
.${previewClassName} {
    left: ${toOverlayPx(metrics.left)};
    top: ${toOverlayPx(metrics.top)};
    width: ${toOverlayPx(metrics.width)};
    height: ${toOverlayPx(metrics.height)};
}
`;

    return (
        <div
            className={`${previewClassName} canvas-theme-panel pointer-events-none absolute z-[105] overflow-hidden rounded-2xl p-2`}
        >
            <style>{previewCss}</style>
            <WorkbenchImage
                content={element.content}
                debugId={`preview-${element.id}`}
                resolvedSrc={resolvedImageSrc}
                displayPixels={Math.max(metrics.width, metrics.height) * 2}
                canvasScale={1}
                prioritizeDetail
                alt="Image preview overlay"
                containerClassName="h-full w-full overflow-hidden rounded-xl"
                imageClassName="rounded-xl"
                fit={element.imageFit || 'contain'}
                surfaceMode={element.imageSurface || 'checker'}
                loading="eager"
                decoding="async"
            />
        </div>
    );
}

export function MediaLightboxPreviewOverlay({
    items,
    activeIndex,
    onActiveIndexChange,
    onClose,
}: {
    items: MediaPreviewItem[];
    activeIndex: number;
    onActiveIndexChange: (index: number) => void;
    onClose: () => void;
}) {
    const [viewportSize, setViewportSize] = useState(() => ({
        width: typeof window === 'undefined' ? 1280 : window.innerWidth,
        height: typeof window === 'undefined' ? 900 : window.innerHeight,
    }));
    const [naturalImageSizes, setNaturalImageSizes] = useState<Record<string, MediaLightboxSourceSize>>({});
    const safeActiveIndex = items.length > 0 ? Math.min(Math.max(activeIndex, 0), items.length - 1) : 0;
    const activeItem = items[safeActiveIndex] ?? null;
    const activeElement = activeItem?.element ?? null;
    const canNavigate = items.length > 1;
    const activeNaturalImageSize = activeElement?.type === 'image' ? naturalImageSizes[activeElement.id] : undefined;

    useEffect(() => {
        if (!activeElement) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            } else if (event.key === 'ArrowLeft' && canNavigate) {
                onActiveIndexChange((safeActiveIndex - 1 + items.length) % items.length);
            } else if (event.key === 'ArrowRight' && canNavigate) {
                onActiveIndexChange((safeActiveIndex + 1) % items.length);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeElement, canNavigate, items.length, onActiveIndexChange, onClose, safeActiveIndex]);

    useEffect(() => {
        if (!activeElement) {
            return;
        }

        const updateViewportSize = () => {
            setViewportSize({ width: window.innerWidth, height: window.innerHeight });
        };

        updateViewportSize();
        window.addEventListener('resize', updateViewportSize);
        return () => window.removeEventListener('resize', updateViewportSize);
    }, [activeElement]);

    if (!activeElement?.content) {
        return null;
    }

    const previewSize = resolveMediaLightboxSize(activeElement, viewportSize, activeNaturalImageSize);
    const lightboxSizeClassName = buildFloatingPanelPositionClassName('media-lightbox-preview-size', activeElement.id);
    const lightboxSizeCss = `
.${lightboxSizeClassName} {
    width: ${toOverlayPx(previewSize.width)};
    height: ${toOverlayPx(previewSize.height)};
}
`;

    const showPrevious = () => {
        if (canNavigate) {
            onActiveIndexChange((safeActiveIndex - 1 + items.length) % items.length);
        }
    };

    const showNext = () => {
        if (canNavigate) {
            onActiveIndexChange((safeActiveIndex + 1) % items.length);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm"
            onMouseDown={onClose}
        >
            <div
                className="relative flex max-h-full max-w-full items-center justify-center"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="fixed right-5 top-5 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/70 text-white shadow-lg transition-colors hover:bg-slate-950"
                    title="关闭预览"
                    aria-label="关闭预览"
                >
                    <X size={16} />
                </button>

                {canNavigate && (
                    <button
                        type="button"
                        onClick={showPrevious}
                        className="fixed left-5 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white shadow-lg transition-colors hover:bg-slate-950"
                        title="上一项"
                        aria-label="上一项"
                    >
                        <ChevronLeft size={22} />
                    </button>
                )}

                <div className={`${lightboxSizeClassName} overflow-hidden rounded-xl bg-slate-950 shadow-2xl`}>
                    <style>{lightboxSizeCss}</style>
                    {activeElement.type === 'image' ? (
                        <WorkbenchImage
                            key={activeElement.id}
                            content={activeElement.content}
                            debugId={`lightbox-preview-${activeElement.id}`}
                            resolvedSrc={activeItem.resolvedImageSrc}
                            displayPixels={previewSize.displayPixels}
                            canvasScale={1}
                            prioritizeDetail
                            forceOriginal
                            alt="Image preview"
                            containerClassName="h-full w-full rounded-xl"
                            imageClassName="rounded-xl"
                            fit="contain"
                            surfaceMode="dark"
                            loading="eager"
                            decoding="async"
                            onLoad={(event) => {
                                const nextWidth = event.currentTarget.naturalWidth;
                                const nextHeight = event.currentTarget.naturalHeight;
                                if (nextWidth <= 0 || nextHeight <= 0) {
                                    return;
                                }

                                setNaturalImageSizes((current) => {
                                    const previous = current[activeElement.id];
                                    if (previous?.width === nextWidth && previous.height === nextHeight) {
                                        return current;
                                    }

                                    return {
                                        ...current,
                                        [activeElement.id]: { width: nextWidth, height: nextHeight },
                                    };
                                });
                            }}
                        />
                    ) : (
                        <video
                            key={activeElement.content}
                            src={activeElement.content}
                            className="block h-full w-full bg-slate-950 object-contain"
                            controls
                            autoPlay
                            loop
                            playsInline
                            preload="auto"
                        />
                    )}
                </div>

                {canNavigate && (
                    <button
                        type="button"
                        onClick={showNext}
                        className="fixed right-5 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white shadow-lg transition-colors hover:bg-slate-950"
                        title="下一项"
                        aria-label="下一项"
                    >
                        <ChevronRight size={22} />
                    </button>
                )}

                {canNavigate && (
                    <div className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white shadow-lg">
                        {safeActiveIndex + 1} / {items.length}
                    </div>
                )}
            </div>
        </div>
    );
}
