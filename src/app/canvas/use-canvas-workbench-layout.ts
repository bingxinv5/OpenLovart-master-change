import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CanvasRenderMetrics } from '@/components/lovart/canvas-area-domains';
import type { CanvasElement } from '@/components/lovart/canvas-types';
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

    useEffect(() => {
        if (!benchmarkMode) {
            setRenderMetrics(null);
        }
    }, [benchmarkMode]);

    const sideChatWidth = showChat && chatPanelMode === 'side'
        ? (chatExpanded ? 720 : 420)
        : 0;
    const rightDockPanelWidth = (showLayers ? 328 : 0) + (showHistory ? 328 : 0) + (showMedia ? 348 : 0);
    const rightWorkbenchOffset = showLayers || showHistory || showMedia
        ? sideDockOffset + rightDockPanelWidth
        : sideChatWidth;
    const benchmarkPanelRightOffset = rightWorkbenchOffset + 16;

    const handleZoomIn = useCallback(() => setScale((prev) => Math.min(prev * 1.15, 8)), [setScale]);
    const handleZoomOut = useCallback(() => setScale((prev) => Math.max(prev * 0.85, 0.05)), [setScale]);
    const handleZoomTo = useCallback((value: number) => setScale(Math.min(8, Math.max(0.05, value))), [setScale]);
    const handleFitToScreen = useCallback(() => {
        if (elements.length === 0) {
            setScale(1);
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
        const viewportWidth = window.innerWidth - 120;
        const viewportHeight = window.innerHeight - 120;
        const nextScale = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight, 2);
        setScale(nextScale);
        setPan({
            x: (viewportWidth - canvasWidth * nextScale) / 2 - minX * nextScale + 60,
            y: (viewportHeight - canvasHeight * nextScale) / 2 - minY * nextScale + 60,
        });
    }, [elements, setPan, setScale]);

    return useMemo(() => ({
        renderMetrics,
        handleRenderMetricsChange,
        sideChatWidth,
        rightWorkbenchOffset,
        benchmarkPanelRightOffset,
        handleZoomIn,
        handleZoomOut,
        handleZoomTo,
        handleFitToScreen,
    }), [benchmarkPanelRightOffset, handleFitToScreen, handleRenderMetricsChange, handleZoomIn, handleZoomOut, handleZoomTo, renderMetrics, rightWorkbenchOffset, sideChatWidth]);
}