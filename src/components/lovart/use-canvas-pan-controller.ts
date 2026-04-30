import { useCallback, useEffect, useRef } from 'react';
import {
    calculatePanInertiaVelocity,
    stepPanInertia,
    trimPanVelocityPoints,
    type CanvasPointWithTime,
} from './canvas-pan-inertia';

interface UseCanvasPanControllerParams {
    pan: { x: number; y: number };
    onPanChange: (pan: { x: number; y: number }) => void;
}

export function useCanvasPanController({ pan, onPanChange }: UseCanvasPanControllerParams) {
    const panRef = useRef(pan);
    const committedPanRef = useRef(pan);
    const onPanChangeRef = useRef(onPanChange);
    const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
    const panVelocityPointsRef = useRef<CanvasPointWithTime[]>([]);
    const inertiaRafRef = useRef<number | null>(null);
    const panRafRef = useRef<number | null>(null);

    useEffect(() => {
        panRef.current = pan;
        committedPanRef.current = pan;
    }, [pan]);

    useEffect(() => {
        onPanChangeRef.current = onPanChange;
    }, [onPanChange]);

    useEffect(() => () => {
        if (inertiaRafRef.current !== null) cancelAnimationFrame(inertiaRafRef.current);
        if (panRafRef.current !== null) cancelAnimationFrame(panRafRef.current);
    }, []);

    const commitPanChange = useCallback((nextPan: { x: number; y: number }) => {
        const previousPan = committedPanRef.current;
        if (previousPan.x === nextPan.x && previousPan.y === nextPan.y) return;
        committedPanRef.current = nextPan;
        panRef.current = nextPan;
        onPanChangeRef.current(nextPan);
    }, []);

    const flushPendingPanChange = useCallback(() => {
        if (panRafRef.current !== null) {
            cancelAnimationFrame(panRafRef.current);
            panRafRef.current = null;
        }
        const nextPan = pendingPanRef.current;
        pendingPanRef.current = null;
        if (!nextPan) return;
        commitPanChange(nextPan);
    }, [commitPanChange]);

    const schedulePanChange = useCallback((nextPan: { x: number; y: number }) => {
        pendingPanRef.current = nextPan;
        if (panRafRef.current !== null) return;
        panRafRef.current = requestAnimationFrame(() => {
            panRafRef.current = null;
            const queuedPan = pendingPanRef.current;
            pendingPanRef.current = null;
            if (!queuedPan) return;
            commitPanChange(queuedPan);
        });
    }, [commitPanChange]);

    const cancelInertia = useCallback(() => {
        if (inertiaRafRef.current !== null) {
            cancelAnimationFrame(inertiaRafRef.current);
            inertiaRafRef.current = null;
        }
        if (panRafRef.current !== null) {
            cancelAnimationFrame(panRafRef.current);
            panRafRef.current = null;
        }
        pendingPanRef.current = null;
        panVelocityPointsRef.current = [];
    }, []);

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
            let currentPan = { x: panRef.current.x, y: panRef.current.y };
            let currentVelocity = velocity;
            const step = () => {
                const next = stepPanInertia(currentPan, currentVelocity);
                currentVelocity = next.velocity;
                if (!next.shouldContinue) {
                    inertiaRafRef.current = null;
                    return;
                }
                currentPan = next.pan;
                commitPanChange(currentPan);
                inertiaRafRef.current = requestAnimationFrame(step);
            };
            inertiaRafRef.current = requestAnimationFrame(step);
        }
        panVelocityPointsRef.current = [];
    }, [commitPanChange]);

    return {
        cancelInertia,
        commitPanChange,
        flushPendingPanChange,
        recordPanVelocityPoint,
        schedulePanChange,
        startInertiaFromVelocityPoints,
    };
}