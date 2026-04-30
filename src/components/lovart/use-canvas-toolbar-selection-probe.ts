import { useCallback, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

type ToolbarSelectionPressEvent = {
    button: number;
    target: EventTarget | null;
    stopPropagation: () => void;
    preventDefault?: () => void;
    clientX: number;
    clientY: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
};

type UseCanvasToolbarSelectionProbeOptions = {
    dragStartThreshold: number;
    beginSelectionBoxFromClient: (
        startClientX: number,
        startClientY: number,
        currentClientX: number,
        currentClientY: number,
        additiveSelection: boolean,
    ) => void;
};

export function useCanvasToolbarSelectionProbe({
    dragStartThreshold,
    beginSelectionBoxFromClient,
}: UseCanvasToolbarSelectionProbeOptions) {
    const toolbarSelectionProbeRef = useRef<(() => void) | null>(null);
    const toolbarSuppressClickRef = useRef(false);

    const stopToolbarSelectionProbe = useCallback(() => {
        toolbarSelectionProbeRef.current?.();
        toolbarSelectionProbeRef.current = null;
    }, []);

    const handleToolbarSelectionPressStart = useCallback((event: ToolbarSelectionPressEvent) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
        event.stopPropagation();
        toolbarSuppressClickRef.current = false;
        stopToolbarSelectionProbe();

        const startClientX = event.clientX;
        const startClientY = event.clientY;
        const additiveSelection = event.shiftKey || event.ctrlKey || event.metaKey;

        const handleMove = (moveEvent: MouseEvent | PointerEvent) => {
            if ((moveEvent.buttons & 1) !== 1) {
                stopToolbarSelectionProbe();
                return;
            }
            const movedX = Math.abs(moveEvent.clientX - startClientX);
            const movedY = Math.abs(moveEvent.clientY - startClientY);
            if (Math.max(movedX, movedY) < dragStartThreshold) return;
            toolbarSuppressClickRef.current = true;
            beginSelectionBoxFromClient(startClientX, startClientY, moveEvent.clientX, moveEvent.clientY, additiveSelection);
            stopToolbarSelectionProbe();
        };

        const handleUp = () => {
            stopToolbarSelectionProbe();
        };

        const handlePointerCancel = (cancelEvent: PointerEvent) => {
            if (cancelEvent.pointerType === 'mouse') return;
            stopToolbarSelectionProbe();
        };

        window.addEventListener('mousemove', handleMove, true);
        window.addEventListener('pointermove', handleMove, true);
        window.addEventListener('mouseup', handleUp, true);
        window.addEventListener('pointerup', handleUp, true);
        window.addEventListener('pointercancel', handlePointerCancel, true);

        toolbarSelectionProbeRef.current = () => {
            window.removeEventListener('mousemove', handleMove, true);
            window.removeEventListener('pointermove', handleMove, true);
            window.removeEventListener('mouseup', handleUp, true);
            window.removeEventListener('pointerup', handleUp, true);
            window.removeEventListener('pointercancel', handlePointerCancel, true);
        };
    }, [beginSelectionBoxFromClient, dragStartThreshold, stopToolbarSelectionProbe]);

    const handleToolbarSelectionMouseDownCapture = useCallback((event: ReactMouseEvent) => {
        handleToolbarSelectionPressStart(event);
    }, [handleToolbarSelectionPressStart]);

    const handleToolbarSelectionPointerDownCapture = useCallback((event: ReactPointerEvent) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        handleToolbarSelectionPressStart(event);
    }, [handleToolbarSelectionPressStart]);

    const handleToolbarSelectionClickCapture = useCallback((event: ReactMouseEvent) => {
        if (!toolbarSuppressClickRef.current) return;
        toolbarSuppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
    }, []);

    return {
        handleToolbarSelectionMouseDownCapture,
        handleToolbarSelectionPointerDownCapture,
        handleToolbarSelectionClickCapture,
    };
}