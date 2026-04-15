import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { clearHighlightTimeout, getCenteredPanForElement, isElementWithinViewport, scheduleResultHighlight } from './canvas-focus';

export type CanvasToastType = 'info' | 'success' | 'error';

export interface CanvasToast {
    message: string;
    type: CanvasToastType;
}

interface UseCanvasFeedbackOptions {
    elements: CanvasElement[];
    scale: number;
    pan: { x: number; y: number };
    setPan: (pan: { x: number; y: number }) => void;
    setSelectedIds: (ids: string[]) => void;
}

export function useCanvasFeedback({
    elements,
    scale,
    pan,
    setPan,
    setSelectedIds,
}: UseCanvasFeedbackOptions) {
    const [highlightedLayerIds, setHighlightedLayerIds] = useState<string[]>([]);
    const [highlightedResultId, setHighlightedResultId] = useState<string | null>(null);
    const [toast, setToast] = useState<CanvasToast | null>(null);
    const highlightResultTimeoutRef = useRef<number | null>(null);
    const highlightedLayerTimeoutRef = useRef<number | null>(null);

    const flashLayerHighlights = useCallback((ids: string[]) => {
        const nextIds = ids.filter(Boolean);
        setHighlightedLayerIds(nextIds);
        if (highlightedLayerTimeoutRef.current !== null) {
            window.clearTimeout(highlightedLayerTimeoutRef.current);
        }
        highlightedLayerTimeoutRef.current = window.setTimeout(() => {
            setHighlightedLayerIds([]);
            highlightedLayerTimeoutRef.current = null;
        }, 1400);
    }, []);

    const highlightGeneratedResult = useCallback((
        elementId: string,
        options?: {
            ensureVisible?: boolean;
            select?: boolean;
        },
    ) => {
        if (options?.select !== false) {
            setSelectedIds([elementId]);
        }

        if (options?.ensureVisible) {
            const target = elements.find((element) => element.id === elementId);
            if (target && !isElementWithinViewport(target, scale, pan, { padding: 96 })) {
                setPan(getCenteredPanForElement(target, scale));
            }
        }

        scheduleResultHighlight({
            elementId,
            timeoutRef: highlightResultTimeoutRef,
            setHighlightedResultId,
            duration: 1800,
        });
    }, [elements, pan, scale, setPan, setSelectedIds]);

    const focusCanvasElement = useCallback((elementId: string) => {
        const target = elements.find((element) => element.id === elementId);
        if (!target) {
            return;
        }

        setSelectedIds([elementId]);
        setPan(getCenteredPanForElement(target, scale));
        scheduleResultHighlight({
            elementId,
            timeoutRef: highlightResultTimeoutRef,
            setHighlightedResultId,
            duration: 1800,
        });
    }, [elements, scale, setPan, setSelectedIds]);

    const showToast = useCallback((message: string, type: CanvasToastType = 'info') => {
        setToast({ message, type });
    }, []);

    const clearToast = useCallback(() => {
        setToast(null);
    }, []);

    const announceCompletedResult = useCallback((elementId: string, message: string) => {
        highlightGeneratedResult(elementId, { ensureVisible: true });
        showToast(message, 'success');
    }, [highlightGeneratedResult, showToast]);

    const announcePassiveCompletedResult = useCallback((elementId: string, message: string) => {
        highlightGeneratedResult(elementId, { select: false });
        showToast(message, 'success');
    }, [highlightGeneratedResult, showToast]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), toast.type === 'error' ? 5000 : 3000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    useEffect(() => () => {
        clearHighlightTimeout(highlightResultTimeoutRef);
        if (highlightedLayerTimeoutRef.current !== null) {
            window.clearTimeout(highlightedLayerTimeoutRef.current);
        }
    }, []);

    return {
        announceCompletedResult,
        announcePassiveCompletedResult,
        clearToast,
        flashLayerHighlights,
        focusCanvasElement,
        highlightGeneratedResult,
        highlightedLayerIds,
        highlightedResultId,
        showToast,
        toast,
    };
}
