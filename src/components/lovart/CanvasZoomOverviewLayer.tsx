import React from 'react';
import type { CanvasElement } from './canvas-types';
import type { CanvasZoomViewport } from './canvas-zoom-session';

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

interface CanvasZoomOverviewLayerProps {
    elements: CanvasElement[];
    selectedIds: string[];
    viewportSize: { width: number; height: number };
    visualViewportRef: React.RefObject<CanvasZoomViewport>;
    outerRef: React.RefObject<HTMLDivElement | null>;
    canvasTheme?: 'light' | 'dark';
}

export const CanvasZoomOverviewLayer = React.memo(function CanvasZoomOverviewLayer({
    elements,
    selectedIds,
    viewportSize,
    visualViewportRef,
    outerRef,
    canvasTheme = 'light',
}: CanvasZoomOverviewLayerProps) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const visibleElements = React.useMemo(
        () => elements.filter((element) => !element.hidden),
        [elements],
    );
    const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
    const elementById = React.useMemo(
        () => new Map(visibleElements.map((element) => [element.id, element])),
        [visibleElements],
    );
    const connectors = React.useMemo(
        () => visibleElements.filter((element) => element.type === 'connector'),
        [visibleElements],
    );
    const drawableElements = React.useMemo(
        () => visibleElements.filter((element) => element.type !== 'connector'),
        [visibleElements],
    );

    const draw = React.useCallback((viewport: CanvasZoomViewport) => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        const width = Math.max(1, Math.round(viewportSize.width));
        const height = Math.max(1, Math.round(viewportSize.height));
        if (!canvas || !context || width <= 1 || height <= 1) return;
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, width, height);
        context.setTransform(viewport.scale, 0, 0, viewport.scale, viewport.pan.x, viewport.pan.y);

        const dark = canvasTheme === 'dark';
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
            context.lineWidth = (selectedSet.has(connector.id) ? 2.2 : 1.25) / viewport.scale;
            context.stroke();
        }

        const worldLeft = -viewport.pan.x / viewport.scale;
        const worldTop = -viewport.pan.y / viewport.scale;
        const worldRight = worldLeft + width / viewport.scale;
        const worldBottom = worldTop + height / viewport.scale;
        const margin = 80 / viewport.scale;
        for (const element of drawableElements) {
            const size = getElementSize(element);
            if (
                element.x + size.width < worldLeft - margin
                || element.x > worldRight + margin
                || element.y + size.height < worldTop - margin
                || element.y > worldBottom + margin
            ) continue;

            if (element.type === 'frame') {
                context.globalAlpha = 1;
                context.fillStyle = dark ? 'rgba(148,163,184,0.07)' : 'rgba(139,92,246,0.06)';
                context.strokeStyle = selectedSet.has(element.id) ? '#60a5fa' : (dark ? '#64748b' : '#a78bfa');
                context.lineWidth = (selectedSet.has(element.id) ? 2.2 : 1.1) / viewport.scale;
                context.fillRect(element.x, element.y, size.width, size.height);
                context.strokeRect(element.x, element.y, size.width, size.height);
                continue;
            }

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
                context.lineWidth = 2.4 / viewport.scale;
                context.strokeRect(element.x, element.y, size.width, size.height);
            }
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
    }, [canvasTheme, connectors, drawableElements, elementById, selectedSet, viewportSize.height, viewportSize.width]);

    React.useLayoutEffect(() => {
        if (visualViewportRef.current) draw(visualViewportRef.current);
    }, [draw, visualViewportRef]);

    React.useEffect(() => {
        let frameId = 0;
        let lastScale = Number.NaN;
        let lastPanX = Number.NaN;
        let lastPanY = Number.NaN;
        const frame = () => {
            const viewport = visualViewportRef.current;
            const active = outerRef.current?.dataset.zoomRenderMode === 'overview';
            if (
                active
                && viewport
                && (viewport.scale !== lastScale || viewport.pan.x !== lastPanX || viewport.pan.y !== lastPanY)
            ) {
                draw(viewport);
                lastScale = viewport.scale;
                lastPanX = viewport.pan.x;
                lastPanY = viewport.pan.y;
            }
            frameId = requestAnimationFrame(frame);
        };
        frameId = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(frameId);
    }, [draw, outerRef, visualViewportRef]);

    return (
        <canvas
            ref={canvasRef}
            className="canvas-zoom-overview-overlay pointer-events-none absolute inset-0 z-20 h-full w-full"
            data-testid="canvas-zoom-overview"
            data-overview-elements={visibleElements.length}
            aria-hidden="true"
        />
    );
});
