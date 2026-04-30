import { useEffect, type RefObject } from 'react';
import canvasTestEvents from '@/lib/testing/canvas-test-events.json';
import type { CanvasElement, FrameAutoLayoutAlign, FrameAutoLayoutMode } from './canvas-types';

interface UseCanvasTestEventBridgeArgs {
    rootRef: RefObject<HTMLElement | null>;
    elements: CanvasElement[];
    moveElementToFrame: (elementId: string, targetFrameId?: string) => void;
    onElementChange: (id: string, attrs: Partial<CanvasElement>) => void;
    scheduleAutoLayout: (frameId: string) => void;
    addFrameAtPosition: (centerX: number, centerY: number, width?: number, height?: number) => void;
}

export function useCanvasTestEventBridge({
    rootRef,
    elements,
    moveElementToFrame,
    onElementChange,
    scheduleAutoLayout,
    addFrameAtPosition,
}: UseCanvasTestEventBridgeArgs) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const handleTestMoveElementToFrame = (event: Event) => {
            const customEvent = event as CustomEvent<{ elementId?: string; targetFrameId?: string | null }>;
            const elementId = customEvent.detail?.elementId?.trim();
            const targetFrameId = customEvent.detail?.targetFrameId ?? undefined;
            if (!elementId) {
                return;
            }

            moveElementToFrame(elementId, targetFrameId || undefined);
        };

        const handleTestSetFrameAutoLayout = (event: Event) => {
            const customEvent = event as CustomEvent<{
                frameId?: string;
                enabled?: boolean;
                mode?: FrameAutoLayoutMode;
                gap?: number;
                align?: FrameAutoLayoutAlign;
            }>;
            const frameId = customEvent.detail?.frameId?.trim();
            if (!frameId) return;

            const frame = elements.find((element) => element.id === frameId && element.type === 'frame');
            if (!frame) return;

            onElementChange(frameId, {
                frameAutoLayout: customEvent.detail?.enabled ?? true,
                frameAutoLayoutMode: customEvent.detail?.mode || frame.frameAutoLayoutMode || 'flow',
                frameAutoLayoutGap: customEvent.detail?.gap ?? frame.frameAutoLayoutGap ?? 14,
                frameAutoLayoutAlign: customEvent.detail?.align || frame.frameAutoLayoutAlign || 'center',
            });
            scheduleAutoLayout(frameId);
        };

        const handleTestAddFrame = (event: Event) => {
            const customEvent = event as CustomEvent<{
                centerX?: number;
                centerY?: number;
                width?: number;
                height?: number;
            }>;
            addFrameAtPosition(
                customEvent.detail?.centerX ?? 320,
                customEvent.detail?.centerY ?? 240,
                customEvent.detail?.width ?? 400,
                customEvent.detail?.height ?? 300,
            );
        };

        root.addEventListener(canvasTestEvents.moveElementToFrameEvent, handleTestMoveElementToFrame as EventListener);
        root.addEventListener(canvasTestEvents.setFrameAutoLayoutEvent, handleTestSetFrameAutoLayout as EventListener);
        root.addEventListener(canvasTestEvents.addFrameEvent, handleTestAddFrame as EventListener);
        return () => {
            root.removeEventListener(canvasTestEvents.moveElementToFrameEvent, handleTestMoveElementToFrame as EventListener);
            root.removeEventListener(canvasTestEvents.setFrameAutoLayoutEvent, handleTestSetFrameAutoLayout as EventListener);
            root.removeEventListener(canvasTestEvents.addFrameEvent, handleTestAddFrame as EventListener);
        };
    }, [addFrameAtPosition, elements, moveElementToFrame, onElementChange, rootRef, scheduleAutoLayout]);
}