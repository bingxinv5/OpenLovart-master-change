import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
    calculatePanInertiaVelocity,
    stepPanInertia,
    trimPanVelocityPoints,
    type CanvasPointWithTime,
} from './canvas-pan-inertia';
import { isSameCanvasPan, shouldRebaseCanvasPan, type CanvasPanPoint } from './canvas-pan-session';
import {
    getCanvasZoomTargetViewport,
    isCanvasZoomViewportSettled,
    mergeCanvasWheelDeltas,
    normalizeCanvasWheelDelta,
    shouldCommitCanvasZoom,
    stepCanvasZoomViewport,
    type CanvasZoomAnchor,
    type CanvasZoomViewport,
} from './canvas-zoom-session';
import { LOW_ZOOM_OVERVIEW_ENTER_SCALE, LOW_ZOOM_OVERVIEW_EXIT_SCALE } from './CanvasLowZoomOverviewLayer';

interface UseCanvasPanControllerParams {
    pan: CanvasPanPoint;
    scale: number;
    onPanChange: (pan: CanvasPanPoint) => void;
    onScaleChange: (scale: number) => void;
    contentLayerRef: RefObject<HTMLDivElement | null>;
    outerRef: RefObject<HTMLDivElement | null>;
    visualViewportRef?: RefObject<CanvasZoomViewport>;
    interactionActiveRef: RefObject<boolean>;
    preferZoomOverview?: boolean;
    zoomOverviewElementCount?: number;
    onInertiaActiveChange?: (active: boolean) => void;
    onZoomOverviewActiveChange?: (active: boolean) => void;
    onZoomCommitCountChange?: (count: number) => void;
}

export function useCanvasPanController({
    pan,
    scale,
    onPanChange,
    onScaleChange,
    contentLayerRef,
    outerRef,
    visualViewportRef,
    interactionActiveRef,
    preferZoomOverview = false,
    zoomOverviewElementCount = 0,
    onInertiaActiveChange,
    onZoomOverviewActiveChange,
    onZoomCommitCountChange,
}: UseCanvasPanControllerParams) {
    const panRef = useRef(pan);
    const scaleRef = useRef(scale);
    const visualPanRef = useRef(pan);
    const visualScaleRef = useRef(scale);
    const committedPanRef = useRef(pan);
    const committedScaleRef = useRef(scale);
    const receivedPanRef = useRef(pan);
    const receivedScaleRef = useRef(scale);
    const renderAnchorPanRef = useRef(pan);
    const onPanChangeRef = useRef(onPanChange);
    const onScaleChangeRef = useRef(onScaleChange);
    const onInertiaActiveChangeRef = useRef(onInertiaActiveChange);
    const onZoomOverviewActiveChangeRef = useRef(onZoomOverviewActiveChange);
    const onZoomCommitCountChangeRef = useRef(onZoomCommitCountChange);
    const pendingPanRef = useRef<CanvasPanPoint | null>(null);
    const panVelocityPointsRef = useRef<CanvasPointWithTime[]>([]);
    const inertiaRafRef = useRef<number | null>(null);
    const panRafRef = useRef<number | null>(null);
    const zoomRafRef = useRef<number | null>(null);
    const runZoomFrameRef = useRef<FrameRequestCallback>(() => undefined);
    const zoomActiveRef = useRef(false);
    const zoomOverviewActiveRef = useRef(false);
    const pendingWheelDeltaRef = useRef(0);
    const pendingWheelScreenRef = useRef<CanvasPanPoint | null>(null);
    const zoomTargetViewportRef = useRef<CanvasZoomViewport | null>(null);
    const zoomAnchorRef = useRef<CanvasZoomAnchor | null>(null);
    const zoomLastInputAtRef = useRef(0);
    const zoomLastFrameAtRef = useRef(0);
    const zoomCommitCountRef = useRef(0);
    const zoomOverviewRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const preferZoomOverviewRef = useRef(preferZoomOverview);
    const zoomOverviewElementCountRef = useRef(zoomOverviewElementCount);

    const applyVisualPan = useCallback((nextPan: CanvasPanPoint) => {
        visualPanRef.current = nextPan;
        panRef.current = nextPan;
        if (visualViewportRef) {
            visualViewportRef.current = { scale: visualScaleRef.current, pan: nextPan };
        }

        const contentLayer = contentLayerRef.current;
        if (contentLayer && !(zoomActiveRef.current && preferZoomOverviewRef.current)) {
            contentLayer.style.transform = `translate3d(${nextPan.x}px, ${nextPan.y}px, 0) scale(${visualScaleRef.current})`;
        }
        const outer = outerRef.current;
        if (outer) {
            outer.dataset.visualPanX = String(Math.round(nextPan.x * 100) / 100);
            outer.dataset.visualPanY = String(Math.round(nextPan.y * 100) / 100);
        }
    }, [contentLayerRef, outerRef, visualViewportRef]);

    const applyVisualViewport = useCallback((nextViewport: CanvasZoomViewport) => {
        visualScaleRef.current = nextViewport.scale;
        scaleRef.current = nextViewport.scale;
        if (visualViewportRef) visualViewportRef.current = nextViewport;
        const outer = outerRef.current;
        if (outer) {
            outer.dataset.visualScale = String(Math.round(nextViewport.scale * 10000) / 10000);
        }
        applyVisualPan(nextViewport.pan);
    }, [applyVisualPan, outerRef, visualViewportRef]);

    const setZoomActive = useCallback((active: boolean) => {
        if (zoomActiveRef.current === active) return;
        zoomActiveRef.current = active;
        const outer = outerRef.current;
        if (outer) {
            outer.dataset.isZooming = active ? 'true' : 'false';
        }
        const contentLayer = contentLayerRef.current;
        if (contentLayer) {
            contentLayer.dataset.isZooming = active && !preferZoomOverviewRef.current ? 'true' : 'false';
        }
    }, [contentLayerRef, outerRef]);

    const setZoomOverviewActive = useCallback((active: boolean, deferred = false, notifyReact = true) => {
        if (zoomOverviewActiveRef.current === active) return;
        zoomOverviewActiveRef.current = active;
        const outer = outerRef.current;
        if (outer) {
            outer.dataset.zoomRenderMode = active ? 'overview' : 'detailed';
            outer.dataset.overviewElements = active ? String(zoomOverviewElementCountRef.current) : '0';
        }
        const contentLayer = contentLayerRef.current;
        if (contentLayer) {
            if (!active) {
                contentLayer.style.transform = `translate3d(${visualPanRef.current.x}px, ${visualPanRef.current.y}px, 0) scale(${visualScaleRef.current})`;
            }
            contentLayer.dataset.zoomOverviewActive = active && !preferZoomOverviewRef.current ? 'true' : 'false';
        }
        if (!notifyReact) return;
        const notify = () => onZoomOverviewActiveChangeRef.current?.(active);
        if (deferred) startTransition(notify);
        else notify();
    }, [contentLayerRef, outerRef]);

    const updateZoomOverviewForScale = useCallback((nextScale: number) => {
        if (preferZoomOverviewRef.current) {
            setZoomOverviewActive(true, false, false);
            return;
        }
        const active = zoomOverviewActiveRef.current
            ? nextScale < LOW_ZOOM_OVERVIEW_EXIT_SCALE
            : nextScale <= LOW_ZOOM_OVERVIEW_ENTER_SCALE;
        setZoomOverviewActive(active, true);
    }, [setZoomOverviewActive]);

    const commitFormalViewport = useCallback((nextViewport: CanvasZoomViewport, deferred = false) => {
        applyVisualViewport(nextViewport);
        const scaleChanged = committedScaleRef.current !== nextViewport.scale;
        const panChanged = !isSameCanvasPan(committedPanRef.current, nextViewport.pan);
        committedScaleRef.current = nextViewport.scale;
        committedPanRef.current = nextViewport.pan;
        renderAnchorPanRef.current = nextViewport.pan;
        const notify = () => {
            if (scaleChanged) onScaleChangeRef.current(nextViewport.scale);
            if (panChanged) onPanChangeRef.current(nextViewport.pan);
        };
        if (deferred) startTransition(notify);
        else notify();
        return scaleChanged || panChanged;
    }, [applyVisualViewport]);

    const consumePendingWheelInput = useCallback(() => {
        const normalizedDelta = pendingWheelDeltaRef.current;
        const screen = pendingWheelScreenRef.current;
        pendingWheelDeltaRef.current = 0;
        pendingWheelScreenRef.current = null;
        if (!normalizedDelta || !screen) return;

        const currentVisualViewport = {
            scale: visualScaleRef.current,
            pan: visualPanRef.current,
        };
        const result = getCanvasZoomTargetViewport(
            currentVisualViewport,
            zoomTargetViewportRef.current?.scale ?? currentVisualViewport.scale,
            normalizedDelta,
            screen,
        );
        zoomTargetViewportRef.current = result.viewport;
        zoomAnchorRef.current = result.anchor;
    }, []);

    const finishZoomSession = useCallback((commit = true) => {
        if (zoomRafRef.current !== null) {
            cancelAnimationFrame(zoomRafRef.current);
            zoomRafRef.current = null;
        }
        if (!zoomActiveRef.current) {
            if (commit && zoomOverviewRestoreTimerRef.current) {
                clearTimeout(zoomOverviewRestoreTimerRef.current);
                zoomOverviewRestoreTimerRef.current = null;
                setZoomOverviewActive(false, false, !preferZoomOverviewRef.current);
            }
            return;
        }

        consumePendingWheelInput();
        const finalViewport = zoomTargetViewportRef.current ?? {
            scale: visualScaleRef.current,
            pan: visualPanRef.current,
        };
        const changed = commit ? commitFormalViewport(finalViewport) : false;
        if (changed) {
            zoomCommitCountRef.current += 1;
            const outer = outerRef.current;
            if (outer) outer.dataset.zoomCommitCount = String(zoomCommitCountRef.current);
            startTransition(() => onZoomCommitCountChangeRef.current?.(zoomCommitCountRef.current));
        }
        pendingWheelDeltaRef.current = 0;
        pendingWheelScreenRef.current = null;
        zoomTargetViewportRef.current = null;
        zoomAnchorRef.current = null;
        zoomLastFrameAtRef.current = 0;
        setZoomActive(false);
        if (zoomOverviewActiveRef.current) {
            if (zoomOverviewRestoreTimerRef.current) clearTimeout(zoomOverviewRestoreTimerRef.current);
            zoomOverviewRestoreTimerRef.current = setTimeout(() => {
                zoomOverviewRestoreTimerRef.current = null;
                setZoomOverviewActive(false, true, !preferZoomOverviewRef.current);
            }, 48);
        }
    }, [commitFormalViewport, consumePendingWheelInput, outerRef, setZoomActive, setZoomOverviewActive]);

    useLayoutEffect(() => {
        const outer = outerRef.current;
        if (outer) {
            outer.dataset.isZooming = 'false';
            outer.dataset.zoomRenderMode = 'detailed';
            outer.dataset.zoomCommitCount = String(zoomCommitCountRef.current);
        }
        const contentLayer = contentLayerRef.current;
        if (contentLayer) {
            contentLayer.dataset.isZooming = 'false';
            contentLayer.dataset.zoomOverviewActive = 'false';
        }
        applyVisualViewport({ scale: committedScaleRef.current, pan: committedPanRef.current });
    }, [applyVisualViewport, contentLayerRef, outerRef]);

    useLayoutEffect(() => {
        const receivedScaleChanged = receivedScaleRef.current !== scale;
        const receivedPanChanged = !isSameCanvasPan(receivedPanRef.current, pan);
        if (!receivedScaleChanged && !receivedPanChanged) return;
        receivedScaleRef.current = scale;
        receivedPanRef.current = pan;
        const isExternalViewport = committedScaleRef.current !== scale
            || !isSameCanvasPan(committedPanRef.current, pan);
        if (zoomActiveRef.current && isExternalViewport) finishZoomSession(false);
        committedScaleRef.current = scale;
        committedPanRef.current = pan;
        if (!interactionActiveRef.current && inertiaRafRef.current === null && panRafRef.current === null) {
            renderAnchorPanRef.current = pan;
            applyVisualViewport({ scale, pan });
        }
    }, [applyVisualViewport, finishZoomSession, interactionActiveRef, pan, scale]);

    useEffect(() => {
        onPanChangeRef.current = onPanChange;
    }, [onPanChange]);

    useEffect(() => {
        onScaleChangeRef.current = onScaleChange;
    }, [onScaleChange]);

    useEffect(() => {
        onInertiaActiveChangeRef.current = onInertiaActiveChange;
    }, [onInertiaActiveChange]);

    useEffect(() => {
        onZoomOverviewActiveChangeRef.current = onZoomOverviewActiveChange;
        onZoomCommitCountChangeRef.current = onZoomCommitCountChange;
    }, [onZoomCommitCountChange, onZoomOverviewActiveChange]);

    useEffect(() => {
        preferZoomOverviewRef.current = preferZoomOverview;
        zoomOverviewElementCountRef.current = zoomOverviewElementCount;
    }, [preferZoomOverview, zoomOverviewElementCount]);

    useEffect(() => () => {
        if (inertiaRafRef.current !== null) cancelAnimationFrame(inertiaRafRef.current);
        if (panRafRef.current !== null) cancelAnimationFrame(panRafRef.current);
        if (zoomRafRef.current !== null) cancelAnimationFrame(zoomRafRef.current);
        if (zoomOverviewRestoreTimerRef.current) clearTimeout(zoomOverviewRestoreTimerRef.current);
    }, []);

    const commitPanChange = useCallback((nextPan: CanvasPanPoint) => {
        if (zoomActiveRef.current) finishZoomSession(false);
        applyVisualPan(nextPan);
        const previousPan = committedPanRef.current;
        if (isSameCanvasPan(previousPan, nextPan)) return;
        committedPanRef.current = nextPan;
        renderAnchorPanRef.current = nextPan;
        onPanChangeRef.current(nextPan);
    }, [applyVisualPan, finishZoomSession]);

    const commitScaleChange = useCallback((nextScale: number) => {
        if (zoomActiveRef.current) finishZoomSession(false);
        commitFormalViewport({
            scale: nextScale,
            pan: visualPanRef.current,
        });
    }, [commitFormalViewport, finishZoomSession]);

    const commitViewportChange = useCallback((nextViewport: CanvasZoomViewport) => {
        if (zoomActiveRef.current) finishZoomSession(false);
        commitFormalViewport(nextViewport);
    }, [commitFormalViewport, finishZoomSession]);

    const commitPanAnchor = useCallback((nextPan: CanvasPanPoint) => {
        if (!shouldRebaseCanvasPan(renderAnchorPanRef.current, nextPan)) return;
        renderAnchorPanRef.current = nextPan;
    }, []);

    const flushPendingPanChange = useCallback(() => {
        if (panRafRef.current !== null) {
            cancelAnimationFrame(panRafRef.current);
            panRafRef.current = null;
        }
        const nextPan = pendingPanRef.current ?? visualPanRef.current;
        pendingPanRef.current = null;
        commitPanChange(nextPan);
    }, [commitPanChange]);

    const schedulePanChange = useCallback((nextPan: CanvasPanPoint) => {
        pendingPanRef.current = nextPan;
        if (panRafRef.current !== null) return;
        panRafRef.current = requestAnimationFrame(() => {
            panRafRef.current = null;
            const queuedPan = pendingPanRef.current;
            pendingPanRef.current = null;
            if (!queuedPan) return;
            applyVisualPan(queuedPan);
            commitPanAnchor(queuedPan);
        });
    }, [applyVisualPan, commitPanAnchor]);

    const cancelInertia = useCallback(() => {
        const hadInertia = inertiaRafRef.current !== null;
        if (inertiaRafRef.current !== null) {
            cancelAnimationFrame(inertiaRafRef.current);
            inertiaRafRef.current = null;
        }
        if (panRafRef.current !== null) {
            cancelAnimationFrame(panRafRef.current);
            panRafRef.current = null;
        }
        const pendingPan = pendingPanRef.current;
        pendingPanRef.current = null;
        if (pendingPan) {
            applyVisualPan(pendingPan);
        }
        if (hadInertia) {
            commitPanChange(visualPanRef.current);
            onInertiaActiveChangeRef.current?.(false);
        }
        panVelocityPointsRef.current = [];
    }, [applyVisualPan, commitPanChange]);

    const recordPanVelocityPoint = useCallback((point: CanvasPointWithTime) => {
        const points = panVelocityPointsRef.current;
        points.push(point);
        panVelocityPointsRef.current = trimPanVelocityPoints(points, 6);
    }, []);

    const startInertiaFromVelocityPoints = useCallback(() => {
        if (panVelocityPointsRef.current.length < 2) {
            return;
        }

        const velocity = calculatePanInertiaVelocity(panVelocityPointsRef.current);
        if (velocity) {
            onInertiaActiveChangeRef.current?.(true);
            let currentPan = { x: visualPanRef.current.x, y: visualPanRef.current.y };
            let currentVelocity = velocity;
            const step = () => {
                const next = stepPanInertia(currentPan, currentVelocity);
                currentVelocity = next.velocity;
                if (!next.shouldContinue) {
                    inertiaRafRef.current = null;
                    commitPanChange(currentPan);
                    onInertiaActiveChangeRef.current?.(false);
                    return;
                }
                currentPan = next.pan;
                applyVisualPan(currentPan);
                commitPanAnchor(currentPan);
                inertiaRafRef.current = requestAnimationFrame(step);
            };
            inertiaRafRef.current = requestAnimationFrame(step);
        }
        panVelocityPointsRef.current = [];
    }, [applyVisualPan, commitPanAnchor, commitPanChange]);

    const runZoomFrame = useCallback((now: number) => {
        zoomRafRef.current = null;
        if (!zoomActiveRef.current) return;
        consumePendingWheelInput();

        const target = zoomTargetViewportRef.current;
        const anchor = zoomAnchorRef.current;
        if (!target || !anchor) {
            finishZoomSession();
            return;
        }

        const current = {
            scale: visualScaleRef.current,
            pan: visualPanRef.current,
        };
        const elapsedMs = zoomLastFrameAtRef.current > 0 ? now - zoomLastFrameAtRef.current : 16.67;
        zoomLastFrameAtRef.current = now;
        let next = stepCanvasZoomViewport(current, target, anchor, elapsedMs);
        if (isCanvasZoomViewportSettled(next, target)) next = target;
        applyVisualViewport(next);
        updateZoomOverviewForScale(next.scale);

        if (shouldCommitCanvasZoom(
            zoomLastInputAtRef.current,
            now,
            isCanvasZoomViewportSettled(next, target),
        )) {
            finishZoomSession();
            return;
        }
        zoomRafRef.current = requestAnimationFrame((nextNow) => runZoomFrameRef.current(nextNow));
    }, [applyVisualViewport, consumePendingWheelInput, finishZoomSession, updateZoomOverviewForScale]);

    useLayoutEffect(() => {
        runZoomFrameRef.current = runZoomFrame;
    }, [runZoomFrame]);

    const queueWheelZoom = useCallback(({
        deltaY,
        deltaMode,
        pageSize,
        screen,
    }: {
        deltaY: number;
        deltaMode: number;
        pageSize: number;
        screen: CanvasPanPoint;
    }) => {
        const normalizedDelta = normalizeCanvasWheelDelta(deltaY, deltaMode, pageSize);
        if (!normalizedDelta) return;
        if (!zoomActiveRef.current) {
            if (zoomOverviewRestoreTimerRef.current) {
                clearTimeout(zoomOverviewRestoreTimerRef.current);
                zoomOverviewRestoreTimerRef.current = null;
            }
            zoomTargetViewportRef.current = {
                scale: visualScaleRef.current,
                pan: visualPanRef.current,
            };
            setZoomActive(true);
            if (preferZoomOverviewRef.current) setZoomOverviewActive(true, false, false);
        }
        pendingWheelDeltaRef.current = mergeCanvasWheelDeltas(
            pendingWheelDeltaRef.current,
            normalizedDelta,
        );
        pendingWheelScreenRef.current = screen;
        zoomLastInputAtRef.current = performance.now();
        if (zoomRafRef.current === null) {
            zoomLastFrameAtRef.current = 0;
            zoomRafRef.current = requestAnimationFrame(runZoomFrame);
        }
    }, [runZoomFrame, setZoomActive, setZoomOverviewActive]);

    const getVisualPan = useCallback(() => visualPanRef.current, []);
    const getVisualScale = useCallback(() => visualScaleRef.current, []);

    return {
        cancelInertia,
        commitPanChange,
        commitScaleChange,
        commitViewportChange,
        finishZoomSession,
        flushPendingPanChange,
        getVisualPan,
        getVisualScale,
        queueWheelZoom,
        recordPanVelocityPoint,
        schedulePanChange,
        startInertiaFromVelocityPoints,
    };
}
