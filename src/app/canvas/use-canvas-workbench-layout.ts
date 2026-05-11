import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CanvasRenderMetrics } from '@/components/lovart/canvas-area-domains';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import {
    CANVAS_DEFAULT_SCALE,
    CANVAS_FIT_ALL_MAX_SCALE,
    CANVAS_ZOOM_IN_FACTOR,
    CANVAS_ZOOM_OUT_FACTOR,
    clampCanvasScale,
    zoomCanvasScaleByFactor,
} from '@/components/lovart/canvas-viewport-utils';
import { areCanvasRenderMetricsEqual } from './canvas-compare-utils';

export interface UseCanvasWorkbenchLayoutParams {
    benchmarkMode: boolean;
    elements: CanvasElement[];
    setScale: Dispatch<SetStateAction<number>>;
    setPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
    showChat: boolean;
    chatPanelMode: 'side' | 'bottom';
    chatExpanded: boolean;
    showLayers: boolean;
    showHistory: boolean;
    showMedia: boolean;
    sideDockOffset: number;
}

export function useCanvasWorkbenchLayout({
    benchmarkMode,
    elements,
    setScale,
    setPan,
    showChat,
    chatPanelMode,
    chatExpanded,
    showLayers,
    showHistory,
    showMedia,
    sideDockOffset,
}: UseCanvasWorkbenchLayoutParams) {
    const [renderMetrics, setRenderMetrics] = useState<CanvasRenderMetrics | null>(null);

    const handleRenderMetricsChange = useCallback((nextMetrics: CanvasRenderMetrics) => {
        if (!benchmarkMode) {
            return;
        }

        setRenderMetrics((previous) => areCanvasRenderMetricsEqual(previous, nextMetrics) ? previous : nextMetrics);
    }, [benchmarkMode]);

    const sideChatWidth = showChat && chatPanelMode === 'side'
        ? (chatExpanded ? 720 : 420)
        : 0;
    const rightDockPanelWidth = (showLayers ? 328 : 0) + (showHistory ? 328 : 0) + (showMedia ? 348 : 0);
    const rightWorkbenchOffset = showLayers || showHistory || showMedia
        ? sideDockOffset + rightDockPanelWidth
        : sideChatWidth;
    const benchmarkPanelRightOffset = rightWorkbenchOffset + 16;

    const handleZoomIn = useCallback(() => setScale((prev) => zoomCanvasScaleByFactor(prev, CANVAS_ZOOM_IN_FACTOR)), [setScale]);
    const handleZoomOut = useCallback(() => setScale((prev) => zoomCanvasScaleByFactor(prev, CANVAS_ZOOM_OUT_FACTOR)), [setScale]);
    const handleZoomTo = useCallback((value: number) => setScale(clampCanvasScale(value)), [setScale]);
    const handleFitToScreen = useCallback(() => {
        if (elements.length === 0) {
            setScale(CANVAS_DEFAULT_SCALE);
            setPan({ x: 0, y: 0 });
            return;
        }
        const xs = elements.map((element) => element.x);
        const ys = elements.map((element) => element.y);
        const xe = elements.map((element) => element.x + (element.width || 300));
        const ye = elements.map((element) => element.y + (element.height || 300));
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xe);
        const maxY = Math.max(...ye);
        const canvasWidth = maxX - minX;
        const canvasHeight = maxY - minY;
        const viewportWidth = Math.max(1, window.innerWidth - 120);
        const viewportHeight = Math.max(1, window.innerHeight - 120);
        const nextScale = clampCanvasScale(Math.min(
            viewportWidth / Math.max(canvasWidth, 1),
            viewportHeight / Math.max(canvasHeight, 1),
            CANVAS_FIT_ALL_MAX_SCALE,
        ));
        setScale(nextScale);
        setPan({
            x: (viewportWidth - canvasWidth * nextScale) / 2 - minX * nextScale + 60,
            y: (viewportHeight - canvasHeight * nextScale) / 2 - minY * nextScale + 60,
        });
    }, [elements, setPan, setScale]);

    return useMemo(() => ({
        renderMetrics: benchmarkMode ? renderMetrics : null,
        handleRenderMetricsChange,
        sideChatWidth,
        rightWorkbenchOffset,
        benchmarkPanelRightOffset,
        handleZoomIn,
        handleZoomOut,
        handleZoomTo,
        handleFitToScreen,
    }), [benchmarkMode, benchmarkPanelRightOffset, handleFitToScreen, handleRenderMetricsChange, handleZoomIn, handleZoomOut, handleZoomTo, renderMetrics, rightWorkbenchOffset, sideChatWidth]);
}
