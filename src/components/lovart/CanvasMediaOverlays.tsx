"use client";

import { useMemo } from 'react';
import { WorkbenchImage } from './WorkbenchImage';
import type { CanvasElement } from './canvas-types';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';

export type ImagePreviewMetrics = {
    width: number;
    height: number;
    left: number;
    top: number;
};

function toOverlayPx(value: number | undefined) {
    return `${Number.isFinite(value) ? value : 0}px`;
}

export function resolveActiveImagePreviewElement(
    elements: CanvasElement[],
    activeImagePreviewId: string | null,
    scale: number,
) {
    if (scale > 0.12 || !activeImagePreviewId) {
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
}: {
    elements: CanvasElement[];
    activeImagePreviewId: string | null;
    scale: number;
    pan: { x: number; y: number };
    viewportSize: { width: number; height: number };
}) {
    const element = useMemo(() => (
        resolveActiveImagePreviewElement(elements, activeImagePreviewId, scale)
    ), [activeImagePreviewId, elements, scale]);

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
}: {
    element: CanvasElement | null;
    metrics: ImagePreviewMetrics | null;
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
            className={`${previewClassName} pointer-events-none absolute z-[105] overflow-hidden rounded-2xl border border-white/70 bg-white/94 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.24)] backdrop-blur`}
        >
            <style>{previewCss}</style>
            <WorkbenchImage
                content={element.content}
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