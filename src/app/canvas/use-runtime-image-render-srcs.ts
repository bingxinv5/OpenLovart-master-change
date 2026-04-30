import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';

export const GENERATED_IMAGE_RENDER_SRC_TTL_MS = 60_000;

export function useRuntimeImageRenderSrcs(elements: Pick<CanvasElement, 'id'>[]) {
    const runtimeImageRenderSrcsRef = useRef<Map<string, string>>(new Map());
    const runtimeImageRenderSrcTimersRef = useRef<Map<string, number>>(new Map());
    const [runtimeImageRenderSrcs, setRuntimeImageRenderSrcs] = useState<Record<string, string>>({});

    const releaseRuntimeImageRenderSrc = useCallback((elementId: string) => {
        const existingTimer = runtimeImageRenderSrcTimersRef.current.get(elementId);
        if (existingTimer !== undefined) {
            window.clearTimeout(existingTimer);
            runtimeImageRenderSrcTimersRef.current.delete(elementId);
        }

        const currentUrl = runtimeImageRenderSrcsRef.current.get(elementId);
        if (currentUrl) {
            runtimeImageRenderSrcsRef.current.delete(elementId);
            try {
                URL.revokeObjectURL(currentUrl);
            } catch {
                // Ignore stale object URL cleanup failures.
            }
        }

        setRuntimeImageRenderSrcs((previous) => {
            if (!(elementId in previous)) {
                return previous;
            }

            const next = { ...previous };
            delete next[elementId];
            return next;
        });
    }, []);

    const primeRuntimeImageRenderSrc = useCallback((elementId: string, blob: Blob | null) => {
        if (typeof window === 'undefined' || !blob) {
            return;
        }

        const nextUrl = URL.createObjectURL(blob);
        const previousTimer = runtimeImageRenderSrcTimersRef.current.get(elementId);
        if (previousTimer !== undefined) {
            window.clearTimeout(previousTimer);
        }

        const previousUrl = runtimeImageRenderSrcsRef.current.get(elementId);
        runtimeImageRenderSrcsRef.current.set(elementId, nextUrl);
        setRuntimeImageRenderSrcs((previous) => ({
            ...previous,
            [elementId]: nextUrl,
        }));

        if (previousUrl && previousUrl !== nextUrl) {
            try {
                URL.revokeObjectURL(previousUrl);
            } catch {
                // Ignore stale object URL cleanup failures.
            }
        }

        const cleanupTimer = window.setTimeout(() => {
            releaseRuntimeImageRenderSrc(elementId);
        }, GENERATED_IMAGE_RENDER_SRC_TTL_MS);
        runtimeImageRenderSrcTimersRef.current.set(elementId, cleanupTimer);
    }, [releaseRuntimeImageRenderSrc]);

    useEffect(() => {
        const activeIds = new Set(elements.map((element) => element.id));
        runtimeImageRenderSrcsRef.current.forEach((_, elementId) => {
            if (!activeIds.has(elementId)) {
                releaseRuntimeImageRenderSrc(elementId);
            }
        });
    }, [elements, releaseRuntimeImageRenderSrc]);

    useEffect(() => () => {
        runtimeImageRenderSrcTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        runtimeImageRenderSrcTimersRef.current.clear();
        runtimeImageRenderSrcsRef.current.forEach((url) => {
            try {
                URL.revokeObjectURL(url);
            } catch {
                // Ignore stale object URL cleanup failures.
            }
        });
        runtimeImageRenderSrcsRef.current.clear();
    }, []);

    return {
        runtimeImageRenderSrcs,
        primeRuntimeImageRenderSrc,
        releaseRuntimeImageRenderSrc,
    };
}