import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { CanvasElement } from './canvas-types';
import { clientPointToCanvas } from './canvas-viewport-utils';
import { getInnermostFrameAtCanvasPoint } from './canvas-hit-test';
import {
    computeMoveSnap,
    computeResizeSnap,
    createEmptyMoveSnapLockState,
    createEmptyResizeSnapLockState,
    type MoveSnapLockState,
    type ResizeSnapLockState,
} from './canvas-snap-utils';
import type { AlignGuide } from './canvas-alignment';
import { calculatePanInertiaVelocity, stepPanInertia, trimPanVelocityPoints, type CanvasPointWithTime } from './canvas-pan-inertia';
import { createSelectionBox, getSelectionBoxScreenRect, resolveSelectionBoxSelectedIds, updateSelectionBox, type SelectionBoxState } from './canvas-selection-box-state';
import { getDragDescendantIds, resolveDragFrameAdoptions } from './canvas-drag-adoption';
import { calculateResizeBounds } from './canvas-resize-state';

// ── Internal types (mirrors private types in CanvasArea) ──────────────────────

type DragStartState = {
    x: number;
    y: number;
    elementX: number;
    elementY: number;
    width: number;
    height: number;
    panX: number;
    panY: number;
    aspectRatio?: number;
    initialPositions?: { id: string; x: number; y: number }[];
    selectionIds?: string[];
    altDragDuplicateTriggered?: boolean;
};

type DuplicateSelectionResult = {
    copies: CanvasElement[];
    sourceToCopyId: Record<string, string>;
};

// ── Public interface ──────────────────────────────────────────────────────────

export interface UseCanvasPointerInteractionParams {
    // Canvas transforms
    scale: number;
    pan: { x: number; y: number };
    onPanChange: (pan: { x: number; y: number }) => void;
    // Element data
    elements: CanvasElement[];
    selectedIds: string[];
    activeTool: string;
    // Callbacks
    onToolChange: (tool: string) => void;
    onSelect: (ids: string[]) => void;
    onElementChange: (id: string, newAttrs: Partial<CanvasElement>) => void;
    onBatchElementChange?: (changes: { id: string; attrs: Partial<CanvasElement> }[]) => void;
    onAddElement: (element: CanvasElement) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onDuplicateSelection?: (ids: string[], position?: { x: number; y: number }) => DuplicateSelectionResult | void;
    onCanvasMouseMove?: (x: number, y: number) => void;
    // DOM refs
    outerRef: RefObject<HTMLDivElement | null>;
    selectionBoxOverlayRef: RefObject<HTMLDivElement | null>;
    // Visible elements for snap calculation
    visibleElementsRef: RefObject<CanvasElement[]>;
    // Utility functions provided by CanvasArea
    setAlignGuidesIfChanged: (guides: AlignGuide[]) => void;
    scheduleAutoLayout: (frameId: string) => void;
    moveElementToFrame: (elementId: string, targetFrameId?: string) => void;
    requestImageDetailUpgrade: (elementId: string | null) => void;
    isElementLocked: (element?: CanvasElement | null) => boolean;
    // UI state setters (state owned by CanvasArea for non-pointer UI)
    activeVideoId: string | null;
    setActiveVideoId: (id: string | null) => void;
    setEditingTextId: (id: string | null) => void;
    setQuickEditMarkId: (id: string | null) => void;
    setQuickEditPrompt: (prompt: string) => void;
}

export interface UseCanvasPointerInteractionReturn {
    // Interaction states (needed for JSX / derived computations in CanvasArea)
    isDragging: boolean;
    isResizing: boolean;
    resizingElementId: string | null;
    isPanning: boolean;
    isDrawing: boolean;
    isSelecting: boolean;
    isFrameDrawing: boolean;
    frameDrawBox: { startX: number; startY: number; currentX: number; currentY: number } | null;
    currentPath: { points: { x: number; y: number }[] } | null;
    dragPreviewState: { ids: string[]; dx: number; dy: number } | null;
    dropTargetFrameId: string | null;
    // Pan utilities (needed by CanvasArea's wheel handler and viewport fit)
    cancelInertia: () => void;
    commitPanChange: (nextPan: { x: number; y: number }) => void;
    // Primary handlers
    handleMouseDown: (
        e: ReactMouseEvent,
        elementId: string | null,
        elementX?: number,
        elementY?: number,
        width?: number,
        height?: number,
        options?: { fallbackSelectionId?: string },
    ) => void;
    /** Stable (identity-stable) wrapper for element renderers. */
    handleMouseDownStable: (
        e: ReactMouseEvent,
        elementId: string | null,
        elementX?: number,
        elementY?: number,
        width?: number,
        height?: number,
        options?: { fallbackSelectionId?: string },
    ) => void;
    /** Stable (identity-stable) wrapper for element renderers. */
    handleResizeStartStable: (e: ReactMouseEvent, elementId: string, handle: string, element: CanvasElement) => void;
    handleScreenSpaceResizeStart: (event: ReactMouseEvent<HTMLDivElement>, handle: string, element: CanvasElement) => void;
    handleMouseMove: (e: ReactMouseEvent) => void;
    // Toolbar selection capture handlers
    handleToolbarSelectionMouseDownCapture: (e: ReactMouseEvent) => void;
    handleToolbarSelectionPointerDownCapture: (e: ReactPointerEvent) => void;
    handleToolbarSelectionClickCapture: (e: ReactMouseEvent) => void;
}

// ── Hook implementation ───────────────────────────────────────────────────────

export function useCanvasPointerInteraction(
    params: UseCanvasPointerInteractionParams,
): UseCanvasPointerInteractionReturn {
    const {
        scale,
        pan,
        onPanChange,
        elements,
        selectedIds,
        activeTool,
        onToolChange,
        onSelect,
        onElementChange,
        onBatchElementChange,
        onAddElement,
        onDragStart,
        onDragEnd,
        onDuplicateSelection,
        onCanvasMouseMove,
        outerRef,
        selectionBoxOverlayRef,
        visibleElementsRef,
        setAlignGuidesIfChanged,
        scheduleAutoLayout,
        moveElementToFrame,
        requestImageDetailUpgrade,
        isElementLocked,
        activeVideoId,
        setActiveVideoId,
        setEditingTextId,
        setQuickEditMarkId,
        setQuickEditPrompt,
    } = params;

    // ── Constants ──────────────────────────────────────────────────────────────
    const DRAG_START_THRESHOLD = 3;
    const MOVE_SNAP_THRESHOLD = 10;
    const RESIZE_SNAP_THRESHOLD = 10;
    const MOVE_SNAP_RELEASE_THRESHOLD = 18;
    const RESIZE_SNAP_RELEASE_THRESHOLD = 18;

    // ── Interaction state ──────────────────────────────────────────────────────
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizingElementId, setResizingElementId] = useState<string | null>(null);
    const [isPanning, _setIsPanning] = useState(false);
    const isPanningRef = useRef(false);
    const setIsPanning = useCallback((v: boolean) => {
        isPanningRef.current = v;
        _setIsPanning(v);
    }, []);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSelecting, _setIsSelecting] = useState(false);
    const isSelectingRef = useRef(false);
    const setIsSelecting = useCallback((value: boolean) => {
        isSelectingRef.current = value;
        _setIsSelecting(value);
    }, []);
    const [, setSelectionBoxState] = useState<SelectionBoxState | null>(null);
    const selectionBoxRef = useRef<SelectionBoxState | null>(null);
    const [isFrameDrawing, setIsFrameDrawing] = useState(false);
    const [frameDrawBox, setFrameDrawBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
    const [currentPath, setCurrentPath] = useState<{ points: { x: number; y: number }[] } | null>(null);
    const [dragPreviewState, setDragPreviewState] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
    const [dropTargetFrameId, setDropTargetFrameId] = useState<string | null>(null);

    // ── Drag / resize refs ─────────────────────────────────────────────────────
    const dragStartRef = useRef<DragStartState | null>(null);
    const draggedElementIdRef = useRef<string | null>(null);
    const resizeHandleRef = useRef<string | null>(null);
    const dragVisualDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
    const moveSnapLockRef = useRef<MoveSnapLockState>(createEmptyMoveSnapLockState());
    const resizeSnapLockRef = useRef<ResizeSnapLockState>(createEmptyResizeSnapLockState());

    // ── Stable handler refs (updated on every render to avoid stale closures) ──
    const handleMouseDownRef = useRef<typeof handleMouseDown>(() => { /* init */ });
    const handleResizeStartRef = useRef<typeof handleResizeStart>(() => { /* init */ });
    const processMouseMoveRef = useRef<typeof processMouseMove>(() => { /* init */ });
    const handleMouseUpRef = useRef<() => void>(() => { /* init */ });

    // ── Toolbar selection probe refs ───────────────────────────────────────────
    const toolbarSelectionProbeRef = useRef<(() => void) | null>(null);
    const toolbarSuppressClickRef = useRef(false);

    // ── Pan inertia refs ───────────────────────────────────────────────────────
    const panRef = useRef(pan);
    const committedPanRef = useRef(pan);
    const onPanChangeRef = useRef(onPanChange);
    const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
    const panVelocityPointsRef = useRef<CanvasPointWithTime[]>([]);
    const inertiaRafRef = useRef<number | null>(null);
    const panRafRef = useRef<number | null>(null);

    // Keep pan refs in sync with incoming prop
    useEffect(() => {
        panRef.current = pan;
        committedPanRef.current = pan;
    }, [pan]);

    useEffect(() => {
        onPanChangeRef.current = onPanChange;
    }, [onPanChange]);

    // Clean up inertia on unmount
    useEffect(() => () => {
        if (inertiaRafRef.current !== null) cancelAnimationFrame(inertiaRafRef.current);
        if (panRafRef.current !== null) cancelAnimationFrame(panRafRef.current);
    }, []);

    // ── Pan utilities ──────────────────────────────────────────────────────────

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

    // ── Canvas coordinate conversion ───────────────────────────────────────────

    const toCanvasPoint = (clientX: number, clientY: number) => {
        return clientPointToCanvas({
            clientX,
            clientY,
            rect: outerRef.current?.getBoundingClientRect(),
            pan,
            scale,
        });
    };

    // ── Selection box utilities ────────────────────────────────────────────────

    const setSelectionBox = useCallback((
        next: SelectionBoxState | null | ((prev: SelectionBoxState | null) => SelectionBoxState | null),
    ) => {
        if (typeof next === 'function') {
            const resolved = next(selectionBoxRef.current);
            selectionBoxRef.current = resolved;
            setSelectionBoxState(resolved);
            return;
        }
        selectionBoxRef.current = next;
        setSelectionBoxState(next);
    }, []);

    const syncSelectionBoxOverlay = useCallback((box: SelectionBoxState | null) => {
        const overlay = selectionBoxOverlayRef.current;
        if (!overlay) return;
        if (!box) {
            overlay.style.display = 'none';
            return;
        }
        const rect = getSelectionBoxScreenRect(box, { scale, pan });
        overlay.style.display = 'block';
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
    }, [pan.x, pan.y, scale, selectionBoxOverlayRef]);

    const beginSelectionBoxFromClient = useCallback((
        startClientX: number,
        startClientY: number,
        currentClientX: number,
        currentClientY: number,
        additiveSelection: boolean,
    ) => {
        const { x: startX, y: startY } = toCanvasPoint(startClientX, startClientY);
        const { x: currentX, y: currentY } = toCanvasPoint(currentClientX, currentClientY);
        const nextSelectionBox = createSelectionBox({
            start: { x: startX, y: startY },
            current: { x: currentX, y: currentY },
            additiveSelection,
        });
        setActiveVideoId(null);
        setIsSelecting(true);
        setSelectionBox(nextSelectionBox);
        syncSelectionBoxOverlay(nextSelectionBox);
        setEditingTextId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setIsSelecting, setSelectionBox, syncSelectionBoxOverlay, setActiveVideoId, setEditingTextId]);

    // ── Toolbar selection probe ────────────────────────────────────────────────

    const stopToolbarSelectionProbe = useCallback(() => {
        toolbarSelectionProbeRef.current?.();
        toolbarSelectionProbeRef.current = null;
    }, []);

    const handleToolbarSelectionPressStart = useCallback((e: {
        button: number;
        target: EventTarget | null;
        stopPropagation: () => void;
        clientX: number;
        clientY: number;
        shiftKey: boolean;
        ctrlKey: boolean;
        metaKey: boolean;
    }) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
        e.stopPropagation();
        toolbarSuppressClickRef.current = false;
        stopToolbarSelectionProbe();

        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const additiveSelection = e.shiftKey || e.ctrlKey || e.metaKey;

        const handleMove = (event: MouseEvent | PointerEvent) => {
            if ((event.buttons & 1) !== 1) {
                stopToolbarSelectionProbe();
                return;
            }
            const movedX = Math.abs(event.clientX - startClientX);
            const movedY = Math.abs(event.clientY - startClientY);
            if (Math.max(movedX, movedY) < DRAG_START_THRESHOLD) return;
            toolbarSuppressClickRef.current = true;
            beginSelectionBoxFromClient(startClientX, startClientY, event.clientX, event.clientY, additiveSelection);
            stopToolbarSelectionProbe();
        };

        const handleUp = () => {
            stopToolbarSelectionProbe();
        };

        const handlePointerCancel = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') return;
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
    }, [DRAG_START_THRESHOLD, beginSelectionBoxFromClient, stopToolbarSelectionProbe]);

    const handleToolbarSelectionMouseDownCapture = useCallback((e: ReactMouseEvent) => {
        handleToolbarSelectionPressStart(e);
    }, [handleToolbarSelectionPressStart]);

    const handleToolbarSelectionPointerDownCapture = useCallback((e: ReactPointerEvent) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        handleToolbarSelectionPressStart(e);
    }, [handleToolbarSelectionPressStart]);

    const handleToolbarSelectionClickCapture = useCallback((e: ReactMouseEvent) => {
        if (!toolbarSuppressClickRef.current) return;
        toolbarSuppressClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
    }, []);

    // ── Resize interaction ─────────────────────────────────────────────────────

    function startResizeInteraction(
        elementId: string,
        handle: string,
        element: CanvasElement,
        clientX: number,
        clientY: number,
    ) {
        if (isElementLocked(element)) return;
        setIsResizing(true);
        setResizingElementId(elementId);
        draggedElementIdRef.current = elementId;
        resizeHandleRef.current = handle;
        dragStartRef.current = {
            x: clientX,
            y: clientY,
            elementX: element.x,
            elementY: element.y,
            width: element.width || 0,
            height: element.height || 0,
            panX: 0,
            panY: 0,
            aspectRatio: (element.width || 1) / (element.height || 1),
        };
    }

    function handleResizeStart(e: ReactMouseEvent, elementId: string, handle: string, element: CanvasElement) {
        e.stopPropagation();
        startResizeInteraction(elementId, handle, element, e.clientX, e.clientY);
    }

    function handleScreenSpaceResizeStart(
        event: ReactMouseEvent<HTMLDivElement>,
        handle: string,
        element: CanvasElement,
    ) {
        event.stopPropagation();
        startResizeInteraction(element.id, handle, element, event.clientX, event.clientY);
    }

    // ── Core mouse down ────────────────────────────────────────────────────────

    function handleMouseDown(
        e: ReactMouseEvent,
        elementId: string | null,
        elementX: number = 0,
        elementY: number = 0,
        width: number = 0,
        height: number = 0,
        options?: { fallbackSelectionId?: string },
    ) {
        cancelInertia();

        // Middle mouse button on any element → start panning
        if (e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            dragStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                elementX: 0,
                elementY: 0,
                width: 0,
                height: 0,
                panX: pan.x,
                panY: pan.y,
            };
            return;
        }

        if (activeTool === 'hand') {
            setIsPanning(true);
            dragStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                elementX: 0,
                elementY: 0,
                width: 0,
                height: 0,
                panX: pan.x,
                panY: pan.y,
            };
            return;
        }

        if (activeTool === 'frame') {
            const { x: canvasX, y: canvasY } = toCanvasPoint(e.clientX, e.clientY);
            setIsFrameDrawing(true);
            setFrameDrawBox({ startX: canvasX, startY: canvasY, currentX: canvasX, currentY: canvasY });
            return;
        }

        if (activeTool === 'mark') {
            const { x: canvasX, y: canvasY } = toCanvasPoint(e.clientX, e.clientY);
            const existingMarks = elements.filter(el => el.type === 'mark');
            const markNumber = existingMarks.length > 0
                ? Math.max(...existingMarks.map(m => m.markNumber || 0)) + 1
                : 1;
            const targetElement = [...elements].reverse().find(el => {
                if (el.type !== 'image' && el.type !== 'video') return false;
                if (!el.content) return false;
                const elRight = el.x + (el.width || 0);
                const elBottom = el.y + (el.height || 0);
                return canvasX >= el.x && canvasX <= elRight && canvasY >= el.y && canvasY <= elBottom;
            });
            const newMark: CanvasElement = {
                id: uuidv4(),
                type: 'mark',
                x: canvasX - 16,
                y: canvasY - 30,
                width: 32,
                height: 32,
                markNumber,
                markText: '',
                color: '#EF4444',
                markTargetId: targetElement?.id,
            };
            onAddElement(newMark);
            onSelect([newMark.id]);
            if (targetElement) {
                setQuickEditMarkId(newMark.id);
                setQuickEditPrompt('');
            }
            return;
        }

        if (activeTool === 'draw') {
            setIsDrawing(true);
            const { x: canvasX, y: canvasY } = toCanvasPoint(e.clientX, e.clientY);
            setCurrentPath({ points: [{ x: canvasX, y: canvasY }] });
            return;
        }

        if (!elementId) {
            const additiveSelection = e.shiftKey || e.ctrlKey || e.metaKey;
            setActiveVideoId(null);
            const { x: canvasX, y: canvasY } = toCanvasPoint(e.clientX, e.clientY);
            const nextSelectionBox = createSelectionBox({
                start: { x: canvasX, y: canvasY },
                current: { x: canvasX, y: canvasY },
                additiveSelection,
                fallbackSelectionId: options?.fallbackSelectionId,
            });
            setIsSelecting(true);
            setSelectionBox(nextSelectionBox);
            syncSelectionBoxOverlay(nextSelectionBox);
            setEditingTextId(null);
            return;
        }

        e.stopPropagation();

        // Exit video play mode when clicking a different element
        if (activeVideoId && activeVideoId !== elementId) {
            setActiveVideoId(null);
        }

        let dragSelectedIds = selectedIds;

        // Handle selection logic
        if (e.shiftKey) {
            if (selectedIds.includes(elementId)) {
                dragSelectedIds = selectedIds.filter(id => id !== elementId);
                onSelect(dragSelectedIds);
            } else {
                dragSelectedIds = [...selectedIds, elementId];
                onSelect(dragSelectedIds);
            }
        } else {
            if (!selectedIds.includes(elementId)) {
                dragSelectedIds = [elementId];
                onSelect(dragSelectedIds);
            }
        }

        // If clicking a handle, don't start drag (handled by handleResizeStart)
        if ((e.target as HTMLElement).dataset.handle) return;

        // Prevent dragging locked elements
        const clickedEl = elements.find(el => el.id === elementId);
        if (isElementLocked(clickedEl)) return;

        draggedElementIdRef.current = elementId;

        // Store initial positions of ALL selected elements for group dragging,
        // recursively including descendants of selected frames.
        const frameChildIds = new Set<string>();
        const collectDescendants = (parentId: string) => {
            elements.forEach(child => {
                if (
                    child.parentFrameId === parentId &&
                    !dragSelectedIds.includes(child.id) &&
                    !frameChildIds.has(child.id)
                ) {
                    frameChildIds.add(child.id);
                    if (child.type === 'frame') collectDescendants(child.id);
                }
            });
        };
        dragSelectedIds.forEach(selId => {
            const el = elements.find(e => e.id === selId);
            if (el?.type === 'frame') collectDescendants(selId);
        });
        const allDragIds = [...new Set([...dragSelectedIds, ...frameChildIds])];
        const initialPositions = elements
            .filter(el => allDragIds.includes(el.id))
            .map(el => ({ id: el.id, x: el.x, y: el.y }));

        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            elementX,
            elementY,
            width: width || 0,
            height: height || 0,
            panX: 0,
            panY: 0,
            aspectRatio: width && height ? width / height : undefined,
            initialPositions,
            selectionIds: dragSelectedIds,
            altDragDuplicateTriggered: false,
        };
    }

    // ── Core mouse move ────────────────────────────────────────────────────────

    function processMouseMove(
        clientX: number,
        clientY: number,
        buttons: number,
        altKey: boolean,
        timeStamp?: number,
    ) {
        const { x: canvasX, y: canvasY } = toCanvasPoint(clientX, clientY);
        const snapDisabled = altKey;

        onCanvasMouseMove?.(canvasX, canvasY);

        if ((isDragging || isResizing) && (buttons & 1) !== 1) {
            handleMouseUp();
            return;
        }
        if (isPanning && (buttons & 1) === 0 && (buttons & 4) === 0) {
            handleMouseUp();
            return;
        }

        if (isFrameDrawing && frameDrawBox) {
            setFrameDrawBox(prev => prev ? { ...prev, currentX: canvasX, currentY: canvasY } : null);
            return;
        }

        if (isDrawing && currentPath) {
            setCurrentPath(prev => prev
                ? { points: [...prev.points, { x: canvasX, y: canvasY }] }
                : null);
            return;
        }

        const activeSelectionBox = selectionBoxRef.current;
        if (isSelectingRef.current && activeSelectionBox) {
            const nextSelectionBox = updateSelectionBox(activeSelectionBox, { x: canvasX, y: canvasY });
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            syncSelectionBoxOverlay(nextSelectionBox);
            return;
        }

        if (!dragStartRef.current) return;

        if (isPanning || isPanningRef.current) {
            const dx = clientX - dragStartRef.current.x;
            const dy = clientY - dragStartRef.current.y;
            schedulePanChange({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
            const now = timeStamp ?? 0;
            const pts = panVelocityPointsRef.current;
            pts.push({ x: clientX, y: clientY, t: now });
            panVelocityPointsRef.current = trimPanVelocityPoints(pts, 6);
            return;
        }

        if (!draggedElementIdRef.current) return;

        const dx = (clientX - dragStartRef.current.x) / scale;
        const dy = (clientY - dragStartRef.current.y) / scale;

        let effectiveIsDragging = isDragging;
        if (!effectiveIsDragging && dragStartRef.current.initialPositions) {
            const movedX = Math.abs(clientX - dragStartRef.current.x);
            const movedY = Math.abs(clientY - dragStartRef.current.y);
            if (Math.max(movedX, movedY) < DRAG_START_THRESHOLD) return;

            if (
                altKey &&
                !dragStartRef.current.altDragDuplicateTriggered &&
                dragStartRef.current.selectionIds &&
                dragStartRef.current.selectionIds.length > 0 &&
                onDuplicateSelection
            ) {
                const sourceSelection = elements.filter(
                    element => dragStartRef.current?.selectionIds?.includes(element.id),
                );
                if (sourceSelection.length > 0) {
                    const minX = Math.min(...sourceSelection.map(element => element.x));
                    const minY = Math.min(...sourceSelection.map(element => element.y));
                    const duplicateResult = onDuplicateSelection(dragStartRef.current.selectionIds, { x: minX, y: minY });

                    if (duplicateResult?.copies.length) {
                        const nextDraggedElementId = draggedElementIdRef.current
                            ? duplicateResult.sourceToCopyId[draggedElementIdRef.current] ?? duplicateResult.copies[0].id
                            : duplicateResult.copies[0].id;

                        draggedElementIdRef.current = nextDraggedElementId;
                        dragStartRef.current = {
                            ...dragStartRef.current,
                            initialPositions: duplicateResult.copies.map(copy => ({ id: copy.id, x: copy.x, y: copy.y })),
                            selectionIds: duplicateResult.copies.map(copy => copy.id),
                            altDragDuplicateTriggered: true,
                        };
                    } else {
                        dragStartRef.current.altDragDuplicateTriggered = true;
                    }
                } else {
                    dragStartRef.current.altDragDuplicateTriggered = true;
                }
            }

            setIsDragging(true);
            onDragStart?.();
            effectiveIsDragging = true;
        }

        if (effectiveIsDragging && dragStartRef.current.initialPositions) {
            const draggedId = draggedElementIdRef.current;
            const draggedInitial = dragStartRef.current.initialPositions.find(p => p.id === draggedId);
            const snapDraggedEl = elements.find(e => e.id === draggedId);
            const draggedIdsSet = new Set(dragStartRef.current.initialPositions.map(p => p.id));
            const moveSnap = computeMoveSnap({
                draggedElement: snapDraggedEl,
                draggedInitial,
                draggedIds: draggedIdsSet,
                dx,
                dy,
                otherElements: visibleElementsRef.current,
                threshold: MOVE_SNAP_THRESHOLD,
                releaseThreshold: MOVE_SNAP_RELEASE_THRESHOLD,
                snapDisabled,
                lockState: moveSnapLockRef.current,
            });
            moveSnapLockRef.current = moveSnap.nextLockState;

            const finalSnapDx = moveSnap.snapDx;
            const finalSnapDy = moveSnap.snapDy;
            dragVisualDeltaRef.current = { dx: dx + finalSnapDx, dy: dy + finalSnapDy };
            setDragPreviewState(prev => {
                const nextIds = dragStartRef.current?.initialPositions?.map(pos => pos.id) ?? [];
                const nextDx = dx + finalSnapDx;
                const nextDy = dy + finalSnapDy;
                if (
                    prev &&
                    prev.dx === nextDx &&
                    prev.dy === nextDy &&
                    prev.ids.length === nextIds.length &&
                    prev.ids.every((id, index) => id === nextIds[index])
                ) {
                    return prev;
                }
                return { ids: nextIds, dx: nextDx, dy: nextDy };
            });

            setAlignGuidesIfChanged(moveSnap.guides);

            // Detect drop target frame for visual highlight
            const draggedEl = elements.find(e => e.id === draggedElementIdRef.current);
            if (draggedEl) {
                const draggedDescendants = draggedEl.type === 'frame' ? getDragDescendantIds(draggedEl.id, elements) : new Set<string>();
                const excludedFrameIds = new Set([draggedEl.id, ...draggedDescendants]);
                if (draggedEl.parentFrameId) excludedFrameIds.add(draggedEl.parentFrameId);
                const targetFrame = getInnermostFrameAtCanvasPoint(elements, canvasX, canvasY, { excludedFrameIds });
                setDropTargetFrameId(targetFrame?.id || null);
            } else {
                setDropTargetFrameId(null);
            }
        } else if (isResizing && resizeHandleRef.current) {
            const { elementX, elementY, width, height, aspectRatio } = dragStartRef.current;
            const element = elements.find(el => el.id === draggedElementIdRef.current);
            const isImage = element?.type === 'image';
            const resizeHandle = resizeHandleRef.current;
            let { x: newX, y: newY, width: newWidth, height: newHeight } = calculateResizeBounds({
                start: { elementX, elementY, width, height, aspectRatio },
                handle: resizeHandle,
                delta: { dx, dy },
                preserveAspectRatio: !!(isImage && aspectRatio),
            });

            const resizeSnap = computeResizeSnap({
                elementId: draggedElementIdRef.current,
                handle: resizeHandle,
                bounds: { x: newX, y: newY, width: newWidth, height: newHeight },
                targets: visibleElementsRef.current,
                threshold: RESIZE_SNAP_THRESHOLD,
                releaseThreshold: RESIZE_SNAP_RELEASE_THRESHOLD,
                snapDisabled,
                lockState: resizeSnapLockRef.current,
            });
            resizeSnapLockRef.current = resizeSnap.nextLockState;
            ({ x: newX, y: newY, width: newWidth, height: newHeight } = resizeSnap.bounds);

            setAlignGuidesIfChanged(resizeSnap.guides);
            onElementChange(draggedElementIdRef.current, { x: newX, y: newY, width: newWidth, height: newHeight });

            if (element?.type === 'frame' && element.frameAutoLayout && draggedElementIdRef.current) {
                scheduleAutoLayout(draggedElementIdRef.current);
            }
        }
    }

    const handleMouseMove = (e: ReactMouseEvent) => {
        if (dragStartRef.current || isPanningRef.current || isDrawing || isSelectingRef.current || isFrameDrawing) {
            return;
        }
        processMouseMove(e.clientX, e.clientY, e.buttons, e.altKey, e.timeStamp);
    };

    // ── Core mouse up ──────────────────────────────────────────────────────────

    function handleMouseUp() {
        flushPendingPanChange();

        const activeSelectionBox = selectionBoxRef.current;
        if (
            !isDragging &&
            !isResizing &&
            !isPanning &&
            !isDrawing &&
            !isSelectingRef.current &&
            !isFrameDrawing &&
            !dragStartRef.current &&
            !activeSelectionBox &&
            !frameDrawBox &&
            !currentPath
        ) {
            return;
        }

        const resizedElementId = isResizing ? draggedElementIdRef.current : null;

        // Frame drawing completion
        if (isFrameDrawing && frameDrawBox) {
            const x = Math.min(frameDrawBox.startX, frameDrawBox.currentX);
            const y = Math.min(frameDrawBox.startY, frameDrawBox.currentY);
            const w = Math.abs(frameDrawBox.currentX - frameDrawBox.startX);
            const h = Math.abs(frameDrawBox.currentY - frameDrawBox.startY);
            if (w >= 20 && h >= 20) {
                const frameId = uuidv4();
                const newFrame: CanvasElement = {
                    id: frameId,
                    type: 'frame',
                    x,
                    y,
                    width: Math.round(w),
                    height: Math.round(h),
                    framePreset: 'Custom',
                    frameBgColor: '#FFFFFF',
                    frameClip: true,
                    frameName: 'Frame',
                };
                onAddElement(newFrame);
                elements.forEach(el => {
                    if (el.type === 'connector') return;
                    const elCenterX = el.x + (el.width || 0) / 2;
                    const elCenterY = el.y + (el.height || 0) / 2;
                    if (
                        elCenterX >= x && elCenterX <= x + Math.round(w) &&
                        elCenterY >= y && elCenterY <= y + Math.round(h)
                    ) {
                        if (!el.parentFrameId) onElementChange(el.id, { parentFrameId: frameId });
                    }
                });
                onSelect([frameId]);
            }
            setIsFrameDrawing(false);
            setFrameDrawBox(null);
            onToolChange('select');
            return;
        }

        // Box selection completion
        if (isSelectingRef.current && activeSelectionBox) {
            onSelect(resolveSelectionBoxSelectedIds({
                box: activeSelectionBox,
                elements,
                selectedIds,
            }));
        }

        // Free-draw path completion
        if (isDrawing && currentPath) {
            const points = currentPath.points;
            if (points.length > 1) {
                const xs = points.map(p => p.x);
                const ys = points.map(p => p.y);
                const minX = Math.min(...xs);
                const minY = Math.min(...ys);
                const maxX = Math.max(...xs);
                const maxY = Math.max(...ys);
                const width = maxX - minX;
                const height = maxY - minY;
                const newPoints = points.map(p => ({ x: p.x - minX, y: p.y - minY }));
                const newElement: CanvasElement = {
                    id: uuidv4(),
                    type: 'path',
                    x: minX,
                    y: minY,
                    width: Math.max(width, 1),
                    height: Math.max(height, 1),
                    points: newPoints,
                    color: '#000000',
                    strokeWidth: 3,
                };
                onAddElement(newElement);
                onSelect([newElement.id]);
            }
            setCurrentPath(null);
        }

        // Commit CSS-transform drag: apply final positions to React state
        const savedDragDelta = isDragging && dragVisualDeltaRef.current
            ? { dx: dragVisualDeltaRef.current.dx, dy: dragVisualDeltaRef.current.dy }
            : { dx: 0, dy: 0 };

        if (isDragging && dragStartRef.current?.initialPositions && dragVisualDeltaRef.current) {
            const { dx, dy } = dragVisualDeltaRef.current;
            if (dx !== 0 || dy !== 0) {
                const batchChanges: { id: string; attrs: Partial<CanvasElement> }[] = [];
                for (const pos of dragStartRef.current.initialPositions) {
                    batchChanges.push({ id: pos.id, attrs: { x: pos.x + dx, y: pos.y + dy } });
                }
                onBatchElementChange?.(batchChanges);
            }
            dragVisualDeltaRef.current = { dx: 0, dy: 0 };
        }

        // Auto-adopt / release elements to/from frames after drag
        if (isDragging && dragStartRef.current?.initialPositions) {
            resolveDragFrameAdoptions({
                elements,
                initialPositions: dragStartRef.current.initialPositions,
                dragDelta: savedDragDelta,
            }).forEach((action) => moveElementToFrame(action.elementId, action.targetFrameId));
        }

        // Launch inertia momentum if was panning
        if (isPanning && panVelocityPointsRef.current.length >= 2) {
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
        }

        setIsDragging(false);
        setDragPreviewState(null);
        setIsResizing(false);
        setResizingElementId(null);
        setIsPanning(false);
        setIsDrawing(false);
        setIsSelecting(false);
        setIsFrameDrawing(false);
        setDropTargetFrameId(null);
        setAlignGuidesIfChanged([]);
        setSelectionBox(null);
        syncSelectionBoxOverlay(null);
        setFrameDrawBox(null);

        if (resizedElementId) {
            const resizedElement = elements.find(element => element.id === resizedElementId);
            if (resizedElement?.type === 'image' && resizedElement.content) {
                requestImageDetailUpgrade(resizedElementId);
            }
        }

        dragStartRef.current = null;
        draggedElementIdRef.current = null;
        resizeHandleRef.current = null;
        moveSnapLockRef.current = { x: null, y: null };
        resizeSnapLockRef.current = { x: null, y: null };
        onDragEnd?.();
    }

    // ── Ref updates (runs after every render to keep closures fresh) ───────────

    useEffect(() => {
        handleMouseDownRef.current = handleMouseDown;
        handleResizeStartRef.current = handleResizeStart;
        processMouseMoveRef.current = processMouseMove;
        handleMouseUpRef.current = handleMouseUp;
    });

    // ── Stable wrappers for element renderers ──────────────────────────────────

    const handleMouseDownStable = useCallback((
        e: ReactMouseEvent,
        elementId: string | null,
        elementX: number = 0,
        elementY: number = 0,
        width: number = 0,
        height: number = 0,
        options?: { fallbackSelectionId?: string },
    ) => {
        handleMouseDownRef.current(e, elementId, elementX, elementY, width, height, options);
    }, []);

    const handleResizeStartStable = useCallback((
        e: ReactMouseEvent,
        elementId: string,
        handle: string,
        element: CanvasElement,
    ) => {
        handleResizeStartRef.current(e, elementId, handle, element);
    }, []);

    // ── Global event listeners ─────────────────────────────────────────────────

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            handleMouseUpRef.current();
        };

        const handleGlobalPointerCancel = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') return;
            handleMouseUpRef.current();
        };

        const handleGlobalMouseMove = (e: MouseEvent | PointerEvent) => {
            if (
                !dragStartRef.current &&
                !isPanningRef.current &&
                !isDrawing &&
                !isSelectingRef.current &&
                !isFrameDrawing
            ) {
                return;
            }
            processMouseMoveRef.current(e.clientX, e.clientY, e.buttons, e.altKey, e.timeStamp);
        };

        const handleWindowBlur = () => {
            handleMouseUpRef.current();
        };

        window.addEventListener('mousemove', handleGlobalMouseMove, true);
        window.addEventListener('pointermove', handleGlobalMouseMove, true);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('pointerup', handleGlobalMouseUp, true);
        window.addEventListener('pointercancel', handleGlobalPointerCancel, true);
        window.addEventListener('blur', handleWindowBlur);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove, true);
            window.removeEventListener('pointermove', handleGlobalMouseMove, true);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('pointerup', handleGlobalMouseUp, true);
            window.removeEventListener('pointercancel', handleGlobalPointerCancel, true);
            window.removeEventListener('blur', handleWindowBlur);
        };
    }, [isDrawing, isFrameDrawing]);

    // ── Return ─────────────────────────────────────────────────────────────────

    return {
        isDragging,
        isResizing,
        resizingElementId,
        isPanning,
        isDrawing,
        isSelecting,
        isFrameDrawing,
        frameDrawBox,
        currentPath,
        dragPreviewState,
        dropTargetFrameId,
        cancelInertia,
        commitPanChange,
        handleMouseDown,
        handleMouseDownStable,
        handleResizeStartStable,
        handleScreenSpaceResizeStart,
        handleMouseMove,
        handleToolbarSelectionMouseDownCapture,
        handleToolbarSelectionPointerDownCapture,
        handleToolbarSelectionClickCapture,
    };
}
