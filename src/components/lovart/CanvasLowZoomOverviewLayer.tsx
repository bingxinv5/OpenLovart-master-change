import React from 'react';
import type { CanvasElement } from './canvas-types';

export const LOW_ZOOM_OVERVIEW_ENTER_SCALE = 0.32;
export const LOW_ZOOM_OVERVIEW_EXIT_SCALE = 0.36;
const OVERVIEW_MARGIN_SCREEN_PX = 1280;
const OVERVIEW_DEVICE_PIXEL_RATIO = 1;
const OVERVIEW_MAX_RASTER_SCALE = LOW_ZOOM_OVERVIEW_ENTER_SCALE;
const OVERVIEW_MAX_BITMAP_DIMENSION = 8192;

export function resolveLowZoomOverviewActive({
    motionActive,
    scale,
    wasActive,
}: {
    motionActive: boolean;
    scale: number;
    wasActive: boolean;
}) {
    if (!motionActive) return false;
    return wasActive
        ? scale < LOW_ZOOM_OVERVIEW_EXIT_SCALE
        : scale <= LOW_ZOOM_OVERVIEW_ENTER_SCALE;
}

function getElementSize(element: CanvasElement) {
    return {
        width: Math.max(1, element.width || (element.type === 'text' ? 200 : 100)),
        height: Math.max(1, element.height || (element.type === 'text' ? 40 : 100)),
    };
}

function getElementColor(element: CanvasElement, dark: boolean) {
    switch (element.type) {
        case 'image': return dark ? '#6366f1' : '#818cf8';
        case 'video': return dark ? '#8b5cf6' : '#a78bfa';
        case 'text': return '#fbbf24';
        case 'shape': return '#34d399';
        case 'path': return '#f472b6';
        case 'mark': return '#f87171';
        case 'image-generator':
        case 'video-generator':
        case 'storyboard-planner':
            return dark ? '#a855f7' : '#c084fc';
        default:
            return dark ? '#64748b' : '#94a3b8';
    }
}

interface CanvasLowZoomOverviewLayerProps {
    active: boolean;
    elements: CanvasElement[];
    selectedIds: string[];
    renderPan: { x: number; y: number };
    scale: number;
    viewportSize: { width: number; height: number };
    canvasTheme?: 'light' | 'dark';
}

export const CanvasLowZoomOverviewLayer = React.memo(function CanvasLowZoomOverviewLayer({
    active,
    elements,
    selectedIds,
    renderPan,
    scale,
    viewportSize,
    canvasTheme = 'light',
}: CanvasLowZoomOverviewLayerProps) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const overviewRasterScale = Math.min(safeScale, OVERVIEW_MAX_RASTER_SCALE);
    const visibleElements = React.useMemo(
        () => elements.filter((element) => !element.hidden),
        [elements],
    );
    const projectBounds = React.useMemo(() => {
        const drawableElements = visibleElements.filter((element) => element.type !== 'connector');
        if (drawableElements.length === 0) return null;
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const element of drawableElements) {
            const size = getElementSize(element);
            minX = Math.min(minX, element.x);
            minY = Math.min(minY, element.y);
            maxX = Math.max(maxX, element.x + size.width);
            maxY = Math.max(maxY, element.y + size.height);
        }
        return { minX, minY, maxX, maxY };
    }, [visibleElements]);
    const worldBounds = React.useMemo(() => {
        const margin = OVERVIEW_MARGIN_SCREEN_PX / overviewRasterScale;
        const viewportLeft = -renderPan.x / safeScale;
        const viewportTop = -renderPan.y / safeScale;
        const viewportRight = viewportLeft + viewportSize.width / safeScale;
        const viewportBottom = viewportTop + viewportSize.height / safeScale;
        const left = Math.min(viewportLeft, projectBounds?.minX ?? viewportLeft) - margin;
        const top = Math.min(viewportTop, projectBounds?.minY ?? viewportTop) - margin;
        const right = Math.max(viewportRight, projectBounds?.maxX ?? viewportRight) + margin;
        const bottom = Math.max(viewportBottom, projectBounds?.maxY ?? viewportBottom) + margin;
        return {
            left,
            top,
            width: Math.max(1, right - left),
            height: Math.max(1, bottom - top),
        };
    }, [overviewRasterScale, projectBounds, renderPan.x, renderPan.y, safeScale, viewportSize.height, viewportSize.width]);

    React.useLayoutEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context || viewportSize.width <= 0 || viewportSize.height <= 0) return;

        const bitmapScale = Math.min(
            overviewRasterScale * OVERVIEW_DEVICE_PIXEL_RATIO,
            OVERVIEW_MAX_BITMAP_DIMENSION / worldBounds.width,
            OVERVIEW_MAX_BITMAP_DIMENSION / worldBounds.height,
        );
        const bitmapWidth = Math.max(1, Math.ceil(worldBounds.width * bitmapScale));
        const bitmapHeight = Math.max(1, Math.ceil(worldBounds.height * bitmapScale));
        if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
        if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, bitmapWidth, bitmapHeight);
        context.setTransform(
            bitmapScale,
            0,
            0,
            bitmapScale,
            -worldBounds.left * bitmapScale,
            -worldBounds.top * bitmapScale,
        );

        const dark = canvasTheme === 'dark';
        const selectedSet = new Set(selectedIds);
        const elementById = new Map(visibleElements.map((element) => [element.id, element]));
        const connectors = visibleElements.filter((element) => element.type === 'connector');
        const frames = visibleElements.filter((element) => element.type === 'frame');
        const nodes = visibleElements.filter((element) => element.type !== 'connector' && element.type !== 'frame');

        context.lineCap = 'round';
        context.lineJoin = 'round';
        for (const connector of connectors) {
            const from = connector.connectorFrom ? elementById.get(connector.connectorFrom) : null;
            const to = connector.connectorTo ? elementById.get(connector.connectorTo) : null;
            if (!from || !to) continue;
            const fromSize = getElementSize(from);
            const toSize = getElementSize(to);
            context.beginPath();
            context.moveTo(from.x + fromSize.width / 2, from.y + fromSize.height / 2);
            context.lineTo(to.x + toSize.width / 2, to.y + toSize.height / 2);
            context.strokeStyle = selectedSet.has(connector.id) ? '#60a5fa' : (dark ? '#64748b' : '#94a3b8');
            context.globalAlpha = selectedSet.has(connector.id) ? 0.95 : 0.62;
            context.lineWidth = (selectedSet.has(connector.id) ? 2.2 : 1.25) / overviewRasterScale;
            context.stroke();
        }

        for (const frame of frames) {
            const size = getElementSize(frame);
            context.globalAlpha = 1;
            context.fillStyle = dark ? 'rgba(148,163,184,0.07)' : 'rgba(139,92,246,0.06)';
            context.strokeStyle = selectedSet.has(frame.id) ? '#60a5fa' : (dark ? '#64748b' : '#a78bfa');
            context.lineWidth = (selectedSet.has(frame.id) ? 2.2 : 1.1) / overviewRasterScale;
            context.fillRect(frame.x, frame.y, size.width, size.height);
            context.strokeRect(frame.x, frame.y, size.width, size.height);
        }

        for (const element of nodes) {
            const size = getElementSize(element);
            context.globalAlpha = 0.92;
            context.fillStyle = getElementColor(element, dark);
            if (element.type === 'shape' && element.shapeType === 'circle') {
                context.beginPath();
                context.ellipse(element.x + size.width / 2, element.y + size.height / 2, size.width / 2, size.height / 2, 0, 0, Math.PI * 2);
                context.fill();
            } else {
                context.fillRect(element.x, element.y, size.width, size.height);
            }
            if (element.type === 'image') {
                context.globalAlpha = 0.28;
                context.fillStyle = dark ? '#e2e8f0' : '#ffffff';
                context.fillRect(element.x + size.width * 0.08, element.y + size.height * 0.08, size.width * 0.84, size.height * 0.84);
            }
            if (selectedSet.has(element.id)) {
                context.globalAlpha = 1;
                context.strokeStyle = '#60a5fa';
                context.lineWidth = 2.4 / overviewRasterScale;
                context.strokeRect(element.x, element.y, size.width, size.height);
            }
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
    }, [active, canvasTheme, overviewRasterScale, selectedIds, viewportSize.height, viewportSize.width, visibleElements, worldBounds]);

    return (
        <canvas
            ref={canvasRef}
            className="canvas-low-zoom-overview pointer-events-none absolute z-20"
            data-testid="canvas-low-zoom-overview"
            data-active={active ? 'true' : 'false'}
            data-overview-elements={visibleElements.length}
            aria-hidden="true"
            style={{
                left: `${worldBounds.left}px`,
                top: `${worldBounds.top}px`,
                width: `${worldBounds.width}px`,
                height: `${worldBounds.height}px`,
            }}
        />
    );
});
