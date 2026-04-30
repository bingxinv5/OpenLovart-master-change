import { useCallback, useEffect, useRef } from 'react';

export function useDragAutoScroll(
    scrollContainerRef: React.RefObject<HTMLDivElement | null>,
    draggingId: string | null,
) {
    const dragAutoScrollVelocityRef = useRef(0);
    const dragAutoScrollFrameRef = useRef<number | null>(null);

    const updateDragAutoScroll = useCallback((clientY: number) => {
        const container = scrollContainerRef.current;
        if (!container || !draggingId) {
            dragAutoScrollVelocityRef.current = 0;
            return;
        }

        const rect = container.getBoundingClientRect();
        const edgeThreshold = 56;
        const topDistance = clientY - rect.top;
        const bottomDistance = rect.bottom - clientY;

        if (topDistance < edgeThreshold) {
            dragAutoScrollVelocityRef.current = -Math.max(8, Math.round((edgeThreshold - topDistance) * 0.65));
        } else if (bottomDistance < edgeThreshold) {
            dragAutoScrollVelocityRef.current = Math.max(8, Math.round((edgeThreshold - bottomDistance) * 0.65));
        } else {
            dragAutoScrollVelocityRef.current = 0;
        }
    }, [draggingId, scrollContainerRef]);

    const resetDragAutoScroll = useCallback(() => {
        dragAutoScrollVelocityRef.current = 0;
    }, []);

    useEffect(() => {
        if (!draggingId) {
            dragAutoScrollVelocityRef.current = 0;
            if (dragAutoScrollFrameRef.current !== null) {
                cancelAnimationFrame(dragAutoScrollFrameRef.current);
                dragAutoScrollFrameRef.current = null;
            }
            return;
        }

        const tick = () => {
            const container = scrollContainerRef.current;
            if (container && dragAutoScrollVelocityRef.current !== 0) {
                container.scrollTop += dragAutoScrollVelocityRef.current;
            }
            dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
        };

        dragAutoScrollFrameRef.current = requestAnimationFrame(tick);
        return () => {
            if (dragAutoScrollFrameRef.current !== null) {
                cancelAnimationFrame(dragAutoScrollFrameRef.current);
                dragAutoScrollFrameRef.current = null;
            }
        };
    }, [draggingId, scrollContainerRef]);

    return { updateDragAutoScroll, resetDragAutoScroll };
}