import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ContextToolbar } from './ContextToolbar';
import { v4 as uuidv4 } from 'uuid';
import { Image as ImageIcon, Video, Sparkles, MousePointer2, Type, Square, MousePointerClick, MapPin, Send, Frame, Download, Trash2, AlignStartVertical, AlignEndVertical, AlignCenterHorizontal, AlignStartHorizontal, AlignEndHorizontal, AlignCenterVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Minus, Eye, LayoutGrid, BookmarkPlus } from 'lucide-react';
import canvasTestEvents from '@/lib/testing/canvas-test-events.json';
import { isImageRef, getImageDataUrl, type SpatialIndex } from '@/lib/editor-kernel';
import { CanvasElementRenderer, type ElementHandlers } from './CanvasElementRenderer';
import { WorkbenchImage } from './WorkbenchImage';
import { ExportMenu } from './ExportMenu';
import { CanvasMinimap } from './CanvasMinimap';
import { renderPathPoints } from './canvas-ui-utils';
import type { CanvasElement, CanvasElementExportFormat, FrameAutoLayoutMode, FrameAutoLayoutAlign } from './canvas-types';
import type { ProjectReferenceImageItem } from '@/lib/project-reference-library';
import type { AlignGuide, AlignmentDirection, DistributionAxis, LayoutSelectionMode } from './canvas-alignment';
import { getElementsBounds, computeAlignment, computeDistribution, computeEqualSpacing, computeLayoutSelection, getDescendantIds as _getDescendantIds } from './canvas-alignment';
import { computeFrameLayout } from './canvas-frame-layout';

type SelectionBoxState = {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    mode: 'replace' | 'add';
    fallbackSelectionId?: string;
};

export interface CanvasRenderMetrics {
    visibleCount: number;
    totalCount: number;
    culledCount: number;
    virtualizedCount: number;
    deferredCount: number;
    maxVisibleElements: number;
    viewportMargin: number;
    partitionCount: number;
    partitionTileSize: number;
}

function serializeRenderMetrics(metrics: CanvasRenderMetrics) {
    return JSON.stringify(metrics);
}

const SCREENSPACE_RESIZE_HANDLE_SIZE = 10;
const SCREENSPACE_RESIZE_HIT_SIZE = 24;
const SCREENSPACE_RESIZE_EDGE_THICKNESS = 14;

const SCREENSPACE_RESIZE_HANDLE_SPECS = [
    { handle: 'nw', cursor: 'nw-resize', style: { left: 0, top: 0, transform: 'translate(-50%, -50%)' } },
    { handle: 'ne', cursor: 'ne-resize', style: { left: '100%', top: 0, transform: 'translate(-50%, -50%)' } },
    { handle: 'sw', cursor: 'sw-resize', style: { left: 0, top: '100%', transform: 'translate(-50%, -50%)' } },
    { handle: 'se', cursor: 'se-resize', style: { left: '100%', top: '100%', transform: 'translate(-50%, -50%)' } },
    { handle: 'w', cursor: 'w-resize', style: { left: 0, top: '50%', transform: 'translate(-50%, -50%)' } },
    { handle: 'e', cursor: 'e-resize', style: { left: '100%', top: '50%', transform: 'translate(-50%, -50%)' } },
    { handle: 'n', cursor: 'n-resize', style: { left: '50%', top: 0, transform: 'translate(-50%, -50%)' } },
    { handle: 's', cursor: 's-resize', style: { left: '50%', top: '100%', transform: 'translate(-50%, -50%)' } },
] as const satisfies ReadonlyArray<{ handle: string; cursor: React.CSSProperties['cursor']; style: React.CSSProperties }>;

const SCREENSPACE_RESIZE_EDGE_SPECS = [
    {
        handle: 'n',
        cursor: 'n-resize',
        style: {
            left: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            right: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            top: -(SCREENSPACE_RESIZE_EDGE_THICKNESS / 2),
            height: SCREENSPACE_RESIZE_EDGE_THICKNESS,
        },
    },
    {
        handle: 's',
        cursor: 's-resize',
        style: {
            left: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            right: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            top: `calc(100% - ${SCREENSPACE_RESIZE_EDGE_THICKNESS / 2}px)`,
            height: SCREENSPACE_RESIZE_EDGE_THICKNESS,
        },
    },
    {
        handle: 'w',
        cursor: 'w-resize',
        style: {
            top: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            bottom: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            left: -(SCREENSPACE_RESIZE_EDGE_THICKNESS / 2),
            width: SCREENSPACE_RESIZE_EDGE_THICKNESS,
        },
    },
    {
        handle: 'e',
        cursor: 'e-resize',
        style: {
            top: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            bottom: SCREENSPACE_RESIZE_HIT_SIZE / 2,
            left: `calc(100% - ${SCREENSPACE_RESIZE_EDGE_THICKNESS / 2}px)`,
            width: SCREENSPACE_RESIZE_EDGE_THICKNESS,
        },
    },
] as const satisfies ReadonlyArray<{ handle: string; cursor: React.CSSProperties['cursor']; style: React.CSSProperties }>;

function canUseScreenSpaceResizeOverlayForElement(element?: CanvasElement | null) {
    if (!element) {
        return false;
    }

    return element.type !== 'connector'
        && element.type !== 'image-generator'
        && element.type !== 'video-generator'
        && element.type !== 'storyboard-planner';
}

interface CanvasAreaProps {
    scale: number;
    pan: { x: number; y: number };
    onPanChange: (pan: { x: number; y: number }) => void;
    onScaleChange: (scale: number) => void;
    elements: CanvasElement[];
    selectedIds: string[];
    highlightedElementIds?: string[];
    onSelect: (ids: string[]) => void;
    onElementChange: (id: string, newAttrs: Partial<CanvasElement>) => void;
    onStoryboardSaved?: (id: string) => void;
    storyboardAutoAdvanceEnabled?: boolean;
    onDelete: (id: string) => void;
    onAddElement: (element: CanvasElement) => void;
    activeTool: string;
    onToolChange: (tool: string) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onConnectFlow?: (element: CanvasElement) => void;
    onCopyElement?: (element: CanvasElement) => void;
    onCopySelection?: (ids: string[]) => void;
    onCutSelection?: (ids: string[]) => void;
    onPasteAt?: (position: { x: number; y: number }) => void;
    onDuplicateSelection?: (ids: string[], position?: { x: number; y: number }) => void;
    onDownloadElement?: (element: CanvasElement, format?: CanvasElementExportFormat) => void;
    onSendSelectionToChat?: (ids: string[]) => void;
    onGroupSelection?: (ids: string[]) => void;
    onUngroupSelection?: (ids: string[]) => void;
    onMergeSelection?: (ids: string[]) => void;
    onBringForward?: (ids: string[]) => void;
    onSendBackward?: (ids: string[]) => void;
    onBringToFront?: (ids: string[]) => void;
    onSendToBack?: (ids: string[]) => void;
    onToggleElementsHidden?: (ids: string[]) => void;
    onToggleElementsLocked?: (ids: string[]) => void;
    onDeleteSelection?: (ids: string[]) => void;
    onExportStoryboardSelection?: (ids: string[]) => void;
    onGenerateStoryboardSelection?: (ids: string[]) => void;
    onGenerateStoryboardVideoSelection?: (ids: string[]) => void;
    projectReferenceImages?: ProjectReferenceImageItem[];
    onUseProjectReferenceImage?: (id: string) => void;
    onSaveAsProjectReference?: (element: CanvasElement) => void;
    onSaveSelectionAsProjectReference?: (ids: string[]) => void;
    onAiEditElement?: (element: CanvasElement, prompt: string) => void;
    onRecoverImageEditTask?: (elementId: string, taskId: string) => Promise<void>;
    onReplaceBackground?: (element: CanvasElement, prompt: string) => void;
    onMockupElement?: (element: CanvasElement, templateId: string) => void;
    onAnnotateImage?: (element: CanvasElement) => void;
    onCropImage?: (element: CanvasElement) => void;
    onSplitStoryboard?: (element: CanvasElement) => void;
    onStoryboardPlanFromImage?: (element: CanvasElement) => void;
    onAddImage?: (files: File[], position?: { x: number; y: number }) => void;
    onAddVideo?: (file: File, position?: { x: number; y: number }) => void;
    onOpenImageGenerator?: () => void;
    onOpenVideoGenerator?: () => void;
    onCanvasMouseMove?: (canvasX: number, canvasY: number) => void;
    canvasSelectMode?: 'image' | 'video' | null;
    onCanvasSelectPick?: (element: CanvasElement) => void;
    onCancelCanvasSelect?: () => void;
    generatorSubmittingMap?: Record<string, boolean>;
    highlightedResultId?: string | null;
    canPaste?: boolean;
    /** 批量更新多个元素属性（拖拽 N 个元素时一次 setState） */
    onBatchElementChange?: (changes: { id: string; attrs: Partial<CanvasElement> }[]) => void;
    /** R-Tree 空间索引，用于 O(log n) 视口裁剪和吸附检测 */
    spatialIndex?: SpatialIndex;
    /** Right offset for minimap to avoid overlapping side panels */
    minimapRightOffset?: number;
    resolvedImageSrcMap?: Record<string, string>;
    onRenderMetricsChange?: (metrics: CanvasRenderMetrics) => void;
}

export const CanvasArea = React.memo(function CanvasArea({ scale, pan, onPanChange, onScaleChange, elements, selectedIds, highlightedElementIds = [], onSelect, onElementChange, onStoryboardSaved, storyboardAutoAdvanceEnabled = false, onDelete, onAddElement, activeTool, onToolChange, onDragStart, onDragEnd, onConnectFlow, onCopyElement, onCopySelection, onCutSelection, onPasteAt, onDuplicateSelection, onDownloadElement, onSendSelectionToChat, onGroupSelection, onUngroupSelection, onMergeSelection, onBringForward, onSendBackward, onBringToFront, onSendToBack, onToggleElementsHidden, onToggleElementsLocked, onDeleteSelection, onExportStoryboardSelection, onGenerateStoryboardSelection, onGenerateStoryboardVideoSelection, projectReferenceImages, onUseProjectReferenceImage, onSaveAsProjectReference, onSaveSelectionAsProjectReference, onAiEditElement, onRecoverImageEditTask, onReplaceBackground, onMockupElement, onAnnotateImage, onCropImage, onSplitStoryboard, onStoryboardPlanFromImage, onAddImage, onAddVideo, onOpenImageGenerator, onOpenVideoGenerator, onCanvasMouseMove, canvasSelectMode, onCanvasSelectPick, onCancelCanvasSelect, generatorSubmittingMap, highlightedResultId, canPaste, onBatchElementChange, spatialIndex, minimapRightOffset, resolvedImageSrcMap, onRenderMetricsChange }: CanvasAreaProps) {
    const DRAG_START_THRESHOLD = 3;
    const MOVE_SNAP_THRESHOLD = 10;
    const RESIZE_SNAP_THRESHOLD = 10;
    const MOVE_SNAP_RELEASE_THRESHOLD = 18;
    const RESIZE_SNAP_RELEASE_THRESHOLD = 18;
    const MIN_SCALE = 0.05;
    const MAX_SCALE = 8;
    const MULTI_LAYOUT_GAP = 24;
    const ALIGN_GUIDE_FLASH_MS = 800;
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isPanning, _setIsPanning] = useState(false);
    const isPanningRef = useRef(false);
    const setIsPanning = useCallback((v: boolean) => { isPanningRef.current = v; _setIsPanning(v); }, []);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSelecting, _setIsSelecting] = useState(false);
    const isSelectingRef = useRef(false);
    const setIsSelecting = useCallback((value: boolean) => {
        isSelectingRef.current = value;
        _setIsSelecting(value);
    }, []);
    const [, setSelectionBoxState] = useState<SelectionBoxState | null>(null);
    const selectionBoxRef = useRef<SelectionBoxState | null>(null);
    const selectionBoxOverlayRef = useRef<HTMLDivElement | null>(null);
    const selectionDragCleanupRef = useRef<(() => void) | null>(null);
    const lastRenderMetricsRef = useRef<string>('');
    const setSelectionBox = useCallback((next: SelectionBoxState | null | ((prev: SelectionBoxState | null) => SelectionBoxState | null)) => {
        if (typeof next === 'function') {
            const updater = next as (prev: SelectionBoxState | null) => SelectionBoxState | null;
            const resolved = updater(selectionBoxRef.current);
            selectionBoxRef.current = resolved;
            setSelectionBoxState(resolved);
            return;
        }

        selectionBoxRef.current = next;
        setSelectionBoxState(next);
    }, []);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [editingMarkId, setEditingMarkId] = useState<string | null>(null);
    const [quickEditMarkId, setQuickEditMarkId] = useState<string | null>(null);
    const [quickEditPrompt, setQuickEditPrompt] = useState('');
    const [isFrameDrawing, setIsFrameDrawing] = useState(false);
    const highlightedElementIdSet = useMemo(() => new Set(highlightedElementIds), [highlightedElementIds]);
    const [frameDrawBox, setFrameDrawBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
    const [showFramePresetMenu, setShowFramePresetMenu] = useState<string | null>(null); // element id
    const [showFrameExportMenu, setShowFrameExportMenu] = useState<string | null>(null); // element id for export dropdown
    const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
    const [activeImagePreviewId, setActiveImagePreviewId] = useState<string | null>(null);
    const [dragPreviewState, setDragPreviewState] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
    const [currentPath, setCurrentPath] = useState<{ points: { x: number; y: number }[] } | null>(null);
    const [dropTargetFrameId, setDropTargetFrameId] = useState<string | null>(null);
    const [editingFrameName, setEditingFrameName] = useState<string | null>(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

    // Alignment guides state
    const [alignGuides, setAlignGuides] = useState<AlignGuide[]>([]);
    const alignGuidesRef = useRef<AlignGuide[]>([]);
    const alignGuidesTimeoutRef = useRef<number | null>(null);

    const areAlignGuidesEqual = useCallback((left: AlignGuide[], right: AlignGuide[]) => {
        if (left === right) return true;
        if (left.length !== right.length) return false;

        for (let i = 0; i < left.length; i += 1) {
            const a = left[i];
            const b = right[i];
            if (
                a.type !== b.type
                || !Object.is(a.pos, b.pos)
                || !Object.is(a.start, b.start)
                || !Object.is(a.end, b.end)
            ) {
                return false;
            }
        }

        return true;
    }, []);

    // Structural-equality guarded setter. High-frequency callers (drag/resize mousemove)
    // pass freshly constructed AlignGuide arrays on every tick; without this guard each
    // call forces a re-render that cascades through parent elements state and can trip
    // React's "Maximum update depth exceeded" safeguard.
    const setAlignGuidesIfChanged = useCallback((next: AlignGuide[]) => {
        if (areAlignGuidesEqual(alignGuidesRef.current, next)) {
            return;
        }

        alignGuidesRef.current = next;
        setAlignGuides(next);
    }, [areAlignGuidesEqual]);

    const flashAlignGuides = useCallback((guides: AlignGuide[]) => {
        setAlignGuidesIfChanged(guides);
        if (alignGuidesTimeoutRef.current !== null) {
            window.clearTimeout(alignGuidesTimeoutRef.current);
        }
        alignGuidesTimeoutRef.current = window.setTimeout(() => {
            setAlignGuidesIfChanged([]);
            alignGuidesTimeoutRef.current = null;
        }, ALIGN_GUIDE_FLASH_MS);
    }, [ALIGN_GUIDE_FLASH_MS, setAlignGuidesIfChanged]);

    useEffect(() => () => {
        if (alignGuidesTimeoutRef.current !== null) {
            window.clearTimeout(alignGuidesTimeoutRef.current);
        }
    }, []);

    const selectedRenderableElements = useMemo(() => {
        return elements.filter((element) => selectedIds.includes(element.id) && element.type !== 'connector');
    }, [elements, selectedIds]);

    const applyElementChanges = useCallback((changes: { id: string; attrs: Partial<CanvasElement> }[]) => {
        if (changes.length === 0) return;

        if (onBatchElementChange) {
            onBatchElementChange(changes);
            return;
        }

        changes.forEach((change) => onElementChange(change.id, change.attrs));
    }, [onBatchElementChange, onElementChange]);

    // ========== Alignment & Distribution Functions ==========
    // Get bounding box for selected elements
    const getSelectedBounds = useCallback(() => {
        return getElementsBounds(selectedRenderableElements);
    }, [selectedRenderableElements]);

    // Align selected elements
    const alignElements = useCallback((direction: AlignmentDirection) => {
        const { changes, guides } = computeAlignment(selectedRenderableElements, direction);
        if (changes.length > 0) applyElementChanges(changes);
        if (guides.length > 0) flashAlignGuides(guides);
    }, [selectedRenderableElements, applyElementChanges, flashAlignGuides]);

    // Distribute selected elements evenly
    const distributeElements = useCallback((axis: DistributionAxis) => {
        const { changes, guides } = computeDistribution(selectedRenderableElements, axis);
        if (changes.length > 0) applyElementChanges(changes);
        if (guides.length > 0) flashAlignGuides(guides);
    }, [selectedRenderableElements, applyElementChanges, flashAlignGuides]);

    // Equal spacing distribution - set equal gaps between elements
    const equalSpacing = useCallback((axis: DistributionAxis, spacing?: number) => {
        const changes = computeEqualSpacing(selectedRenderableElements, axis, spacing);
        if (changes.length > 0) applyElementChanges(changes);
    }, [selectedRenderableElements, applyElementChanges]);

    // Pending auto-layout: store frame IDs that need re-layout after state update
    const pendingAutoLayoutRef = useRef<Set<string>>(new Set());

    // Schedule an auto-layout for a frame (will run after next elements update via useEffect)
    const scheduleAutoLayout = useCallback((frameId: string) => {
        pendingAutoLayoutRef.current.add(frameId);
    }, []);

    // Auto-layout function: arrange all children within a frame using justified row layout
    // Preserves element aspect ratios; auto-resizes the frame to fit content
    // Helper: collect all descendant element IDs of a given frame (recursive)
    const getDescendantIds = useCallback((parentId: string): string[] => {
        return _getDescendantIds(parentId, elements);
    }, [elements]);

    const moveElementToFrame = useCallback((elementId: string, targetFrameId?: string) => {
        const element = elements.find(el => el.id === elementId);
        if (!element || element.type === 'connector') return;

        const nextFrameId = targetFrameId || undefined;
        if ((element.parentFrameId || undefined) === nextFrameId) {
            return;
        }

        if (nextFrameId) {
            const targetFrame = elements.find(el => el.id === nextFrameId && el.type === 'frame');
            if (!targetFrame || elementId === nextFrameId) {
                return;
            }

            const ownDescendants = element.type === 'frame'
                ? new Set(getDescendantIds(element.id))
                : new Set<string>();
            if (ownDescendants.has(nextFrameId)) {
                return;
            }

            onElementChange(elementId, { parentFrameId: nextFrameId });
            if (targetFrame.frameAutoLayout) {
                scheduleAutoLayout(targetFrame.id);
            }

            if (element.parentFrameId) {
                const oldFrame = elements.find(frame => frame.id === element.parentFrameId && frame.type === 'frame');
                if (oldFrame?.frameAutoLayout) {
                    scheduleAutoLayout(oldFrame.id);
                }
            }
            return;
        }

        const oldFrameId = element.parentFrameId;
        onElementChange(elementId, { parentFrameId: undefined });
        if (oldFrameId) {
            const oldFrame = elements.find(frame => frame.id === oldFrameId && frame.type === 'frame');
            if (oldFrame?.frameAutoLayout) {
                scheduleAutoLayout(oldFrameId);
            }
        }
    }, [elements, getDescendantIds, onElementChange, scheduleAutoLayout]);

    const autoLayoutFrame = useCallback((frameId: string) => {
        const frame = elements.find(e => e.id === frameId && e.type === 'frame');
        if (!frame) return;
        const children = elements.filter(c => c.parentFrameId === frameId && c.type !== 'connector');
        if (children.length === 0) return;

        const changes = computeFrameLayout(frame, children, elements);
        applyElementChanges(changes);
    }, [applyElementChanges, elements]);

    const layoutSelection = useCallback((mode: LayoutSelectionMode) => {
        const { changes, guides } = computeLayoutSelection(elements, selectedIds, mode, MULTI_LAYOUT_GAP);
        if (changes.length > 0) applyElementChanges(changes);
        if (guides.length > 0) flashAlignGuides(guides);
    }, [MULTI_LAYOUT_GAP, applyElementChanges, elements, selectedIds, flashAlignGuides]);

    // useEffect: run pending auto-layouts after elements state has updated
    useEffect(() => {
        if (pendingAutoLayoutRef.current.size > 0) {
            const frameIds = Array.from(pendingAutoLayoutRef.current);
            pendingAutoLayoutRef.current.clear();
            frameIds.forEach(fid => {
                const frame = elements.find(e => e.id === fid && e.type === 'frame' && e.frameAutoLayout);
                if (frame) {
                    autoLayoutFrame(fid);
                }
            });
        }
    }, [elements, autoLayoutFrame]);

    // Right-click context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number; targetElementId: string | null } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const [contextMenuAdjusted, setContextMenuAdjusted] = useState<{ x: number; y: number } | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    const dragStartRef = useRef<{ x: number; y: number; elementX: number; elementY: number; width: number; height: number; panX: number; panY: number; aspectRatio?: number; initialPositions?: { id: string, x: number, y: number }[] } | null>(null);
    const draggedElementIdRef = useRef<string | null>(null);
    const resizeHandleRef = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const outerRef = useRef<HTMLDivElement>(null);
    const elementsContainerRef = useRef<HTMLDivElement>(null);

    const addFrameAtPosition = useCallback((cx: number, cy: number, width: number = 400, height: number = 300) => {
        const frameId = uuidv4();
        const frameX = cx - Math.round(width / 2);
        const frameY = cy - Math.round(height / 2);
        const frame: CanvasElement = {
            id: frameId,
            type: 'frame',
            x: frameX,
            y: frameY,
            width,
            height,
            framePreset: 'Custom',
            frameBgColor: '#FFFFFF',
            frameClip: true,
            frameName: 'Frame',
        };
        onAddElement(frame);
        onSelect([frame.id]);
        elements.forEach(el => {
            if (el.type === 'connector') return;
            const elCenterX = el.x + (el.width || 0) / 2;
            const elCenterY = el.y + (el.height || 0) / 2;
            if (elCenterX >= frameX && elCenterX <= frameX + width &&
                elCenterY >= frameY && elCenterY <= frameY + height) {
                if (!el.parentFrameId) {
                    onElementChange(el.id, { parentFrameId: frameId });
                }
            }
        });
    }, [elements, onAddElement, onElementChange, onSelect]);

    useEffect(() => {
        const root = outerRef.current;
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
    }, [addFrameAtPosition, elements, moveElementToFrame, onElementChange, scheduleAutoLayout]);

    /**
     * CSS-transform drag bypass: during drag, we skip React state updates entirely
     * and directly manipulate DOM element positions via CSS translate() transforms.
     * The final positions are committed to React state once on mouseup.
     */
    const dragVisualDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
    const moveSnapLockRef = useRef<{
        x: { point: 'left' | 'center' | 'right'; target: number; guide: { type: 'v'; pos: number; start: number; end: number } } | null;
        y: { point: 'top' | 'center' | 'bottom'; target: number; guide: { type: 'h'; pos: number; start: number; end: number } } | null;
    }>({ x: null, y: null });
    const resizeSnapLockRef = useRef<{
        x: { edge: 'left' | 'right'; target: number; guide: { type: 'v'; pos: number; start: number; end: number } } | null;
        y: { edge: 'top' | 'bottom'; target: number; guide: { type: 'h'; pos: number; start: number; end: number } } | null;
    }>({ x: null, y: null });
    const handleMouseDownRef = useRef<(e: React.MouseEvent, elementId: string | null, elementX?: number, elementY?: number, width?: number, height?: number, options?: { fallbackSelectionId?: string }) => void>(() => {});
    const handleResizeStartRef = useRef<(e: React.MouseEvent, elementId: string, handle: string, element: CanvasElement) => void>(() => {});
    const processMouseMoveRef = useRef<(clientX: number, clientY: number, buttons: number, altKey: boolean, timeStamp?: number) => void>(() => {});
    const handleMouseUpRef = useRef<() => void>(() => {});
    const visibleElementsRef = useRef<CanvasElement[]>([]);

    // ── Inertia panning: silky momentum after drag release ──
    const panRef = useRef(pan);
    const committedPanRef = useRef(pan);
    const onPanChangeRef = useRef(onPanChange);
    const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
    const panVelocityPointsRef = useRef<{ x: number; y: number; t: number }[]>([]);
    const inertiaRafRef = useRef<number | null>(null);
    const panRafRef = useRef<number | null>(null);

    useEffect(() => {
        panRef.current = pan;
        committedPanRef.current = pan;
    }, [pan]);

    useEffect(() => {
        onPanChangeRef.current = onPanChange;
    }, [onPanChange]);

    const commitPanChange = useCallback((nextPan: { x: number; y: number }) => {
        const previousPan = committedPanRef.current;
        if (previousPan.x === nextPan.x && previousPan.y === nextPan.y) {
            return;
        }

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
        if (!nextPan) {
            return;
        }

        commitPanChange(nextPan);
    }, [commitPanChange]);

    const schedulePanChange = useCallback((nextPan: { x: number; y: number }) => {
        pendingPanRef.current = nextPan;
        if (panRafRef.current !== null) {
            return;
        }

        panRafRef.current = requestAnimationFrame(() => {
            panRafRef.current = null;
            const queuedPan = pendingPanRef.current;
            pendingPanRef.current = null;
            if (!queuedPan) {
                return;
            }

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

    // Clean up inertia on unmount
    useEffect(() => () => {
        if (inertiaRafRef.current !== null) cancelAnimationFrame(inertiaRafRef.current);
        if (panRafRef.current !== null) cancelAnimationFrame(panRafRef.current);
    }, []);

    useEffect(() => {
        const updateViewportSize = () => {
            const rect = outerRef.current?.getBoundingClientRect();
            if (!rect) return;
            setViewportSize((previous) => {
                if (previous.width === rect.width && previous.height === rect.height) {
                    return previous;
                }
                return { width: rect.width, height: rect.height };
            });
        };

        updateViewportSize();
        window.addEventListener('resize', updateViewportSize);

        const currentOuter = outerRef.current;
        const resizeObserver = typeof ResizeObserver === 'function' && currentOuter
            ? new ResizeObserver(() => updateViewportSize())
            : null;

        resizeObserver?.observe(currentOuter as Element);

        return () => {
            window.removeEventListener('resize', updateViewportSize);
            resizeObserver?.disconnect();
        };
    }, []);

    // Convert viewport mouse coordinates to canvas coordinates using the outer container
    const toCanvasPoint = useCallback((clientX: number, clientY: number) => {
        const rect = outerRef.current?.getBoundingClientRect();
        const offsetX = rect ? clientX - rect.left : clientX;
        const offsetY = rect ? clientY - rect.top : clientY;
        return {
            x: (offsetX - pan.x) / scale,
            y: (offsetY - pan.y) / scale,
        };
    }, [pan.x, pan.y, scale]);

    const toCanvasCoords = (e: { clientX: number; clientY: number }) => toCanvasPoint(e.clientX, e.clientY);

    const syncSelectionBoxOverlay = useCallback((box: SelectionBoxState | null) => {
        const overlay = selectionBoxOverlayRef.current;
        if (!overlay) return;

        if (!box) {
            overlay.style.display = 'none';
            return;
        }

        const left = Math.min(box.startX, box.currentX) * scale + pan.x;
        const top = Math.min(box.startY, box.currentY) * scale + pan.y;
        const width = Math.abs(box.currentX - box.startX) * scale;
        const height = Math.abs(box.currentY - box.startY) * scale;

        overlay.style.display = 'block';
        overlay.style.left = `${left}px`;
        overlay.style.top = `${top}px`;
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;
    }, [pan.x, pan.y, scale]);

    const updateSelectionBoxFromClient = useCallback((clientX: number, clientY: number) => {
        const activeSelectionBox = selectionBoxRef.current;
        if (!activeSelectionBox) return;

        const { x: canvasX, y: canvasY } = toCanvasPoint(clientX, clientY);
        const nextSelectionBox = {
            ...activeSelectionBox,
            currentX: canvasX,
            currentY: canvasY,
        };
        selectionBoxRef.current = nextSelectionBox;
        setSelectionBox(nextSelectionBox);
        syncSelectionBoxOverlay(nextSelectionBox);
    }, [setSelectionBox, syncSelectionBoxOverlay, toCanvasPoint]);

    const stopSelectionDragListeners = useCallback(() => {
        selectionDragCleanupRef.current?.();
        selectionDragCleanupRef.current = null;
    }, []);

    const startSelectionDragListeners = useCallback(() => {
        stopSelectionDragListeners();

        const handleNativeMove = (event: MouseEvent | PointerEvent) => {
            if ((event.buttons & 1) !== 1) {
                handleMouseUpRef.current();
                return;
            }

            updateSelectionBoxFromClient(event.clientX, event.clientY);
        };

        const handleNativeUp = () => {
            handleMouseUpRef.current();
        };

        window.addEventListener('mousemove', handleNativeMove, true);
        window.addEventListener('pointermove', handleNativeMove, true);
        window.addEventListener('mouseup', handleNativeUp, true);
        window.addEventListener('pointerup', handleNativeUp, true);

        selectionDragCleanupRef.current = () => {
            window.removeEventListener('mousemove', handleNativeMove, true);
            window.removeEventListener('pointermove', handleNativeMove, true);
            window.removeEventListener('mouseup', handleNativeUp, true);
            window.removeEventListener('pointerup', handleNativeUp, true);
        };
    }, [stopSelectionDragListeners, updateSelectionBoxFromClient]);

    const isElementLocked = useCallback((element?: CanvasElement | null) => {
        if (!element) return false;
        return !!(element.locked || (element.type === 'frame' && element.frameLocked));
    }, []);

    const getTopElementAtPoint = useCallback((x: number, y: number) => {
        const containsPoint = (el: CanvasElement) => {
            if (el.hidden || el.type === 'connector') return false;
            const width = el.width ?? (el.type === 'text' ? 200 : el.type === 'mark' ? 32 : 0);
            const height = el.height ?? (el.type === 'text' ? 40 : el.type === 'mark' ? 32 : 0);
            return x >= el.x && x <= el.x + width && y >= el.y && y <= el.y + height;
        };

        for (let i = elements.length - 1; i >= 0; i -= 1) {
            const element = elements[i];
            if (element.type !== 'frame' && containsPoint(element)) {
                return element;
            }
        }

        for (let i = elements.length - 1; i >= 0; i -= 1) {
            const element = elements[i];
            if (element.type === 'frame' && containsPoint(element)) {
                return element;
            }
        }

        return null;
    }, [elements]);

    const shouldIncludeInBoxSelection = useCallback((el: CanvasElement, x1: number, y1: number, x2: number, y2: number) => {
        if (el.type === 'connector' || el.hidden) return false;

        const elRight = el.x + (el.width || 0);
        const elBottom = el.y + (el.height || 0);

        if (el.type === 'frame') {
            return el.x >= x1 && elRight <= x2 && el.y >= y1 && elBottom <= y2;
        }

        return (
            el.x < x2 &&
            elRight > x1 &&
            el.y < y2 &&
            elBottom > y1
        );
    }, []);

    // Burn mark annotations onto target image using Canvas API
    const burnMarksOntoImage = useCallback(async (targetElement: CanvasElement, markElements: CanvasElement[]): Promise<string> => {
        if (!targetElement.content) throw new Error('No image content');
        // Resolve image ref to data URL if needed
        const imgSrc = await (isImageRef(targetElement.content)
            ? getImageDataUrl(targetElement.content)
            : Promise.resolve(targetElement.content));
        if (!imgSrc) throw new Error('Failed to resolve image content');

        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject('No canvas context'); return; }
                ctx.drawImage(img, 0, 0);

                const scaleX = img.naturalWidth / (targetElement.width || img.naturalWidth);
                const scaleY = img.naturalHeight / (targetElement.height || img.naturalHeight);

                for (const mark of markElements) {
                    // Mark center position relative to target element
                    const markCenterX = (mark.x + 16 - targetElement.x) * scaleX;
                    const markCenterY = (mark.y + 30 - targetElement.y) * scaleY;
                    const pinSize = 24 * Math.max(scaleX, scaleY);

                    // Draw pin circle
                    ctx.beginPath();
                    ctx.arc(markCenterX, markCenterY - pinSize * 0.6, pinSize * 0.4, 0, Math.PI * 2);
                    ctx.fillStyle = mark.color || '#EF4444';
                    ctx.fill();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2 * Math.max(scaleX, scaleY);
                    ctx.stroke();

                    // Draw pin tip
                    ctx.beginPath();
                    ctx.moveTo(markCenterX - pinSize * 0.25, markCenterY - pinSize * 0.4);
                    ctx.lineTo(markCenterX, markCenterY);
                    ctx.lineTo(markCenterX + pinSize * 0.25, markCenterY - pinSize * 0.4);
                    ctx.fillStyle = mark.color || '#EF4444';
                    ctx.fill();

                    // Draw number
                    const num = String(mark.markNumber || '?');
                    ctx.font = `bold ${pinSize * 0.35}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'white';
                    ctx.fillText(num, markCenterX, markCenterY - pinSize * 0.6);

                    // Draw mark text label if exists
                    if (mark.markText) {
                        const labelFontSize = pinSize * 0.3;
                        ctx.font = `${labelFontSize}px sans-serif`;
                        const textWidth = ctx.measureText(mark.markText).width;
                        const labelPadding = labelFontSize * 0.5;
                        ctx.fillStyle = 'rgba(0,0,0,0.75)';
                        ctx.beginPath();
                        const rx = markCenterX - textWidth / 2 - labelPadding;
                        const ry = markCenterY + pinSize * 0.15;
                        const rw = textWidth + labelPadding * 2;
                        const rh = labelFontSize + labelPadding;
                        ctx.roundRect(rx, ry, rw, rh, 4);
                        ctx.fill();
                        ctx.fillStyle = 'white';
                        ctx.fillText(mark.markText, markCenterX, ry + rh / 2);
                    }
                }
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => reject('Failed to load image');
            img.src = imgSrc;
        });
    }, []);

    // Handle quick edit submission — burn marks onto image, then call AI edit
    const handleQuickEditSubmit = useCallback(async (markEl: CanvasElement) => {
        if (!quickEditPrompt.trim()) return;
        const targetEl = markEl.markTargetId ? elements.find(t => t.id === markEl.markTargetId) : undefined;
        if (!targetEl || !targetEl.content) return;

        const prompt = quickEditPrompt.trim();
        setQuickEditPrompt('');
        setQuickEditMarkId(null);

        try {
            // Get all marks on this target image
            const marksOnTarget = elements.filter(el => el.type === 'mark' && el.markTargetId === targetEl.id);
            const annotatedImage = await burnMarksOntoImage(targetEl, marksOnTarget);
            // Call AI edit on the target image with the annotated reference
            onAiEditElement?.(
                { ...targetEl, content: annotatedImage },
                `参考标注图上标记#${markEl.markNumber}${markEl.markText ? `(${markEl.markText})` : ''}的位置，${prompt}`
            );
        } catch (err) {
            console.error('Failed to burn marks onto image:', err);
            // Fallback: just use original image
            onAiEditElement?.(targetEl, prompt);
        }
    }, [quickEditPrompt, elements, burnMarksOntoImage, onAiEditElement]);

    const handleMouseDown = (
        e: React.MouseEvent,
        elementId: string | null,
        elementX: number = 0,
        elementY: number = 0,
        width: number = 0,
        height: number = 0,
        options?: { fallbackSelectionId?: string },
    ) => {
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
                panY: pan.y
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
                panY: pan.y
            };
            return;
        }

        if (activeTool === 'frame') {
            // Start drawing a frame
            const { x: canvasX, y: canvasY } = toCanvasCoords(e);
            setIsFrameDrawing(true);
            setFrameDrawBox({ startX: canvasX, startY: canvasY, currentX: canvasX, currentY: canvasY });
            return;
        }

        if (activeTool === 'mark') {
            // Place a mark at the clicked canvas position (even on top of existing elements)
            const { x: canvasX, y: canvasY } = toCanvasCoords(e);
            const existingMarks = elements.filter(el => el.type === 'mark');
            const markNumber = existingMarks.length > 0 ? Math.max(...existingMarks.map(m => m.markNumber || 0)) + 1 : 1;
            // Detect if mark is placed on top of an image/video element
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
            // Auto-open quick edit if placed on an image
            if (targetElement) {
                setQuickEditMarkId(newMark.id);
                setQuickEditPrompt('');
            }
            return;
        }

        if (activeTool === 'draw') {
            setIsDrawing(true);
            const { x: canvasX, y: canvasY } = toCanvasCoords(e);
            setCurrentPath({ points: [{ x: canvasX, y: canvasY }] });
            return;
        }

        if (!elementId) {
            // Clicked on empty space
            const additiveSelection = e.shiftKey || e.ctrlKey || e.metaKey;
            setActiveVideoId(null);
            // Start selection box
            const { x: canvasX, y: canvasY } = toCanvasCoords(e);
            const nextSelectionBox: SelectionBoxState = {
                startX: canvasX,
                startY: canvasY,
                currentX: canvasX,
                currentY: canvasY,
                mode: additiveSelection ? 'add' : 'replace',
                fallbackSelectionId: options?.fallbackSelectionId,
            };
            setIsSelecting(true);
            setSelectionBox(nextSelectionBox);
            syncSelectionBoxOverlay(nextSelectionBox);
            startSelectionDragListeners();
            setEditingTextId(null);
            return;
        }

        e.stopPropagation();

        // Exit video play mode when clicking a different element
        if (activeVideoId && activeVideoId !== elementId) {
            setActiveVideoId(null);
        }

        let dragSelectedIds = selectedIds;

        // Handle Selection Logic
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

        // Store initial positions of ALL selected elements for group dragging
        // Recursively include all descendants of selected frames (handles nested frames)
        const frameChildIds = new Set<string>();
        const collectDescendants = (parentId: string) => {
            elements.forEach(child => {
                if (child.parentFrameId === parentId && !dragSelectedIds.includes(child.id) && !frameChildIds.has(child.id)) {
                    frameChildIds.add(child.id);
                    // If this child is also a frame, collect its descendants too
                    if (child.type === 'frame') {
                        collectDescendants(child.id);
                    }
                }
            });
        };
        dragSelectedIds.forEach(selId => {
            const el = elements.find(e => e.id === selId);
            if (el?.type === 'frame') {
                collectDescendants(selId);
            }
        });
        const allDragIds = [...new Set([...dragSelectedIds, ...frameChildIds])];
        const initialPositions = elements.filter(el => allDragIds.includes(el.id)).map(el => ({
            id: el.id,
            x: el.x,
            y: el.y
        }));

        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            elementX,
            elementY,
            width: width || 0,
            height: height || 0,
            panX: 0,
            panY: 0,
            aspectRatio: (width && height) ? width / height : undefined,
            initialPositions
        };
    };

    const handleResizeStart = (e: React.MouseEvent, elementId: string, handle: string, element: CanvasElement) => {
        e.stopPropagation();
        startResizeInteraction(elementId, handle, element, e.clientX, e.clientY);
    };

    const startResizeInteraction = useCallback((elementId: string, handle: string, element: CanvasElement, clientX: number, clientY: number) => {
        if (isElementLocked(element)) return;
        setIsResizing(true);
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
            aspectRatio: (element.width || 1) / (element.height || 1)
        };
    }, [isElementLocked]);

    const handleScreenSpaceResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>, handle: string, element: CanvasElement) => {
        event.stopPropagation();
        startResizeInteraction(element.id, handle, element, event.clientX, event.clientY);
    }, [startResizeInteraction]);

    function processMouseMove(clientX: number, clientY: number, buttons: number, altKey: boolean, timeStamp?: number) {
        const { x: canvasX, y: canvasY } = toCanvasPoint(clientX, clientY);
        const snapDisabled = altKey;

        // Report mouse canvas position to parent
        onCanvasMouseMove?.(canvasX, canvasY);

        if ((isDragging || isResizing) && (buttons & 1) !== 1) {
            handleMouseUp();
            return;
        }
        // For panning, allow both left button (hand tool) and middle button
        if (isPanning && (buttons & 1) === 0 && (buttons & 4) === 0) {
            handleMouseUp();
            return;
        }

        if (isFrameDrawing && frameDrawBox) {
            setFrameDrawBox(prev => prev ? { ...prev, currentX: canvasX, currentY: canvasY } : null);
            return;
        }

        if (isDrawing && currentPath) {
            setCurrentPath(prev => prev ? {
                points: [...prev.points, { x: canvasX, y: canvasY }]
            } : null);
            return;
        }

        const activeSelectionBox = selectionBoxRef.current;
        if (isSelectingRef.current && activeSelectionBox) {
            const nextSelectionBox = {
                ...activeSelectionBox,
                currentX: canvasX,
                currentY: canvasY,
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            syncSelectionBoxOverlay(nextSelectionBox);
            return;
        }

        if (!dragStartRef.current) return;

        if (isPanning || isPanningRef.current) {
            const dx = clientX - dragStartRef.current.x;
            const dy = clientY - dragStartRef.current.y;
            schedulePanChange({
                x: dragStartRef.current.panX + dx,
                y: dragStartRef.current.panY + dy
            });
            // Track velocity points for inertia
            const now = timeStamp ?? 0;
            const pts = panVelocityPointsRef.current;
            pts.push({ x: clientX, y: clientY, t: now });
            if (pts.length > 6) pts.shift();
            return;
        }

        if (!draggedElementIdRef.current) return;

        const dx = (clientX - dragStartRef.current.x) / scale;
        const dy = (clientY - dragStartRef.current.y) / scale;

        let effectiveIsDragging = isDragging;
        if (!effectiveIsDragging && dragStartRef.current.initialPositions) {
            const movedX = Math.abs(clientX - dragStartRef.current.x);
            const movedY = Math.abs(clientY - dragStartRef.current.y);

            if (Math.max(movedX, movedY) < DRAG_START_THRESHOLD) {
                return;
            }

            setIsDragging(true);
            onDragStart?.();
            effectiveIsDragging = true;
        }

        if (effectiveIsDragging && dragStartRef.current.initialPositions) {
            // Snap alignment: find the dragged element's bounding box
            const draggedId = draggedElementIdRef.current;
            const draggedInitial = dragStartRef.current.initialPositions.find(p => p.id === draggedId);
            const snapDraggedEl = elements.find(e => e.id === draggedId);
            const draggedIdsSet = new Set(dragStartRef.current.initialPositions.map(p => p.id));

            let snapDx = 0;
            let snapDy = 0;
            const newGuides: { type: 'h' | 'v'; pos: number; start: number; end: number }[] = [];
            const SNAP_THRESHOLD = MOVE_SNAP_THRESHOLD;

            if (snapDraggedEl && draggedInitial) {
                const dw = snapDraggedEl.width || 0;
                const dh = snapDraggedEl.height || 0;
                const dRawX = draggedInitial.x + dx;
                const dRawY = draggedInitial.y + dy;

                // Dragged element snap points
                const dLeft = dRawX;
                const dCenterX = dRawX + dw / 2;
                const dRight = dRawX + dw;
                const dTop = dRawY;
                const dCenterY = dRawY + dh / 2;
                const dBottom = dRawY + dh;

                const otherEls = visibleElementsRef.current.filter(e =>
                    !draggedIdsSet.has(e.id) &&
                    e.type !== 'connector'
                );

                let bestSnapX: { delta: number; target: number; point: 'left' | 'center' | 'right'; guide: { type: 'v'; pos: number; start: number; end: number } | null } = { delta: 0, target: 0, point: 'left', guide: null };
                let bestSnapXDist = SNAP_THRESHOLD + 1;
                let bestSnapY: { delta: number; target: number; point: 'top' | 'center' | 'bottom'; guide: { type: 'h'; pos: number; start: number; end: number } | null } = { delta: 0, target: 0, point: 'top', guide: null };
                let bestSnapYDist = SNAP_THRESHOLD + 1;

                otherEls.forEach(other => {
                    const ow = other.width || 0;
                    const oh = other.height || 0;
                    const oLeft = other.x;
                    const oCenterX = other.x + ow / 2;
                    const oRight = other.x + ow;
                    const oTop = other.y;
                    const oCenterY = other.y + oh / 2;
                    const oBottom = other.y + oh;

                    // Vertical alignment checks (X axis snapping)
                    const xPairs: Array<{ point: 'left' | 'center' | 'right'; d: number; o: number }> = [
                        { point: 'left', d: dLeft, o: oLeft },
                        { point: 'left', d: dLeft, o: oCenterX },
                        { point: 'left', d: dLeft, o: oRight },
                        { point: 'center', d: dCenterX, o: oLeft },
                        { point: 'center', d: dCenterX, o: oCenterX },
                        { point: 'center', d: dCenterX, o: oRight },
                        { point: 'right', d: dRight, o: oLeft },
                        { point: 'right', d: dRight, o: oCenterX },
                        { point: 'right', d: dRight, o: oRight },
                    ];
                    xPairs.forEach(({ point, d, o }) => {
                        const dist = Math.abs(d - o);
                        if (dist <= SNAP_THRESHOLD) {
                            const minY = Math.min(dRawY, oTop);
                            const maxY = Math.max(dRawY + dh, oBottom);
                            if (dist < bestSnapXDist) {
                                bestSnapXDist = dist;
                                bestSnapX = {
                                    delta: o - d,
                                    target: o,
                                    point,
                                    guide: { type: 'v', pos: o, start: minY, end: maxY },
                                };
                            }
                        }
                    });

                    // Horizontal alignment checks (Y axis snapping)
                    const yPairs: Array<{ point: 'top' | 'center' | 'bottom'; d: number; o: number }> = [
                        { point: 'top', d: dTop, o: oTop },
                        { point: 'top', d: dTop, o: oCenterY },
                        { point: 'top', d: dTop, o: oBottom },
                        { point: 'center', d: dCenterY, o: oTop },
                        { point: 'center', d: dCenterY, o: oCenterY },
                        { point: 'center', d: dCenterY, o: oBottom },
                        { point: 'bottom', d: dBottom, o: oTop },
                        { point: 'bottom', d: dBottom, o: oCenterY },
                        { point: 'bottom', d: dBottom, o: oBottom },
                    ];
                    yPairs.forEach(({ point, d, o }) => {
                        const dist = Math.abs(d - o);
                        if (dist <= SNAP_THRESHOLD) {
                            const minX = Math.min(dRawX, oLeft);
                            const maxX = Math.max(dRawX + dw, oRight);
                            if (dist < bestSnapYDist) {
                                bestSnapYDist = dist;
                                bestSnapY = {
                                    delta: o - d,
                                    target: o,
                                    point,
                                    guide: { type: 'h', pos: o, start: minX, end: maxX },
                                };
                            }
                        }
                    });
                });

                if (snapDisabled) {
                    moveSnapLockRef.current = { x: null, y: null };
                } else {
                    const lockedX = moveSnapLockRef.current.x;
                    if (lockedX) {
                        const lockedPoint = lockedX.point === 'left' ? dLeft : lockedX.point === 'center' ? dCenterX : dRight;
                        if (Math.abs(lockedPoint - lockedX.target) <= MOVE_SNAP_RELEASE_THRESHOLD) {
                            snapDx = lockedX.target - lockedPoint;
                            newGuides.push(lockedX.guide);
                        } else {
                            moveSnapLockRef.current.x = null;
                        }
                    }
                    if (!moveSnapLockRef.current.x && bestSnapXDist <= SNAP_THRESHOLD) {
                        snapDx = bestSnapX.delta;
                        if (bestSnapX.guide) {
                            newGuides.push(bestSnapX.guide);
                            moveSnapLockRef.current.x = {
                                point: bestSnapX.point,
                                target: bestSnapX.target,
                                guide: bestSnapX.guide,
                            };
                        }
                    }

                    const lockedY = moveSnapLockRef.current.y;
                    if (lockedY) {
                        const lockedPoint = lockedY.point === 'top' ? dTop : lockedY.point === 'center' ? dCenterY : dBottom;
                        if (Math.abs(lockedPoint - lockedY.target) <= MOVE_SNAP_RELEASE_THRESHOLD) {
                            snapDy = lockedY.target - lockedPoint;
                            newGuides.push(lockedY.guide);
                        } else {
                            moveSnapLockRef.current.y = null;
                        }
                    }
                    if (!moveSnapLockRef.current.y && bestSnapYDist <= SNAP_THRESHOLD) {
                        snapDy = bestSnapY.delta;
                        if (bestSnapY.guide) {
                            newGuides.push(bestSnapY.guide);
                            moveSnapLockRef.current.y = {
                                point: bestSnapY.point,
                                target: bestSnapY.target,
                                guide: bestSnapY.guide,
                            };
                        }
                    }

                    if (bestSnapXDist > SNAP_THRESHOLD && !newGuides.some(guide => guide.type === 'v')) {
                        moveSnapLockRef.current.x = null;
                    }
                    if (bestSnapYDist > SNAP_THRESHOLD && !newGuides.some(guide => guide.type === 'h')) {
                        moveSnapLockRef.current.y = null;
                    }
                }

                // Smart spacing guides: detect equal gaps between elements
                // After alignment snap applied, check if dragged element creates equal spacing
                const finalDragX = dRawX + snapDx;
                const finalDragY = dRawY + snapDy;
                const finalDragRight = finalDragX + dw;
                const finalDragBottom = finalDragY + dh;

                // Collect all non-dragged elements sorted by position
                const hSorted = [...otherEls].sort((a, b) => a.x - b.x);
                const vSorted = [...otherEls].sort((a, b) => a.y - b.y);

                // Check horizontal equal spacing
                for (let j = 0; j < hSorted.length - 1; j++) {
                    const a = hSorted[j];
                    const b = hSorted[j + 1];
                    const gapAB = b.x - (a.x + (a.width || 0));
                    if (gapAB <= 0) continue;

                    // Check if dragged element has the same gap from a (to the left of a)
                    const gapDragToA = a.x - finalDragRight;
                    if (Math.abs(gapDragToA - gapAB) <= SNAP_THRESHOLD && gapDragToA > 0) {
                        const snapAdj = gapDragToA - gapAB;
                        if (Math.abs(snapAdj) < Math.abs(snapDx) || bestSnapXDist > SNAP_THRESHOLD) {
                            // Show equal spacing indicators
                            newGuides.push({ type: 'h', pos: (finalDragY + finalDragBottom) / 2, start: finalDragRight, end: a.x });
                            newGuides.push({ type: 'h', pos: (a.y + a.y + (a.height || 0)) / 2, start: a.x + (a.width || 0), end: b.x });
                        }
                    }

                    // Check if dragged element has the same gap to the right of b
                    const gapBToDrag = finalDragX - (b.x + (b.width || 0));
                    if (Math.abs(gapBToDrag - gapAB) <= SNAP_THRESHOLD && gapBToDrag > 0) {
                        newGuides.push({ type: 'h', pos: (a.y + a.y + (a.height || 0)) / 2, start: a.x + (a.width || 0), end: b.x });
                        newGuides.push({ type: 'h', pos: (finalDragY + finalDragBottom) / 2, start: b.x + (b.width || 0), end: finalDragX });
                    }
                }

                // Check vertical equal spacing
                for (let j = 0; j < vSorted.length - 1; j++) {
                    const a = vSorted[j];
                    const b = vSorted[j + 1];
                    const gapAB = b.y - (a.y + (a.height || 0));
                    if (gapAB <= 0) continue;

                    const gapDragToA = a.y - finalDragBottom;
                    if (Math.abs(gapDragToA - gapAB) <= SNAP_THRESHOLD && gapDragToA > 0) {
                        newGuides.push({ type: 'v', pos: (finalDragX + finalDragRight) / 2, start: finalDragBottom, end: a.y });
                        newGuides.push({ type: 'v', pos: (a.x + a.x + (a.width || 0)) / 2, start: a.y + (a.height || 0), end: b.y });
                    }

                    const gapBToDrag = finalDragY - (b.y + (b.height || 0));
                    if (Math.abs(gapBToDrag - gapAB) <= SNAP_THRESHOLD && gapBToDrag > 0) {
                        newGuides.push({ type: 'v', pos: (a.x + a.x + (a.width || 0)) / 2, start: a.y + (a.height || 0), end: b.y });
                        newGuides.push({ type: 'v', pos: (finalDragX + finalDragRight) / 2, start: b.y + (b.height || 0), end: finalDragY });
                    }
                }
            }

            // ── React-driven drag preview ──
            const finalSnapDx = snapDx;
            const finalSnapDy = snapDy;
            dragVisualDeltaRef.current = { dx: dx + finalSnapDx, dy: dy + finalSnapDy };
            setDragPreviewState((prev) => {
                const nextIds = dragStartRef.current?.initialPositions?.map((pos) => pos.id) ?? [];
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

                return {
                    ids: nextIds,
                    dx: nextDx,
                    dy: nextDy,
                };
            });

            setAlignGuidesIfChanged(newGuides);

            // Detect drop target frame for visual highlight
            const draggedEl = elements.find(e => e.id === draggedElementIdRef.current);
            if (draggedEl) {
                // Collect all descendant IDs of dragged element (to prevent dropping into own children)
                const draggedDescendants = new Set<string>();
                if (draggedEl.type === 'frame') {
                    const collectDesc = (pid: string) => {
                        elements.forEach(c => {
                            if (c.parentFrameId === pid && !draggedDescendants.has(c.id)) {
                                draggedDescendants.add(c.id);
                                if (c.type === 'frame') collectDesc(c.id);
                            }
                        });
                    };
                    collectDesc(draggedEl.id);
                }
                // Find the innermost (smallest area) frame that contains the cursor
                const candidateFrames = elements.filter(frame =>
                    frame.type === 'frame' &&
                    frame.id !== draggedEl.id &&
                    frame.id !== draggedEl.parentFrameId &&
                    !draggedDescendants.has(frame.id) &&
                    canvasX >= frame.x &&
                    canvasX <= frame.x + (frame.width || 0) &&
                    canvasY >= frame.y &&
                    canvasY <= frame.y + (frame.height || 0)
                );
                // Prefer the smallest (innermost) frame
                const targetFrame = candidateFrames.length > 0
                    ? candidateFrames.reduce((best, f) => {
                        const area = (f.width || 0) * (f.height || 0);
                        const bestArea = (best.width || 0) * (best.height || 0);
                        return area < bestArea ? f : best;
                    })
                    : null;
                setDropTargetFrameId(targetFrame?.id || null);
            } else {
                setDropTargetFrameId(null);
            }
        } else if (isResizing && resizeHandleRef.current) {
            // ... (Resize logic remains mostly same, maybe only resize primary selected element for now)
            const { elementX, elementY, width, height, aspectRatio } = dragStartRef.current;
            const element = elements.find(el => el.id === draggedElementIdRef.current);
            const isImage = element?.type === 'image';
            const resizeHandle = resizeHandleRef.current;

            let newX = elementX;
            let newY = elementY;
            let newWidth = width;
            let newHeight = height;

            if (resizeHandle.includes('e')) newWidth = width + dx;
            if (resizeHandle.includes('s')) newHeight = height + dy;
            if (resizeHandle.includes('w')) {
                newWidth = width - dx;
                newX = elementX + dx;
            }
            if (resizeHandle.includes('n')) {
                newHeight = height - dy;
                newY = elementY + dy;
            }

            // Enforce aspect ratio for images
            if (isImage && aspectRatio) {
                if (resizeHandle.includes('e') || resizeHandle.includes('w')) {
                    newHeight = newWidth / aspectRatio;
                    if (resizeHandle.includes('n')) {
                        newY = elementY + (height - newHeight);
                    }
                } else if (resizeHandle.includes('n') || resizeHandle.includes('s')) {
                    newWidth = newHeight * aspectRatio;
                    if (resizeHandle.includes('w')) {
                        newX = elementX + (width - newWidth);
                    }
                    if (resizeHandle === 'n') {
                        newY = elementY + (height - newHeight);
                    }
                }
            }

            newWidth = Math.max(10, newWidth);
            newHeight = Math.max(10, newHeight);

            const resizeGuides: { type: 'h' | 'v'; pos: number; start: number; end: number }[] = [];
            const SNAP_THRESHOLD = RESIZE_SNAP_THRESHOLD;
            const activeLeft = resizeHandle.includes('w');
            const activeRight = resizeHandle.includes('e');
            const activeTop = resizeHandle.includes('n');
            const activeBottom = resizeHandle.includes('s');

            const tentativeLeft = newX;
            const tentativeRight = newX + newWidth;
            const tentativeTop = newY;
            const tentativeBottom = newY + newHeight;

            const resizeTargets = visibleElementsRef.current.filter(other =>
                other.id !== draggedElementIdRef.current &&
                other.type !== 'connector'
            );

            let bestSnapX: { dist: number; delta: number; target: number; edge: 'left' | 'right'; guide: { type: 'v'; pos: number; start: number; end: number } | null } = {
                dist: SNAP_THRESHOLD + 1,
                delta: 0,
                target: 0,
                edge: activeLeft ? 'left' : 'right',
                guide: null,
            };
            let bestSnapY: { dist: number; delta: number; target: number; edge: 'top' | 'bottom'; guide: { type: 'h'; pos: number; start: number; end: number } | null } = {
                dist: SNAP_THRESHOLD + 1,
                delta: 0,
                target: 0,
                edge: activeTop ? 'top' : 'bottom',
                guide: null,
            };

            resizeTargets.forEach(other => {
                const otherWidth = other.width || 0;
                const otherHeight = other.height || 0;
                const otherLeft = other.x;
                const otherRight = other.x + otherWidth;
                const otherTop = other.y;
                const otherBottom = other.y + otherHeight;
                const otherCenterX = other.x + otherWidth / 2;
                const otherCenterY = other.y + otherHeight / 2;

                const xTargets = [otherLeft, otherCenterX, otherRight];
                const yTargets = [otherTop, otherCenterY, otherBottom];

                if (activeLeft || activeRight) {
                    const movingX = activeLeft ? tentativeLeft : tentativeRight;
                    xTargets.forEach(targetX => {
                        const dist = Math.abs(movingX - targetX);
                        if (dist < bestSnapX.dist) {
                            bestSnapX = {
                                dist,
                                delta: targetX - movingX,
                                target: targetX,
                                edge: activeLeft ? 'left' : 'right',
                                guide: {
                                    type: 'v',
                                    pos: targetX,
                                    start: Math.min(tentativeTop, otherTop),
                                    end: Math.max(tentativeBottom, otherBottom),
                                },
                            };
                        }
                    });
                }

                if (activeTop || activeBottom) {
                    const movingY = activeTop ? tentativeTop : tentativeBottom;
                    yTargets.forEach(targetY => {
                        const dist = Math.abs(movingY - targetY);
                        if (dist < bestSnapY.dist) {
                            bestSnapY = {
                                dist,
                                delta: targetY - movingY,
                                target: targetY,
                                edge: activeTop ? 'top' : 'bottom',
                                guide: {
                                    type: 'h',
                                    pos: targetY,
                                    start: Math.min(tentativeLeft, otherLeft),
                                    end: Math.max(tentativeRight, otherRight),
                                },
                            };
                        }
                    });
                }
            });

            if (snapDisabled) {
                resizeSnapLockRef.current = { x: null, y: null };
            } else {
                const lockedResizeX = resizeSnapLockRef.current.x;
                if (lockedResizeX) {
                    const movingX = lockedResizeX.edge === 'left' ? tentativeLeft : tentativeRight;
                    if (Math.abs(movingX - lockedResizeX.target) <= RESIZE_SNAP_RELEASE_THRESHOLD) {
                        const lockedDelta = lockedResizeX.target - movingX;
                        if (lockedResizeX.edge === 'left') {
                            newX += lockedDelta;
                            newWidth -= lockedDelta;
                        } else {
                            newWidth += lockedDelta;
                        }
                        resizeGuides.push(lockedResizeX.guide);
                    } else {
                        resizeSnapLockRef.current.x = null;
                    }
                }

                if (!resizeSnapLockRef.current.x && bestSnapX.dist <= SNAP_THRESHOLD) {
                    if (activeLeft) {
                        newX += bestSnapX.delta;
                        newWidth -= bestSnapX.delta;
                    } else if (activeRight) {
                        newWidth += bestSnapX.delta;
                    }
                    if (bestSnapX.guide) {
                        resizeGuides.push(bestSnapX.guide);
                        resizeSnapLockRef.current.x = {
                            edge: bestSnapX.edge,
                            target: bestSnapX.target,
                            guide: bestSnapX.guide,
                        };
                    }
                }

                const lockedResizeY = resizeSnapLockRef.current.y;
                if (lockedResizeY) {
                    const movingY = lockedResizeY.edge === 'top' ? tentativeTop : tentativeBottom;
                    if (Math.abs(movingY - lockedResizeY.target) <= RESIZE_SNAP_RELEASE_THRESHOLD) {
                        const lockedDelta = lockedResizeY.target - movingY;
                        if (lockedResizeY.edge === 'top') {
                            newY += lockedDelta;
                            newHeight -= lockedDelta;
                        } else {
                            newHeight += lockedDelta;
                        }
                        resizeGuides.push(lockedResizeY.guide);
                    } else {
                        resizeSnapLockRef.current.y = null;
                    }
                }

                if (!resizeSnapLockRef.current.y && bestSnapY.dist <= SNAP_THRESHOLD) {
                    if (activeTop) {
                        newY += bestSnapY.delta;
                        newHeight -= bestSnapY.delta;
                    } else if (activeBottom) {
                        newHeight += bestSnapY.delta;
                    }
                    if (bestSnapY.guide) {
                        resizeGuides.push(bestSnapY.guide);
                        resizeSnapLockRef.current.y = {
                            edge: bestSnapY.edge,
                            target: bestSnapY.target,
                            guide: bestSnapY.guide,
                        };
                    }
                }

                if (bestSnapX.dist > SNAP_THRESHOLD && !resizeGuides.some(guide => guide.type === 'v')) {
                    resizeSnapLockRef.current.x = null;
                }
                if (bestSnapY.dist > SNAP_THRESHOLD && !resizeGuides.some(guide => guide.type === 'h')) {
                    resizeSnapLockRef.current.y = null;
                }
            }

            newWidth = Math.max(10, newWidth);
            newHeight = Math.max(10, newHeight);

            setAlignGuidesIfChanged(resizeGuides);

            onElementChange(draggedElementIdRef.current, {
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight,
            });

            // If resizing a frame with auto-layout, schedule re-layout
            if (element?.type === 'frame' && element.frameAutoLayout && draggedElementIdRef.current) {
                scheduleAutoLayout(draggedElementIdRef.current);
            }
        }
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (dragStartRef.current || isPanningRef.current || isDrawing || isSelectingRef.current || isFrameDrawing) {
            return;
        }

        processMouseMove(e.clientX, e.clientY, e.buttons, e.altKey, e.timeStamp);
    };

    const handleMouseUp = () => {
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

        // Frame drawing completion
        if (isFrameDrawing && frameDrawBox) {
            const x = Math.min(frameDrawBox.startX, frameDrawBox.currentX);
            const y = Math.min(frameDrawBox.startY, frameDrawBox.currentY);
            const w = Math.abs(frameDrawBox.currentX - frameDrawBox.startX);
            const h = Math.abs(frameDrawBox.currentY - frameDrawBox.startY);
            // Need at least 20px to create a frame
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
                // Auto-adopt elements that are within the newly drawn frame bounds
                // Also adopt child frames (but skip connectors)
                elements.forEach(el => {
                    if (el.type === 'connector') return;
                    // Don't adopt elements that already have a parent frame that's also being adopted
                    const elCenterX = el.x + (el.width || 0) / 2;
                    const elCenterY = el.y + (el.height || 0) / 2;
                    if (elCenterX >= x && elCenterX <= x + Math.round(w) &&
                        elCenterY >= y && elCenterY <= y + Math.round(h)) {
                        // Only adopt top-level elements (no parent) or elements whose parent frame is outside
                        if (!el.parentFrameId) {
                            onElementChange(el.id, { parentFrameId: frameId });
                        }
                    }
                });
                onSelect([frameId]);
            }
            setIsFrameDrawing(false);
            setFrameDrawBox(null);
            onToolChange('select');
            return;
        }

        if (isSelectingRef.current && activeSelectionBox) {
            // Calculate selection intersection
            const x1 = Math.min(activeSelectionBox.startX, activeSelectionBox.currentX);
            const y1 = Math.min(activeSelectionBox.startY, activeSelectionBox.currentY);
            const x2 = Math.max(activeSelectionBox.startX, activeSelectionBox.currentX);
            const y2 = Math.max(activeSelectionBox.startY, activeSelectionBox.currentY);
            const selectionWidth = Math.abs(activeSelectionBox.currentX - activeSelectionBox.startX);
            const selectionHeight = Math.abs(activeSelectionBox.currentY - activeSelectionBox.startY);

            const newSelectedIds = elements
                .filter(el => shouldIncludeInBoxSelection(el, x1, y1, x2, y2))
                .map(el => el.id);

            if (selectionWidth < 4 && selectionHeight < 4 && activeSelectionBox.fallbackSelectionId) {
                if (activeSelectionBox.mode === 'add') {
                    onSelect(Array.from(new Set([...selectedIds, activeSelectionBox.fallbackSelectionId])));
                } else {
                    onSelect([activeSelectionBox.fallbackSelectionId]);
                }
            } else if (activeSelectionBox.mode === 'add') {
                onSelect(Array.from(new Set([...selectedIds, ...newSelectedIds])));
            } else {
                onSelect(newSelectedIds);
            }
        }

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

                const newPoints = points.map(p => ({
                    x: p.x - minX,
                    y: p.y - minY
                }));

                const newElement: CanvasElement = {
                    id: uuidv4(),
                    type: 'path',
                    x: minX,
                    y: minY,
                    width: Math.max(width, 1),
                    height: Math.max(height, 1),
                    points: newPoints,
                    color: '#000000',
                    strokeWidth: 3
                };
                onAddElement(newElement);
                onSelect([newElement.id]);
            }
            setCurrentPath(null);
        }

        // ── Commit CSS transform drag: apply final positions to React state ──
        // Save drag delta before resetting (needed for frame adoption below)
        const savedDragDelta = (isDragging && dragVisualDeltaRef.current) 
            ? { dx: dragVisualDeltaRef.current.dx, dy: dragVisualDeltaRef.current.dy } 
            : { dx: 0, dy: 0 };
        if (isDragging && dragStartRef.current?.initialPositions && dragVisualDeltaRef.current) {
            const { dx, dy } = dragVisualDeltaRef.current;
            if (dx !== 0 || dy !== 0) {
                const batchChanges: { id: string; attrs: Partial<CanvasElement> }[] = [];
                for (const pos of dragStartRef.current.initialPositions) {
                    batchChanges.push({
                        id: pos.id,
                        attrs: { x: pos.x + dx, y: pos.y + dy },
                    });
                }
                onBatchElementChange?.(batchChanges);
            }
            dragVisualDeltaRef.current = { dx: 0, dy: 0 };
        }

        // Auto-adopt/release elements to/from frames after drag
        if (isDragging && dragStartRef.current?.initialPositions) {
            // Build a map of committed final positions for dragged elements
            // (elements prop still has old positions since React state is async)
            const committedPositions = new Map<string, { x: number; y: number }>();
            for (const pos of dragStartRef.current.initialPositions) {
                committedPositions.set(pos.id, {
                    x: pos.x + savedDragDelta.dx,
                    y: pos.y + savedDragDelta.dy,
                });
            }

            // Only process top-level dragged elements (not frame children that were dragged along)
            const topDragIds = dragStartRef.current.initialPositions
                .map(p => p.id)
                .filter(id => {
                    const el = elements.find(e => e.id === id);
                    // Skip children that were included because their parent frame is also being dragged
                    if (el?.parentFrameId && dragStartRef.current?.initialPositions?.some(p => p.id === el.parentFrameId)) {
                        return false;
                    }
                    return true;
                });

            // Helper: collect all descendant IDs of a frame (to prevent circular nesting)
            const getDescendants = (frameId: string): Set<string> => {
                const desc = new Set<string>();
                const collect = (pid: string) => {
                    elements.forEach(c => {
                        if (c.parentFrameId === pid && !desc.has(c.id)) {
                            desc.add(c.id);
                            if (c.type === 'frame') collect(c.id);
                        }
                    });
                };
                collect(frameId);
                return desc;
            };

            topDragIds.forEach(movedId => {
                const el = elements.find(e => e.id === movedId);
                if (!el || el.type === 'connector') return;

                // Use committed final positions for adoption check
                const finalPos = committedPositions.get(movedId);
                const finalX = finalPos ? finalPos.x : el.x;
                const finalY = finalPos ? finalPos.y : el.y;
                const elCenterX = finalX + (el.width || 0) / 2;
                const elCenterY = finalY + (el.height || 0) / 2;

                // For frames: collect descendants to prevent circular nesting
                const ownDescendants = el.type === 'frame' ? getDescendants(el.id) : new Set<string>();

                const targetCandidates = elements.filter(frame =>
                    frame.type === 'frame' &&
                    frame.id !== movedId &&
                    !ownDescendants.has(frame.id) &&
                    !topDragIds.includes(frame.id) &&
                    elCenterX >= frame.x &&
                    elCenterX <= frame.x + (frame.width || 0) &&
                    elCenterY >= frame.y &&
                    elCenterY <= frame.y + (frame.height || 0)
                );
                // Prefer the innermost (smallest) frame
                const targetFrame = targetCandidates.length > 0
                    ? targetCandidates.reduce((best, f) => {
                        const area = (f.width || 0) * (f.height || 0);
                        const bestArea = (best.width || 0) * (best.height || 0);
                        return area < bestArea ? f : best;
                    })
                    : null;

                if (targetFrame && targetFrame.id !== el.parentFrameId) {
                    moveElementToFrame(movedId, targetFrame.id);
                } else if (!targetFrame && el.parentFrameId) {
                    moveElementToFrame(movedId, undefined);
                }
            });
        }

        // ── Launch inertia momentum if was panning ──
        if (isPanning && panVelocityPointsRef.current.length >= 2) {
            const pts = panVelocityPointsRef.current;
            const latest = pts[pts.length - 1];
            // Compare against a point ~3 samples back for stable velocity
            const earlier = pts[Math.max(0, pts.length - 4)];
            const dt = latest.t - earlier.t;
            if (dt > 0 && dt < 200) {
                let vx = (latest.x - earlier.x) / dt * 16; // px per ~frame
                let vy = (latest.y - earlier.y) / dt * 16;
                const speed = Math.sqrt(vx * vx + vy * vy);
                if (speed > 1) {
                    // Cap max velocity for control
                    const MAX_V = 15;
                    if (speed > MAX_V) { vx = vx / speed * MAX_V; vy = vy / speed * MAX_V; }
                    const currentPan = { x: panRef.current.x, y: panRef.current.y };
                    const FRICTION = 0.82;
                    const MIN_V = 0.5;
                    const step = () => {
                        vx *= FRICTION;
                        vy *= FRICTION;
                        if (Math.abs(vx) < MIN_V && Math.abs(vy) < MIN_V) {
                            inertiaRafRef.current = null;
                            return;
                        }
                        currentPan.x += vx;
                        currentPan.y += vy;
                        commitPanChange({ x: currentPan.x, y: currentPan.y });
                        inertiaRafRef.current = requestAnimationFrame(step);
                    };
                    inertiaRafRef.current = requestAnimationFrame(step);
                }
            }
            panVelocityPointsRef.current = [];
        }

        setIsDragging(false);
        setDragPreviewState(null);
        setIsResizing(false);
        setIsPanning(false);
        setIsDrawing(false);
        setIsSelecting(false);
        setIsFrameDrawing(false);
        setDropTargetFrameId(null);
        setAlignGuidesIfChanged([]);
        setSelectionBox(null);
        syncSelectionBoxOverlay(null);
        stopSelectionDragListeners();
        setFrameDrawBox(null);
        dragStartRef.current = null;
        draggedElementIdRef.current = null;
        resizeHandleRef.current = null;
        moveSnapLockRef.current = { x: null, y: null };
        resizeSnapLockRef.current = { x: null, y: null };
        onDragEnd?.();
    };

    useEffect(() => {
        handleMouseDownRef.current = handleMouseDown;
        handleResizeStartRef.current = handleResizeStart;
        processMouseMoveRef.current = processMouseMove;
        handleMouseUpRef.current = handleMouseUp;
    });

    const handleMouseDownStable = useCallback((e: React.MouseEvent, elementId: string | null, elementX: number = 0, elementY: number = 0, width: number = 0, height: number = 0, options?: { fallbackSelectionId?: string }) => {
        handleMouseDownRef.current(e, elementId, elementX, elementY, width, height, options);
    }, []);

    const handleResizeStartStable = useCallback((e: React.MouseEvent, elementId: string, handle: string, element: CanvasElement) => {
        handleResizeStartRef.current(e, elementId, handle, element);
    }, []);

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            handleMouseUpRef.current();
        };

        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!dragStartRef.current && !isPanningRef.current && !isDrawing && !isSelectingRef.current && !isFrameDrawing) {
                return;
            }
            processMouseMoveRef.current(e.clientX, e.clientY, e.buttons, e.altKey, e.timeStamp);
        };

        const handleWindowBlur = () => {
            handleMouseUpRef.current();
        };

        window.addEventListener('mousemove', handleGlobalMouseMove, true);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('blur', handleWindowBlur);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove, true);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('blur', handleWindowBlur);
        };
    }, [isDrawing, isFrameDrawing]);

    useEffect(() => () => {
        stopSelectionDragListeners();
    }, [stopSelectionDragListeners]);

    const selectedElement = elements.find(el => selectedIds.includes(el.id)); // For context toolbar (just show first for now)

    const renderPath = renderPathPoints;

    // ── Fit single element into viewport (double-click zoom) ──
    const fitViewportToBounds = useCallback((bounds: { minX: number; minY: number; width: number; height: number }, maxScale = 2.5) => {
        const PADDING = 80;
        const viewportWidth = viewportSize.width || outerRef.current?.clientWidth || window.innerWidth;
        const viewportHeight = viewportSize.height || outerRef.current?.clientHeight || window.innerHeight;
        const safeWidth = Math.max(1, viewportWidth - PADDING * 2);
        const safeHeight = Math.max(1, viewportHeight - PADDING * 2);
        const nextScale = Math.min(
            MAX_SCALE,
            Math.max(
                MIN_SCALE,
                Math.min(safeWidth / Math.max(bounds.width, 1), safeHeight / Math.max(bounds.height, 1), maxScale),
            ),
        );
        const newPan = {
            x: (viewportWidth - bounds.width * nextScale) / 2 - bounds.minX * nextScale,
            y: (viewportHeight - bounds.height * nextScale) / 2 - bounds.minY * nextScale,
        };
        onScaleChange(nextScale);
        commitPanChange(newPan);
    }, [MAX_SCALE, MIN_SCALE, commitPanChange, onScaleChange, viewportSize.height, viewportSize.width]);

    const fitToElement = useCallback((el: CanvasElement) => {
        fitViewportToBounds({
            minX: el.x,
            minY: el.y,
            width: el.width || 300,
            height: el.height || 300,
        });
    }, [fitViewportToBounds]);

    // ── Stable handlers ref for CanvasElementRenderer (React.memo friendly) ──
    const elementHandlers = useMemo<ElementHandlers>(() => ({
        handleMouseDown: handleMouseDownStable,
        handleResizeStart: handleResizeStartStable,
        onElementChange,
        onCanvasSelectPick,
        onSelect,
        onDelete,
        setEditingTextId,
        setEditingFrameName,
        setEditingMarkId,
        setActiveVideoId,
        setActiveImagePreviewId,
        setShowFramePresetMenu,
        setShowFrameExportMenu,
        setQuickEditMarkId,
        setQuickEditPrompt,
        handleQuickEditSubmit,
        scheduleAutoLayout,
        fitToElement,
        getElements: () => elements,
    }), [
        elements,
        fitToElement,
        handleMouseDownStable,
        handleQuickEditSubmit,
        handleResizeStartStable,
        onCanvasSelectPick,
        onDelete,
        onElementChange,
        onSelect,
        scheduleAutoLayout,
    ]);
    const elementHandlersRef = useRef<ElementHandlers>(elementHandlers);

    useEffect(() => {
        elementHandlersRef.current = elementHandlers;
    }, [elementHandlers]);

    const activeImagePreviewElement = useMemo(() => {
        if (scale > 0.12) {
            return null;
        }

        if (!activeImagePreviewId) {
            return null;
        }

        return elements.find((element) => element.id === activeImagePreviewId && !element.hidden && element.type === 'image' && !!element.content) || null;
    }, [activeImagePreviewId, elements, scale]);

    const activeImagePreviewMetrics = useMemo(() => {
        if (!activeImagePreviewElement) {
            return null;
        }

        const baseWidth = Math.max(1, activeImagePreviewElement.width || 240);
        const baseHeight = Math.max(1, activeImagePreviewElement.height || 240);
        const aspectRatio = baseWidth / baseHeight;
        const maxSide = 240;
        const minSide = 144;

        let width = baseWidth;
        let height = baseHeight;

        if (width >= height) {
            width = maxSide;
            height = Math.max(minSide, Math.round(width / aspectRatio));
        } else {
            height = maxSide;
            width = Math.max(minSide, Math.round(height * aspectRatio));
        }

        const screenX = activeImagePreviewElement.x * scale + pan.x;
        const screenY = activeImagePreviewElement.y * scale + pan.y;
        const screenW = baseWidth * scale;
        const anchorCenterX = screenX + screenW / 2;
        const offsetY = 18;
        const left = Math.min(Math.max(12, Math.round(anchorCenterX - width / 2)), Math.max(12, viewportSize.width - width - 12));
        const preferredTop = Math.round(screenY - height - offsetY);
        const top = preferredTop >= 12
            ? preferredTop
            : Math.min(Math.max(12, Math.round(screenY + Math.max(baseHeight * scale, 20) + offsetY)), Math.max(12, viewportSize.height - height - 12));

        return { width, height, left, top };
    }, [activeImagePreviewElement, pan.x, pan.y, scale, viewportSize.height, viewportSize.width]);

    // Wheel zoom (cursor-centered)
    const handleWheelRaw = useCallback((e: WheelEvent) => {
        cancelInertia();
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const rect = outerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            // Canvas point under cursor before zoom
            const canvasX = (mouseX - pan.x) / scale;
            const canvasY = (mouseY - pan.y) / scale;
            // Determine zoom factor
            const normalizedDelta = Math.sign(e.deltaY) * Math.min(120, Math.abs(e.deltaY));
            const zoomFactor = Math.exp(-normalizedDelta * 0.0025);
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * zoomFactor));
            // Adjust pan so cursor stays on same canvas point
            const newPanX = mouseX - canvasX * newScale;
            const newPanY = mouseY - canvasY * newScale;
            onScaleChange(newScale);
            commitPanChange({ x: newPanX, y: newPanY });
        } else {
            // Pan with wheel (no ctrl)
            commitPanChange({
                x: pan.x - (e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX),
                y: pan.y - e.deltaY,
            });
        }
    }, [MAX_SCALE, MIN_SCALE, scale, pan, onScaleChange, commitPanChange, cancelInertia]);

    // Attach non-passive wheel listener so preventDefault works
    useEffect(() => {
        const el = outerRef.current;
        if (!el) return;
        el.addEventListener('wheel', handleWheelRaw, { passive: false });
        return () => el.removeEventListener('wheel', handleWheelRaw);
    }, [handleWheelRaw]);

    // Right-click context menu handler
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = outerRef.current?.getBoundingClientRect();
        const offsetX = rect ? e.clientX - rect.left : e.clientX;
        const offsetY = rect ? e.clientY - rect.top : e.clientY;
        const canvasX = (offsetX - pan.x) / scale;
        const canvasY = (offsetY - pan.y) / scale;
        const target = getTopElementAtPoint(canvasX, canvasY);
        const isTargetSelected = !!target && selectedIds.includes(target.id);
        const preserveSelection = !!target && isTargetSelected && selectedIds.length > 1;

        if (target && !isTargetSelected) {
            if (!selectedIds.includes(target.id)) {
                onSelect([target.id]);
            }
        }

        setContextMenuAdjusted(null);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            canvasX,
            canvasY,
            targetElementId: preserveSelection ? selectedIds[0] ?? null : target?.id ?? null,
        });
    }, [getTopElementAtPoint, onSelect, pan, scale, selectedIds]);

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
        setContextMenuAdjusted(null);
    }, []);

    const getContextCanvasPosition = useCallback((fallback = { x: 300, y: 300 }) => {
        return {
            x: contextMenu?.canvasX ?? fallback.x,
            y: contextMenu?.canvasY ?? fallback.y,
        };
    }, [contextMenu?.canvasX, contextMenu?.canvasY]);

    const addElementAndSelect = useCallback((element: CanvasElement) => {
        onAddElement(element);
        onSelect([element.id]);
    }, [onAddElement, onSelect]);

    const runAfterClosingContextMenu = useCallback((action: () => void) => {
        closeContextMenu();
        action();
    }, [closeContextMenu]);

    const deleteSelectionByIds = useCallback((ids: string[]) => {
        if (ids.length === 0) return;
        if (onDeleteSelection) {
            onDeleteSelection(ids);
            return;
        }
        ids.forEach(id => onDelete(id));
    }, [onDelete, onDeleteSelection]);

    // Adjust context menu position to stay within viewport
    useEffect(() => {
        if (!contextMenu) return;
        // Use requestAnimationFrame to wait for the menu to render and measure
        const raf = requestAnimationFrame(() => {
            const el = contextMenuRef.current;
            if (!el) { setContextMenuAdjusted({ x: contextMenu.x, y: contextMenu.y }); return; }
            const rect = el.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let x = contextMenu.x;
            let y = contextMenu.y;
            if (y + rect.height > vh - 8) y = Math.max(8, vh - rect.height - 8);
            if (x + rect.width > vw - 8) x = Math.max(8, vw - rect.width - 8);
            setContextMenuAdjusted({ x, y });
        });
        return () => cancelAnimationFrame(raf);
    }, [contextMenu]);

    // Close context menu on click outside
    useEffect(() => {
        if (!contextMenu) return;
        const handler = () => {
            closeContextMenu();
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [contextMenu, closeContextMenu]);

    // Context menu file handlers
    const handleContextImageUpload = () => {
        runAfterClosingContextMenu(() => imageInputRef.current?.click());
    };
    const handleContextVideoUpload = () => {
        runAfterClosingContextMenu(() => videoInputRef.current?.click());
    };
    const handleContextImageGenerator = () => {
        runAfterClosingContextMenu(() => onOpenImageGenerator?.());
    };
    const handleContextVideoGenerator = () => {
        runAfterClosingContextMenu(() => onOpenVideoGenerator?.());
    };
    const handleContextAddText = () => {
        const { x, y } = getContextCanvasPosition({ x: 200, y: 200 });
        closeContextMenu();
        const el: CanvasElement = {
            id: uuidv4(),
            type: 'text',
            x,
            y,
            content: '双击编辑文本',
        };
        addElementAndSelect(el);
    };
    const handleContextAddShape = () => {
        const { x, y } = getContextCanvasPosition();
        closeContextMenu();
        const el: CanvasElement = {
            id: uuidv4(),
            type: 'shape',
            shapeType: 'square',
            x,
            y,
            width: 150,
            height: 150,
            color: '#9CA3AF',
        };
        addElementAndSelect(el);
    };
    const handleContextAddMark = () => {
        const { x: cx, y: cy } = getContextCanvasPosition();
        closeContextMenu();
        const existingMarks = elements.filter(el => el.type === 'mark');
        const markNumber = existingMarks.length > 0 ? Math.max(...existingMarks.map(m => m.markNumber || 0)) + 1 : 1;
        // Detect if mark is placed on top of an image/video element
        const targetElement = [...elements].reverse().find(el => {
            if (el.type !== 'image' && el.type !== 'video') return false;
            if (!el.content) return false;
            const elRight = el.x + (el.width || 0);
            const elBottom = el.y + (el.height || 0);
            return cx >= el.x && cx <= elRight && cy >= el.y && cy <= elBottom;
        });
        const el: CanvasElement = {
            id: uuidv4(),
            type: 'mark',
            x: cx - 16,
            y: cy - 30,
            width: 32,
            height: 32,
            markNumber,
            markText: '',
            color: '#EF4444',
            markTargetId: targetElement?.id,
        };
        addElementAndSelect(el);
    };
    const handleContextAddFrame = () => {
        const { x: cx, y: cy } = getContextCanvasPosition();
        closeContextMenu();
        addFrameAtPosition(cx, cy);
    };
    const handleContextPaste = () => {
        closeContextMenu();
        if (onPasteAt) {
            onPasteAt(getContextCanvasPosition());
        }
    };
    const handleContextSelectAll = () => {
        runAfterClosingContextMenu(() => onSelect(elements.map(el => el.id)));
    };

    // ═══ Element Map for O(1) lookups ═══════════════════════════════
    const elementMap = useMemo(() => {
        const map = new Map<string, typeof elements[0]>();
        for (const el of elements) map.set(el.id, el);
        return map;
    }, [elements]);

    const contextTargetIds = useMemo(() => {
        if (!contextMenu?.targetElementId) return selectedIds;
        if (selectedIds.includes(contextMenu.targetElementId)) return selectedIds;
        return [contextMenu.targetElementId];
    }, [contextMenu, selectedIds]);

    const contextTargetElements = useMemo(() => (
        contextTargetIds
            .map(id => elementMap.get(id))
            .filter((el): el is CanvasElement => !!el)
    ), [contextTargetIds, elementMap]);

    const contextTargetElement = contextMenu?.targetElementId ? elementMap.get(contextMenu.targetElementId) ?? null : null;
    const contextAllHidden = contextTargetElements.length > 0 && contextTargetElements.every(el => !!el.hidden);
    const contextAllLocked = contextTargetElements.length > 0 && contextTargetElements.every(el => isElementLocked(el));
    const contextCanSendToChat = contextTargetElements.some(el => el.type === 'image' && !!el.content);
    const contextCanGroup = contextTargetElements.filter(el => el.type !== 'connector').length >= 2;
    const contextCanUngroup = contextTargetElements.some(el => el.type === 'frame' && el.groupFrame);
    const contextCanMerge = contextTargetElements.filter(el => ['image', 'text', 'shape', 'path'].includes(el.type)).length >= 2;

    const runContextSelectionAction = useCallback((action?: (ids: string[]) => void) => {
        if (contextTargetIds.length === 0) return;
        action?.(contextTargetIds);
        closeContextMenu();
    }, [closeContextMenu, contextTargetIds]);

    const handleContextCopySelection = useCallback(() => {
        runContextSelectionAction(onCopySelection);
    }, [onCopySelection, runContextSelectionAction]);

    const handleContextCutSelection = useCallback(() => {
        runContextSelectionAction(onCutSelection);
    }, [onCutSelection, runContextSelectionAction]);

    const handleContextDuplicate = useCallback(() => {
        if (contextTargetIds.length === 0) return;
        onDuplicateSelection?.(contextTargetIds, {
            x: contextMenu?.canvasX ?? 300,
            y: contextMenu?.canvasY ?? 300,
        });
        closeContextMenu();
    }, [contextMenu?.canvasX, contextMenu?.canvasY, contextTargetIds, onDuplicateSelection, closeContextMenu]);

    const handleContextBringForward = useCallback(() => {
        runContextSelectionAction(onBringForward);
    }, [onBringForward, runContextSelectionAction]);

    const handleContextSendBackward = useCallback(() => {
        runContextSelectionAction(onSendBackward);
    }, [onSendBackward, runContextSelectionAction]);

    const handleContextBringToFront = useCallback(() => {
        runContextSelectionAction(onBringToFront);
    }, [onBringToFront, runContextSelectionAction]);

    const handleContextSendToBack = useCallback(() => {
        runContextSelectionAction(onSendToBack);
    }, [onSendToBack, runContextSelectionAction]);

    const handleContextToggleHidden = useCallback(() => {
        runContextSelectionAction(onToggleElementsHidden);
    }, [onToggleElementsHidden, runContextSelectionAction]);

    const handleContextToggleLocked = useCallback(() => {
        runContextSelectionAction(onToggleElementsLocked);
    }, [onToggleElementsLocked, runContextSelectionAction]);

    const handleContextSendToChat = useCallback(() => {
        runContextSelectionAction(onSendSelectionToChat);
    }, [onSendSelectionToChat, runContextSelectionAction]);

    const handleContextGroup = useCallback(() => {
        runContextSelectionAction(onGroupSelection);
    }, [onGroupSelection, runContextSelectionAction]);

    const handleContextUngroup = useCallback(() => {
        runContextSelectionAction(onUngroupSelection);
    }, [onUngroupSelection, runContextSelectionAction]);

    const handleContextMerge = useCallback(() => {
        runContextSelectionAction(onMergeSelection);
    }, [onMergeSelection, runContextSelectionAction]);

    const handleContextDeleteSelection = useCallback(() => {
        if (contextTargetIds.length === 0) return;
        deleteSelectionByIds(contextTargetIds);
        closeContextMenu();
    }, [closeContextMenu, contextTargetIds, deleteSelectionByIds]);

    const alignmentActions = useMemo<Array<{
        direction: AlignmentDirection;
        contextTitle: string;
        toolbarTitle: string;
        Icon: React.ComponentType<{ size?: number; className?: string }>;
        dividerBefore?: boolean;
    }>>(() => [
        { direction: 'left', contextTitle: '左对齐 (Alt+A)', toolbarTitle: '左对齐', Icon: AlignStartVertical },
        { direction: 'center-h', contextTitle: '水平居中', toolbarTitle: '水平居中对齐', Icon: AlignCenterHorizontal },
        { direction: 'right', contextTitle: '右对齐 (Alt+D)', toolbarTitle: '右对齐', Icon: AlignEndVertical },
        { direction: 'top', contextTitle: '顶部对齐 (Alt+W)', toolbarTitle: '顶部对齐', Icon: AlignStartHorizontal, dividerBefore: true },
        { direction: 'center-v', contextTitle: '垂直居中', toolbarTitle: '垂直居中对齐', Icon: AlignCenterVertical },
        { direction: 'bottom', contextTitle: '底部对齐 (Alt+S)', toolbarTitle: '底部对齐', Icon: AlignEndHorizontal },
    ], []);

    const distributionActions = useMemo<Array<{
        axis: DistributionAxis;
        title: string;
        Icon: React.ComponentType<{ size?: number; className?: string }>;
    }>>(() => [
        { axis: 'horizontal', title: '水平均匀分布', Icon: AlignHorizontalDistributeCenter },
        { axis: 'vertical', title: '垂直均匀分布', Icon: AlignVerticalDistributeCenter },
    ], []);

    const equalSpacingActions = useMemo<Array<{
        axis: DistributionAxis;
        title: string;
        icon: 'horizontal' | 'vertical';
    }>>(() => [
        { axis: 'horizontal', title: '水平等间距 (20px)', icon: 'horizontal' },
        { axis: 'vertical', title: '垂直等间距 (20px)', icon: 'vertical' },
    ], []);

    const layoutSelectionActions = useMemo<Array<{
        mode: LayoutSelectionMode;
        title: string;
        label: string;
    }>>(() => [
        { mode: 'row', title: '横向自动排列', label: '横排' },
        { mode: 'column', title: '纵向自动排列', label: '竖排' },
        { mode: 'grid', title: '网格自动排列', label: '网格' },
    ], []);

    const renderEqualSpacingIcon = useCallback((icon: 'horizontal' | 'vertical') => {
        if (icon === 'horizontal') {
            return (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="6" height="12" rx="1" />
                    <rect x="16" y="6" width="6" height="12" rx="1" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                    <line x1="12" y1="10" x2="12" y2="14" />
                </svg>
            );
        }

        return (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="2" width="12" height="6" rx="1" />
                <rect x="6" y="16" width="12" height="6" rx="1" />
                <line x1="12" y1="10" x2="12" y2="14" />
                <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
        );
    }, []);

    const renderAlignmentMenuSection = useCallback((selectionCount: number) => {
        if (selectionCount < 2) return null;

        return (
            <>
                <div className="h-px bg-gray-100 my-1" />
                <div className="px-3 py-1">
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">对齐</span>
                </div>
                <div className="flex items-center gap-0.5 px-3 py-1">
                    {alignmentActions.map(({ direction, contextTitle, Icon, dividerBefore }) => (
                        <React.Fragment key={direction}>
                            {dividerBefore ? <div className="w-px h-4 bg-gray-200 mx-0.5" /> : null}
                            <button onClick={() => { alignElements(direction); closeContextMenu(); }} className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded text-gray-500 transition-colors" title={contextTitle}>
                                <Icon size={14} />
                            </button>
                        </React.Fragment>
                    ))}
                </div>
                {selectionCount >= 3 && (
                    <div className="flex items-center gap-0.5 px-3 py-1">
                        {distributionActions.map(({ axis, title, Icon }) => (
                            <button key={axis} onClick={() => { distributeElements(axis); closeContextMenu(); }} className="p-1.5 hover:bg-purple-50 hover:text-purple-600 rounded text-gray-500 transition-colors" title={title}>
                                <Icon size={14} />
                            </button>
                        ))}
                        <span className="text-[10px] text-gray-400 ml-1">均匀分布</span>
                    </div>
                )}
                <div className="h-px bg-gray-100 my-1" />
            </>
        );
    }, [alignElements, alignmentActions, closeContextMenu, distributeElements, distributionActions]);

    /** Pre-classify elements by type (avoids 3x filter scans in JSX) */
    const { connectors: connectorElements, frameChildCounts } = useMemo(() => {
        const conns: CanvasElement[] = [];
        const childCounts = new Map<string, number>();
        for (const el of elements) {
            if (el.hidden) continue;
            if (el.type === 'connector') conns.push(el);
            if (el.parentFrameId) childCounts.set(el.parentFrameId, (childCounts.get(el.parentFrameId) || 0) + 1);
        }
        return { connectors: conns, frameChildCounts: childCounts };
    }, [elements]);

    // ═══ Viewport culling + virtualization for large canvas performance ═══
    // 视口外元素按缩放动态裁剪；交互中进一步收紧节点上限，减少大画布掉帧。
    const viewportRenderPlan = useMemo(() => {
        const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
        const dynamicViewportMargin = clampValue(Math.round(240 / Math.max(scale, 0.16)), 180, 1400);
        const viewportPixels = Math.max(1, viewportSize.width * viewportSize.height);
        const baseVisibleCap = clampValue(Math.round(viewportPixels / 7200), 180, 900);
        const interactionPenalty = (isPanning || isDragging || isResizing || isSelecting) ? 80 : 0;
        const zoomAdjustment = scale <= 0.2 ? -100 : scale <= 0.45 ? -40 : scale >= 1.75 ? 120 : scale >= 1.1 ? 40 : 0;
        const maxVisibleElements = clampValue(baseVisibleCap + zoomAdjustment - interactionPenalty, 160, 1000);
        const partitionTileSize = clampValue(Math.round(520 / Math.max(scale, 0.2)), 260, 1400);

        if (viewportSize.width === 0 || viewportSize.height === 0) {
            const visibleFallback = elements.filter(el => !el.hidden);
            return {
                visibleElements: visibleFallback,
                culledCount: 0,
                virtualizedCount: 0,
                deferredCount: 0,
                maxVisibleElements,
                viewportMargin: dynamicViewportMargin,
                partitionCount: 1,
                partitionTileSize,
            };
        }

        // Viewport bounds in canvas coordinates
        const vpLeft = (-pan.x / scale) - dynamicViewportMargin;
        const vpTop = (-pan.y / scale) - dynamicViewportMargin;
        const vpRight = (viewportSize.width - pan.x) / scale + dynamicViewportMargin;
        const vpBottom = (viewportSize.height - pan.y) / scale + dynamicViewportMargin;

        // Use spatial index for O(log n) range query when available
        const selectedSet = new Set(selectedIds);
        let candidateIds: Set<string>;

        if (spatialIndex && spatialIndex.size > 0) {
            const hits = spatialIndex.search({ minX: vpLeft, minY: vpTop, maxX: vpRight, maxY: vpBottom });
            candidateIds = new Set(hits);
            // Always include selected, frames, connectors
            for (const el of elements) {
                if (el.hidden) continue;
                if (selectedSet.has(el.id) || el.type === 'frame' || el.type === 'connector') {
                    candidateIds.add(el.id);
                }
            }
        } else {
            // Fallback: linear scan
            candidateIds = new Set<string>();
            for (const el of elements) {
                if (el.hidden) continue;
                if (selectedSet.has(el.id) || el.type === 'frame' || el.type === 'connector') {
                    candidateIds.add(el.id);
                    continue;
                }
                const elRight = el.x + (el.width || 0);
                const elBottom = el.y + (el.height || 0);
                if (elRight >= vpLeft && el.x <= vpRight && elBottom >= vpTop && el.y <= vpBottom) {
                    candidateIds.add(el.id);
                }
            }
        }

        const initiallyVisibleCount = candidateIds.size;
        let visible = elements.filter(el => !el.hidden && candidateIds.has(el.id));

        // ── Virtualization: cap DOM nodes at dynamic maxVisibleElements ──
        let virtualizedCount = 0;
        let deferredCount = 0;
        let partitionCount = 0;
        if (visible.length > maxVisibleElements) {
            const vpCenterX = (vpLeft + vpRight) / 2;
            const vpCenterY = (vpTop + vpBottom) / 2;

            // Partition: selected + frames + connectors are always kept
            const alwaysRender: CanvasElement[] = [];
            const sortable: CanvasElement[] = [];
            for (const el of visible) {
                if (selectedSet.has(el.id) || el.type === 'frame' || el.type === 'connector') {
                    alwaysRender.push(el);
                } else {
                    sortable.push(el);
                }
            }

            // ── Partitioned lazy rendering: split huge candidate sets into tiles,
            // then round-robin near the viewport center so dense projects stay responsive. ──
            const remaining = maxVisibleElements - alwaysRender.length;
            if (remaining > 0 && sortable.length > remaining) {
                const partitions = new Map<string, CanvasElement[]>();
                for (const el of sortable) {
                    const centerX = el.x + (el.width || 0) / 2;
                    const centerY = el.y + (el.height || 0) / 2;
                    const tileX = Math.floor(centerX / partitionTileSize);
                    const tileY = Math.floor(centerY / partitionTileSize);
                    const key = `${tileX}:${tileY}`;
                    const bucket = partitions.get(key) || [];
                    bucket.push(el);
                    partitions.set(key, bucket);
                }

                partitionCount = partitions.size;
                const orderedPartitions = Array.from(partitions.entries())
                    .map(([key, bucket]) => {
                        bucket.sort((a, b) => {
                            const dA = Math.abs(a.x + (a.width || 0) / 2 - vpCenterX) + Math.abs(a.y + (a.height || 0) / 2 - vpCenterY);
                            const dB = Math.abs(b.x + (b.width || 0) / 2 - vpCenterX) + Math.abs(b.y + (b.height || 0) / 2 - vpCenterY);
                            return dA - dB;
                        });
                        const [tileX, tileY] = key.split(':').map(Number);
                        return {
                            bucket,
                            distance: Math.abs((tileX + 0.5) * partitionTileSize - vpCenterX) + Math.abs((tileY + 0.5) * partitionTileSize - vpCenterY),
                        };
                    })
                    .sort((a, b) => a.distance - b.distance);

                const nextVisible: CanvasElement[] = [];
                let consumed = 0;
                while (consumed < remaining) {
                    let progressed = false;
                    for (const partition of orderedPartitions) {
                        const candidate = partition.bucket.shift();
                        if (!candidate) {
                            continue;
                        }
                        nextVisible.push(candidate);
                        consumed += 1;
                        progressed = true;
                        if (consumed >= remaining) {
                            break;
                        }
                    }

                    if (!progressed) {
                        break;
                    }
                }

                deferredCount = Math.max(0, sortable.length - nextVisible.length);
                sortable.length = 0;
                sortable.push(...nextVisible);
            } else {
                partitionCount = sortable.length > 0 ? 1 : 0;
            }
            virtualizedCount = Math.max(0, visible.length - (alwaysRender.length + sortable.length));
            visible = [...alwaysRender, ...sortable];
        } else {
            partitionCount = visible.length > 0 ? 1 : 0;
        }

        return {
            visibleElements: visible,
            culledCount: Math.max(0, elements.filter(el => !el.hidden).length - initiallyVisibleCount),
            virtualizedCount,
            deferredCount,
            maxVisibleElements,
            viewportMargin: dynamicViewportMargin,
            partitionCount,
            partitionTileSize,
        };
    }, [elements, isDragging, isPanning, isResizing, isSelecting, pan, scale, selectedIds, spatialIndex, viewportSize.height, viewportSize.width]);

    const visibleElements = viewportRenderPlan.visibleElements;
    const renderMetrics = useMemo<CanvasRenderMetrics>(() => ({
        visibleCount: visibleElements.length,
        totalCount: elements.length,
        culledCount: viewportRenderPlan.culledCount,
        virtualizedCount: viewportRenderPlan.virtualizedCount,
        deferredCount: viewportRenderPlan.deferredCount,
        maxVisibleElements: viewportRenderPlan.maxVisibleElements,
        viewportMargin: viewportRenderPlan.viewportMargin,
        partitionCount: viewportRenderPlan.partitionCount,
        partitionTileSize: viewportRenderPlan.partitionTileSize,
    }), [
        elements.length,
        viewportRenderPlan.culledCount,
        viewportRenderPlan.deferredCount,
        viewportRenderPlan.maxVisibleElements,
        viewportRenderPlan.partitionCount,
        viewportRenderPlan.partitionTileSize,
        viewportRenderPlan.viewportMargin,
        viewportRenderPlan.virtualizedCount,
        visibleElements.length,
    ]);

    useEffect(() => {
        if (!onRenderMetricsChange) {
            return;
        }

        const serializedMetrics = serializeRenderMetrics(renderMetrics);
        if (serializedMetrics === lastRenderMetricsRef.current) {
            return;
        }

        lastRenderMetricsRef.current = serializedMetrics;
        onRenderMetricsChange(renderMetrics);
    }, [onRenderMetricsChange, renderMetrics]);

    useEffect(() => {
        visibleElementsRef.current = visibleElements;
    }, [visibleElements]);

    /** Pre-sorted render list: frames first, then non-frame/non-connector */
    const renderElements = useMemo(() => {
        const frames: CanvasElement[] = [];
        const others: CanvasElement[] = [];
        for (const el of visibleElements) {
            if (el.type === 'frame') frames.push(el);
            else if (el.type !== 'connector') others.push(el);
        }
        return [...frames, ...others];
    }, [visibleElements]);

    const renderZIndexById = useMemo(() => {
        const zIndexMap = new Map<string, number>();
        renderElements.forEach((el, index) => {
            zIndexMap.set(el.id, index + 1);
        });
        return zIndexMap;
    }, [renderElements]);

    const canGenerateFromImage = !!onConnectFlow;

    const multiSelectionBounds = useMemo(() => {
        if (selectedIds.length < 2) return null;
        return getSelectedBounds();
    }, [selectedIds.length, getSelectedBounds]);

    const focusSelection = useCallback(() => {
        if (!multiSelectionBounds) return;
        fitViewportToBounds({
            minX: multiSelectionBounds.minX,
            minY: multiSelectionBounds.minY,
            width: multiSelectionBounds.width,
            height: multiSelectionBounds.height,
        }, 3);
    }, [fitViewportToBounds, multiSelectionBounds]);

    const multiSelectionPreviewOffset = useMemo(() => {
        if (!multiSelectionBounds || !dragPreviewState) return null;
        const hasSelectedPreview = selectedIds.some(id => dragPreviewState.ids.includes(id));
        if (!hasSelectedPreview) return null;
        return { dx: dragPreviewState.dx, dy: dragPreviewState.dy };
    }, [multiSelectionBounds, dragPreviewState, selectedIds]);

    const multiSelectedElements = useMemo(() => (
        elements.filter(el => selectedIds.includes(el.id))
    ), [elements, selectedIds]);

    const multiCanSendToChat = useMemo(() => (
        multiSelectedElements.some(el => el.type === 'image' && !!el.content)
    ), [multiSelectedElements]);

    const multiReferenceCandidateCount = useMemo(() => (
        multiSelectedElements.filter((element) => element.type === 'image' && !!element.content).length
    ), [multiSelectedElements]);

    const multiCanUngroup = useMemo(() => (
        multiSelectedElements.some(el => el.type === 'frame' && el.groupFrame)
    ), [multiSelectedElements]);

    const multiCanMerge = useMemo(() => (
        multiSelectedElements.filter(el => ['image', 'text', 'shape', 'path'].includes(el.type) && !el.hidden).length >= 2
    ), [multiSelectedElements]);

    const multiStoryboardGenerateIds = useMemo(() => (
        multiSelectedElements
            .filter((element) => element.type === 'image'
                && !!element.content
                && !!(
                    element.savedPrompt?.trim()
                    || element.storyboardShotCode?.trim()
                    || element.storyboardSceneType?.trim()
                    || element.storyboardNote?.trim()
                ))
            .map((element) => element.id)
    ), [multiSelectedElements]);

    const canGenerateStoryboardBatch = !!onGenerateStoryboardSelection
        && multiStoryboardGenerateIds.length >= 2
        && multiStoryboardGenerateIds.length === multiSelectedElements.length;
    const canGenerateStoryboardVideoBatch = !!onGenerateStoryboardVideoSelection
        && multiStoryboardGenerateIds.length >= 2
        && multiStoryboardGenerateIds.length === multiSelectedElements.length;

    const multiAllHidden = useMemo(() => (
        multiSelectedElements.length > 0 && multiSelectedElements.every(el => !!el.hidden)
    ), [multiSelectedElements]);

    const multiAllLocked = useMemo(() => (
        multiSelectedElements.length > 0 && multiSelectedElements.every(el => isElementLocked(el))
    ), [isElementLocked, multiSelectedElements]);

    const hiddenElementIds = useMemo(() => (
        elements.filter(el => el.hidden).map(el => el.id)
    ), [elements]);

    const singleSelectionResizeOverlay = useMemo(() => {
        if (
            selectedIds.length !== 1
            || isDrawing
            || isDragging
            || isResizing
            || !selectedElement
            || selectedElement.hidden
            || !canUseScreenSpaceResizeOverlayForElement(selectedElement)
        ) {
            return null;
        }

        const width = selectedElement.width ?? (selectedElement.type === 'text' ? 200 : selectedElement.type === 'mark' ? 32 : 0);
        const height = selectedElement.height ?? (selectedElement.type === 'text' ? 40 : selectedElement.type === 'mark' ? 32 : 0);

        if (width <= 0 || height <= 0) {
            return null;
        }

        return {
            element: selectedElement,
            left: selectedElement.x * scale + pan.x,
            top: selectedElement.y * scale + pan.y,
            width: width * scale,
            height: height * scale,
        };
    }, [isDragging, isDrawing, isResizing, pan.x, pan.y, scale, selectedElement, selectedIds.length]);

    const screenSpaceResizeElementId = singleSelectionResizeOverlay?.element.id ?? null;

    return (
        <div
            ref={outerRef}
            data-testid="canvas-area"
            data-scale={scale.toFixed(4)}
            data-pan-x={Math.round(pan.x)}
            data-pan-y={Math.round(pan.y)}
            data-visible-elements={visibleElements.length}
            data-total-elements={elements.length}
            data-cull-count={viewportRenderPlan.culledCount}
            data-virtualized-count={viewportRenderPlan.virtualizedCount}
            data-deferred-count={viewportRenderPlan.deferredCount}
            data-max-visible={viewportRenderPlan.maxVisibleElements}
            data-viewport-margin={viewportRenderPlan.viewportMargin}
            data-partition-count={viewportRenderPlan.partitionCount}
            data-partition-tile-size={viewportRenderPlan.partitionTileSize}
            className={`w-full h-full bg-[#F9FAFB] relative overflow-hidden ${canvasSelectMode ? 'cursor-crosshair' : activeTool === 'hand' ? 'cursor-grab active:cursor-grabbing' : activeTool === 'draw' ? 'cursor-crosshair' : activeTool === 'mark' ? 'cursor-crosshair' : activeTool === 'frame' ? 'cursor-crosshair' : ''}`}
            onMouseMove={handleMouseMove}
            onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
            onMouseDown={(e) => {
                setShowFramePresetMenu(null);
                setShowFrameExportMenu(null);
                if (canvasSelectMode && e.button === 0) {
                    // Clicking empty space cancels canvas select mode
                    onCancelCanvasSelect?.();
                    return;
                }
                // Middle mouse button → start panning
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
                        panY: pan.y
                    };
                    return;
                }
                if (e.button === 0) handleMouseDown(e, null);
            }}
            onContextMenu={handleContextMenu}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.types.includes('Files')) {
                    e.dataTransfer.dropEffect = 'copy';
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = Array.from(e.dataTransfer.files);
                if (files.length === 0) return;
                // Calculate canvas position from mouse position
                const rect = outerRef.current?.getBoundingClientRect();
                const canvasPos = rect ? {
                    x: (e.clientX - rect.left - pan.x) / scale,
                    y: (e.clientY - rect.top - pan.y) / scale,
                } : undefined;
                const imageFiles = files.filter(f => f.type.startsWith('image/'));
                const videoFiles = files.filter(f => f.type.startsWith('video/'));
                if (imageFiles.length > 0 && onAddImage) {
                    onAddImage(imageFiles, canvasPos);
                }
                if (videoFiles.length > 0 && onAddVideo) {
                    videoFiles.forEach(f => onAddVideo(f, canvasPos));
                }
            }}
        >
            {/* Canvas Select Mode Banner */}
            {canvasSelectMode && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[200] bg-green-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-200"
                     onMouseDown={(e) => e.stopPropagation()}>
                    <MousePointerClick size={18} />
                    <span className="text-sm font-medium">
                        请点击画布中的{canvasSelectMode === 'image' ? '图片' : '图片/视频'}作为参考
                    </span>
                    <button
                        onClick={() => onCancelCanvasSelect?.()}
                        className="ml-2 bg-white/20 hover:bg-white/30 text-white px-2.5 py-0.5 rounded-lg text-xs font-medium transition-colors"
                    >
                        取消
                    </button>
                </div>
            )}

            {hiddenElementIds.length > 0 && !canvasSelectMode && (
                <div
                    className="absolute top-4 right-4 z-[200]"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => onToggleElementsHidden?.(hiddenElementIds)}
                        className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white/95 px-3 py-2 text-sm font-medium text-blue-600 shadow-lg backdrop-blur hover:bg-blue-50 transition-colors"
                        title="恢复所有隐藏元素"
                    >
                        <Eye size={16} />
                        显示隐藏元素
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{hiddenElementIds.length}</span>
                    </button>
                </div>
            )}

            {/* Context Toolbar - Show if exactly one element selected (skip for connector and frame) */}
            {selectedIds.length === 1 && selectedElement && !selectedElement.hidden && !isDragging && !isResizing && !isPanning && !isDrawing && !isSelecting && !canvasSelectMode && selectedElement.type !== 'connector' && selectedElement.type !== 'frame' && selectedElement.type !== 'image-generator' && selectedElement.type !== 'video-generator' && (
                <div
                    style={{
                        position: 'absolute',
                        left: (selectedElement.x + (selectedElement.width || 0) / 2) * scale + pan.x,
                        top: Math.max(8, (selectedElement.y) * scale + pan.y - 48),
                        transform: 'translateX(-50%)',
                        zIndex: 100,
                        width: 'max-content',
                    }}
                >
                    <ContextToolbar
                        element={selectedElement}
                        scale={scale}
                        onUpdate={onElementChange}
                        onStoryboardSaved={onStoryboardSaved}
                        storyboardAutoAdvanceEnabled={storyboardAutoAdvanceEnabled}
                        onDelete={onDelete}
                        onCopy={onCopyElement}
                        onDownload={onDownloadElement}
                        projectReferenceImages={projectReferenceImages}
                        onUseProjectReferenceImage={onUseProjectReferenceImage}
                        onSaveAsProjectReference={onSaveAsProjectReference}
                        onSendToChat={onSendSelectionToChat ? (element) => onSendSelectionToChat([element.id]) : undefined}
                        onToggleHidden={onToggleElementsHidden ? (element) => onToggleElementsHidden([element.id]) : undefined}
                        onToggleLocked={onToggleElementsLocked ? (element) => onToggleElementsLocked([element.id]) : undefined}
                        onAiEdit={onAiEditElement}
                        onRecoverTask={onRecoverImageEditTask}
                        onReplaceBackground={onReplaceBackground}
                        onMockup={onMockupElement}
                        onAnnotateImage={onAnnotateImage}
                        onCropImage={onCropImage}
                        onSplitStoryboard={onSplitStoryboard}
                        onStoryboardPlanFromImage={onStoryboardPlanFromImage}
                        onConnectFlow={onConnectFlow}
                    />
                </div>
            )}

            {/* Multi-selection Toolbar */}
            {selectedIds.length > 1 && !isDragging && !isSelecting && (
                <div
                    className="absolute z-50 bg-white rounded-xl shadow-lg border border-gray-200 p-1.5 flex items-center gap-1"
                    style={{
                        left: '50%',
                        top: 16,
                        transform: 'translateX(-50%)',
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <span className="text-xs font-medium text-gray-500 px-2 whitespace-nowrap">已选 {selectedIds.length} 个</span>
                    <div className="w-px h-6 bg-gray-200" />

                    {/* Alignment buttons */}
                    <div className="flex items-center gap-0.5 px-0.5" title="对齐">
                        {alignmentActions.map(({ direction, toolbarTitle, Icon, dividerBefore }) => (
                            <React.Fragment key={direction}>
                                {dividerBefore ? <div className="w-px h-4 bg-gray-100 mx-0.5" /> : null}
                                <button
                                    onClick={() => alignElements(direction)}
                                    className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-gray-500 transition-colors"
                                    title={toolbarTitle}
                                >
                                    <Icon size={15} />
                                </button>
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Distribution buttons (need 3+ elements) */}
                    {selectedIds.length >= 3 && (
                        <>
                            <div className="w-px h-6 bg-gray-200" />
                            <div className="flex items-center gap-0.5 px-0.5" title="分布">
                                {distributionActions.map(({ axis, title, Icon }) => (
                                    <button
                                        key={axis}
                                        onClick={() => distributeElements(axis)}
                                        className="p-1.5 hover:bg-purple-50 hover:text-purple-600 rounded-lg text-gray-500 transition-colors"
                                        title={title}
                                    >
                                        <Icon size={15} />
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Equal spacing */}
                    {selectedIds.length >= 2 && (
                        <>
                            <div className="w-px h-6 bg-gray-200" />
                            <div className="flex items-center gap-0.5 px-0.5" title="等间距">
                                {equalSpacingActions.map(({ axis, title, icon }) => (
                                    <button
                                        key={axis}
                                        onClick={() => equalSpacing(axis)}
                                        className="p-1.5 hover:bg-green-50 hover:text-green-600 rounded-lg text-gray-500 transition-colors"
                                        title={title}
                                    >
                                        {renderEqualSpacingIcon(icon)}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {selectedIds.length >= 2 && (
                        <>
                            <div className="w-px h-6 bg-gray-200" />
                            <div className="flex items-center gap-1 px-0.5" title="自动布局">
                                {layoutSelectionActions.map(({ mode, title, label }) => (
                                    <button
                                        key={mode}
                                        onClick={() => layoutSelection(mode)}
                                        className="px-2 py-1.5 hover:bg-sky-50 hover:text-sky-600 rounded-lg text-gray-500 transition-colors text-xs font-medium"
                                        title={title}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {selectedIds.length >= 2 && onExportStoryboardSelection && (
                        <>
                            <div className="w-px h-6 bg-gray-200" />
                            <button
                                onClick={() => onExportStoryboardSelection(selectedIds)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-600 hover:bg-sky-50 hover:text-sky-600 transition-colors"
                                title="导出分镜表"
                            >
                                <LayoutGrid size={15} />
                                <span className="text-xs font-medium">分镜表</span>
                            </button>
                        </>
                    )}

                    {canGenerateStoryboardBatch && (
                        <>
                            <div className="w-px h-6 bg-gray-200" />
                            <button
                                onClick={() => onGenerateStoryboardSelection?.(multiStoryboardGenerateIds)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                                title="将所选分镜卡片批量转为图片生成任务"
                            >
                                <Sparkles size={15} />
                                <span className="text-xs font-medium">批量出图</span>
                            </button>
                        </>
                    )}

                    {canGenerateStoryboardVideoBatch && (
                        <>
                            <div className="w-px h-6 bg-gray-200" />
                            <button
                                onClick={() => onGenerateStoryboardVideoSelection?.(multiStoryboardGenerateIds)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                                title="将所选分镜卡片批量转为视频生成任务"
                            >
                                <Video size={15} />
                                <span className="text-xs font-medium">批量出视频</span>
                            </button>
                        </>
                    )}

                    {multiSelectionBounds && (
                        <>
                            <div className="w-px h-6 bg-gray-200" />
                            <button
                                onClick={focusSelection}
                                className="flex items-center gap-1 px-2 py-1.5 bg-sky-50 text-sky-600 rounded-lg hover:bg-sky-100 transition-colors text-sm"
                                title="聚焦到当前多选区域"
                            >
                                <MapPin size={14} />
                                <span className="text-xs font-medium">聚焦</span>
                            </button>
                        </>
                    )}

                    <div className="w-px h-6 bg-gray-200" />

                    {/* Group into frame */}
                    <button
                        onClick={() => onGroupSelection?.(selectedIds)}
                        className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                        title="将选中元素组合到画板中"
                    >
                        <Frame size={14} />
                        <span className="text-xs font-medium">组合</span>
                    </button>

                    {multiCanUngroup && (
                        <button
                            onClick={() => onUngroupSelection?.(selectedIds)}
                            className="flex items-center gap-1 px-2 py-1.5 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors text-sm"
                            title="解除编组"
                        >
                            <Frame size={14} />
                            <span className="text-xs font-medium">解组</span>
                        </button>
                    )}

                    {multiCanMerge && (
                        <button
                            onClick={() => onMergeSelection?.(selectedIds)}
                            className="flex items-center gap-1 px-2 py-1.5 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-sm"
                            title="合并图层"
                        >
                            <Minus size={14} />
                            <span className="text-xs font-medium">合并</span>
                        </button>
                    )}

                    {multiCanSendToChat && (
                        <button
                            onClick={() => onSendSelectionToChat?.(selectedIds)}
                            className="flex items-center gap-1 px-2 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors text-sm"
                            title="发送至对话"
                        >
                            <Send size={14} />
                            <span className="text-xs font-medium">发送</span>
                        </button>
                    )}

                    {multiReferenceCandidateCount > 0 && onSaveSelectionAsProjectReference && (
                        <button
                            data-testid="canvas-multi-save-reference"
                            onClick={() => onSaveSelectionAsProjectReference(selectedIds)}
                            className="flex items-center gap-1 px-2 py-1.5 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors text-sm"
                            title={`将所选 ${multiReferenceCandidateCount} 张图片加入项目参考库`}
                        >
                            <BookmarkPlus size={14} />
                            <span className="text-xs font-medium">入参考库</span>
                        </button>
                    )}

                    <button
                        onClick={() => onToggleElementsHidden?.(selectedIds)}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors text-sm ${multiAllHidden ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                        title={multiAllHidden ? '显示所选元素' : '隐藏所选元素'}
                    >
                        <span className="text-xs font-medium">{multiAllHidden ? '显示' : '隐藏'}</span>
                    </button>

                    <button
                        onClick={() => onToggleElementsLocked?.(selectedIds)}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors text-sm ${multiAllLocked ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                        title={multiAllLocked ? '解锁所选元素' : '锁定所选元素'}
                    >
                        <span className="text-xs font-medium">{multiAllLocked ? '解锁' : '锁定'}</span>
                    </button>

                    <div className="w-px h-6 bg-gray-200" />
                    <button onClick={() => deleteSelectionByIds(selectedIds)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-md text-sm" title="全部删除">
                        <Trash2 size={15} />
                    </button>
                </div>
            )}

            {/* Content Container with Scale and Pan */}
            <div
                ref={containerRef}
                className="w-full h-full origin-top-left"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, willChange: 'transform' }}
            >
                {/* Grid Pattern Background */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                        width: '10000px', // Make it huge
                        height: '10000px'
                    }}
                />

                {/* Connectors Layer - Render first so they appear behind elements */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                    {connectorElements.map((connector) => {
                        const fromEl = elementMap.get(connector.connectorFrom || '');
                        const toEl = elementMap.get(connector.connectorTo || '');
                        
                        if (!fromEl || !toEl) return null;

                        const fromX = fromEl.x + (fromEl.width || 0) / 2;
                        const fromY = fromEl.y + (fromEl.height || 0) / 2;
                        const toX = toEl.x + (toEl.width || 0) / 2;
                        const toY = toEl.y + (toEl.height || 0) / 2;

                        return (
                            <g key={connector.id}>
                                <line
                                    x1={fromX}
                                    y1={fromY}
                                    x2={toX}
                                    y2={toY}
                                    stroke={connector.color || '#6B7280'}
                                    strokeWidth={connector.strokeWidth || 2}
                                    strokeDasharray={connector.connectorStyle === 'dashed' ? '8 4' : '0'}
                                    markerEnd="url(#arrowhead)"
                                />
                            </g>
                        );
                    })}
                    {/* Arrow marker definition */}
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="10"
                            markerHeight="10"
                            refX="9"
                            refY="3"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3, 0 6" fill="#6B7280" />
                        </marker>
                    </defs>
                </svg>

                {/* Elements Layer */}
                <div className="absolute inset-0" ref={elementsContainerRef}>
                    {/* Render frames first so they appear behind other elements */}
                    {/* Use renderElements (pre-sorted: frames first, then others, no connectors) for viewport culling */}
                    {renderElements.map((el) => {
                        const isSelected = selectedIds.includes(el.id);
                        const dragPreviewOffset = dragPreviewState?.ids.includes(el.id)
                            ? { dx: dragPreviewState.dx, dy: dragPreviewState.dy }
                            : null;
                        const baseZIndex = renderZIndexById.get(el.id) ?? 1;
                        const isPickable = !!(canvasSelectMode && (el.type === 'image' || el.type === 'video') && el.content);
                        const isNotPickable = !!(canvasSelectMode && !isPickable);
                        const isLinked = !isSelected && !isDrawing && selectedIds.some(sid => {
                            const sel = elements.find(e => e.id === sid);
                            return sel?.linkedElements?.includes(el.id) || el.linkedElements?.includes(sid);
                        });
                        const isLayerOrderHighlighted = highlightedElementIdSet.has(el.id);
                        return (
                            <CanvasElementRenderer
                                key={el.id}
                                el={el}
                                resolvedImageSrc={resolvedImageSrcMap?.[el.id]}
                                isSelected={isSelected}
                                selectedImageCount={multiReferenceCandidateCount}
                                showToolbar={isSelected && selectedIds.length === 1 && !isDragging && !isResizing}
                                isDropTarget={dropTargetFrameId === el.id}
                                isEditingText={editingTextId === el.id}
                                isEditingFrameName={editingFrameName === el.id}
                                isEditingMark={editingMarkId === el.id}
                                isQuickEditing={quickEditMarkId === el.id}
                                isLinked={isLinked}
                                isPickable={isPickable}
                                isNotPickable={isNotPickable}
                                frameChildCount={frameChildCounts.get(el.id) || 0}
                                scale={scale}
                                activeTool={activeTool}
                                quickEditPrompt={quickEditMarkId === el.id ? quickEditPrompt : ''}
                                showFramePresetMenu={showFramePresetMenu === el.id}
                                showFrameExportMenu={showFrameExportMenu === el.id}
                                canGenerateFromImage={canGenerateFromImage}
                                markTargetHasContent={!!(el.markTargetId && elements.find(t => t.id === el.markTargetId && t.content))}
                                isGeneratorSubmitting={!!generatorSubmittingMap?.[el.id]}
                                isResultHighlighted={highlightedResultId === el.id}
                                isLayerOrderHighlighted={isLayerOrderHighlighted}
                                dragPreviewOffset={dragPreviewOffset}
                                zIndex={baseZIndex}
                                handlersRef={elementHandlersRef}
                            />
                        );
                    })}

                    {multiSelectionBounds && !isSelecting && (
                        <div
                            className="pointer-events-none absolute z-40 rounded-xl border-2 border-blue-500/85 bg-blue-500/[0.03] shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
                            style={{
                                left: multiSelectionBounds.minX - 8,
                                top: multiSelectionBounds.minY - 8,
                                width: multiSelectionBounds.width + 16,
                                height: multiSelectionBounds.height + 16,
                                transform: multiSelectionPreviewOffset
                                    ? `translate(${multiSelectionPreviewOffset.dx}px, ${multiSelectionPreviewOffset.dy}px)`
                                    : undefined,
                            }}
                        >
                            <div className="absolute -top-8 left-0 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm">
                                已选 {selectedIds.length} 个元素
                            </div>
                            <div className="absolute inset-0 rounded-xl border border-dashed border-blue-400/80" />
                            <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
                            <div className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
                            <div className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
                            <div className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
                        </div>
                    )}
                </div>

                {/* Current Drawing Path */}
                {currentPath && (
                    <div className="absolute inset-0 pointer-events-none z-50">
                        <svg className="w-full h-full overflow-visible">
                            <path
                                d={renderPath(currentPath.points)}
                                stroke="#000000"
                                strokeWidth={3}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                )}

                {/* Alignment Guide Lines (Figma-style) */}
                {alignGuides.length > 0 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-[100]" style={{ overflow: 'visible' }}>
                        {alignGuides.map((guide, i) => {
                            if (guide.type === 'v') {
                                return (
                                    <g key={`guide-${i}`}>
                                        {/* Main guide line */}
                                        <line
                                            x1={guide.pos} y1={guide.start - 20}
                                            x2={guide.pos} y2={guide.end + 20}
                                            stroke="#F24822" strokeWidth={0.5} strokeDasharray="4 2"
                                        />
                                        {/* Small diamond at endpoints */}
                                        <polygon
                                            points={`${guide.pos},${guide.start - 20 - 3} ${guide.pos + 3},${guide.start - 20} ${guide.pos},${guide.start - 20 + 3} ${guide.pos - 3},${guide.start - 20}`}
                                            fill="#F24822"
                                        />
                                        <polygon
                                            points={`${guide.pos},${guide.end + 20 - 3} ${guide.pos + 3},${guide.end + 20} ${guide.pos},${guide.end + 20 + 3} ${guide.pos - 3},${guide.end + 20}`}
                                            fill="#F24822"
                                        />
                                    </g>
                                );
                            } else {
                                return (
                                    <g key={`guide-${i}`}>
                                        {/* Main guide line */}
                                        <line
                                            x1={guide.start - 20} y1={guide.pos}
                                            x2={guide.end + 20} y2={guide.pos}
                                            stroke="#F24822" strokeWidth={0.5} strokeDasharray="4 2"
                                        />
                                        {/* Small diamond at endpoints */}
                                        <polygon
                                            points={`${guide.start - 20 - 3},${guide.pos} ${guide.start - 20},${guide.pos - 3} ${guide.start - 20 + 3},${guide.pos} ${guide.start - 20},${guide.pos + 3}`}
                                            fill="#F24822"
                                        />
                                        <polygon
                                            points={`${guide.end + 20 - 3},${guide.pos} ${guide.end + 20},${guide.pos - 3} ${guide.end + 20 + 3},${guide.pos} ${guide.end + 20},${guide.pos + 3}`}
                                            fill="#F24822"
                                        />
                                    </g>
                                );
                            }
                        })}
                    </svg>
                )}

                {/* Frame Drawing Preview */}
                {frameDrawBox && (
                    <div
                        className="absolute pointer-events-none z-50"
                        style={{
                            left: Math.min(frameDrawBox.startX, frameDrawBox.currentX),
                            top: Math.min(frameDrawBox.startY, frameDrawBox.currentY),
                            width: Math.abs(frameDrawBox.currentX - frameDrawBox.startX),
                            height: Math.abs(frameDrawBox.currentY - frameDrawBox.startY),
                            border: '2px dashed #3B82F6',
                            backgroundColor: 'rgba(59,130,246,0.05)',
                        }}
                    >
                        <div className="absolute -top-5 left-0 text-[10px] text-blue-500 font-medium flex items-center gap-1 whitespace-nowrap">
                            <Frame size={10} />
                            Frame {Math.round(Math.abs(frameDrawBox.currentX - frameDrawBox.startX))} × {Math.round(Math.abs(frameDrawBox.currentY - frameDrawBox.startY))}
                        </div>
                    </div>
                )}

                {/* Placeholder Content - Removed */}
                {elements.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {/* Content removed as per user request */}
                    </div>
                )}
            </div>

            <div
                ref={selectionBoxOverlayRef}
                data-testid="canvas-selection-box"
                className="pointer-events-none absolute z-[120] border border-blue-500 bg-blue-500/10"
                style={{ display: 'none' }}
            />

            {singleSelectionResizeOverlay && (
                <div
                    className="pointer-events-none absolute z-[118]"
                    style={{
                        left: singleSelectionResizeOverlay.left,
                        top: singleSelectionResizeOverlay.top,
                        width: singleSelectionResizeOverlay.width,
                        height: singleSelectionResizeOverlay.height,
                    }}
                >
                    {SCREENSPACE_RESIZE_EDGE_SPECS.map((edge) => (
                        <div
                            key={`${singleSelectionResizeOverlay.element.id}-edge-${edge.handle}`}
                            className="pointer-events-auto absolute bg-transparent"
                            style={{
                                ...edge.style,
                                cursor: edge.cursor,
                            }}
                            onMouseDown={(event) => handleScreenSpaceResizeStart(event, edge.handle, singleSelectionResizeOverlay.element)}
                        />
                    ))}
                    {SCREENSPACE_RESIZE_HANDLE_SPECS.map((handle) => (
                        <div
                            key={`${singleSelectionResizeOverlay.element.id}-handle-${handle.handle}`}
                            className="pointer-events-auto absolute flex items-center justify-center rounded-full"
                            style={{
                                ...handle.style,
                                width: SCREENSPACE_RESIZE_HIT_SIZE,
                                height: SCREENSPACE_RESIZE_HIT_SIZE,
                                cursor: handle.cursor,
                            }}
                            onMouseDown={(event) => handleScreenSpaceResizeStart(event, handle.handle, singleSelectionResizeOverlay.element)}
                        >
                            <div
                                className="rounded-full border border-blue-500 bg-white shadow-[0_1px_4px_rgba(37,99,235,0.28)]"
                                style={{
                                    width: SCREENSPACE_RESIZE_HANDLE_SIZE,
                                    height: SCREENSPACE_RESIZE_HANDLE_SIZE,
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Video Overlay Layer - rendered OUTSIDE the CSS transform container */}
            {elements.filter(el => !el.hidden && el.type === 'video' && el.content && activeVideoId === el.id).map(el => {
                const screenX = el.x * scale + pan.x;
                const screenY = el.y * scale + pan.y;
                const screenW = (el.width || 400) * scale;
                const screenH = (el.height || 300) * scale;
                return (
                    <div
                        key={`video-overlay-${el.id}`}
                        className="absolute z-[100] rounded-lg overflow-hidden shadow-2xl"
                        style={{
                            left: screenX,
                            top: screenY,
                            width: screenW,
                            height: screenH,
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <video
                            key={el.content}
                            src={el.content}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#111' }}
                            controls
                            autoPlay
                            loop
                            playsInline
                            preload="auto"
                        />
                        <button
                            className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                            onClick={() => setActiveVideoId(null)}
                            title="关闭播放"
                        >
                            ✕
                        </button>
                    </div>
                );
            })}

            {activeImagePreviewElement && activeImagePreviewMetrics && (
                <div
                    className="pointer-events-none absolute z-[105] overflow-hidden rounded-2xl border border-white/70 bg-white/94 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.24)] backdrop-blur"
                    style={{
                        left: activeImagePreviewMetrics.left,
                        top: activeImagePreviewMetrics.top,
                        width: activeImagePreviewMetrics.width,
                        height: activeImagePreviewMetrics.height,
                    }}
                >
                    <WorkbenchImage
                        content={activeImagePreviewElement.content}
                        displayPixels={Math.max(activeImagePreviewMetrics.width, activeImagePreviewMetrics.height) * 2}
                        canvasScale={1}
                        prioritizeDetail
                        alt="Image preview overlay"
                        containerClassName="h-full w-full overflow-hidden rounded-xl"
                        imageClassName="rounded-xl"
                        fit={activeImagePreviewElement.imageFit || 'contain'}
                        surfaceMode={activeImagePreviewElement.imageSurface || 'checker'}
                        loading="eager"
                        decoding="async"
                    />
                </div>
            )}

            {/* Right-click Context Menu */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-[200] bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 min-w-[180px] max-h-[calc(100vh-16px)] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
                    style={{ left: contextMenuAdjusted?.x ?? contextMenu.x, top: contextMenuAdjusted?.y ?? contextMenu.y }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    {contextTargetElement ? (
                        <>
                            <button onClick={handleContextCopySelection} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <span className="w-4 text-center text-gray-400">⎘</span>
                                复制
                                <span className="ml-auto text-xs text-gray-400">Ctrl+C</span>
                            </button>
                            <button onClick={handleContextCutSelection} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <span className="w-4 text-center text-gray-400">✂</span>
                                剪切
                                <span className="ml-auto text-xs text-gray-400">Ctrl+X</span>
                            </button>
                            <button
                                onClick={handleContextPaste}
                                disabled={!canPaste}
                                className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left ${canPaste ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                            >
                                <span className="w-4 text-center text-gray-400">⌘</span>
                                粘贴到此处
                                <span className="ml-auto text-xs text-gray-400">Ctrl+V</span>
                            </button>
                            <button onClick={handleContextDuplicate} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <span className="w-4 text-center text-gray-400">⊕</span>
                                创建副本
                                <span className="ml-auto text-xs text-gray-400">Ctrl+D</span>
                            </button>
                            {contextCanSendToChat && (
                                <button onClick={handleContextSendToChat} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                    <Send size={14} className="text-gray-400" />
                                    发送至对话
                                </button>
                            )}
                            <div className="h-px bg-gray-100 my-1" />
                            <button onClick={handleContextBringForward} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <span className="w-4 text-center text-gray-400">↑</span>
                                上移一层
                            </button>
                            <button onClick={handleContextSendBackward} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <span className="w-4 text-center text-gray-400">↓</span>
                                下移一层
                            </button>
                            <button onClick={handleContextBringToFront} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <span className="w-4 text-center text-gray-400">⇡</span>
                                移动至顶层
                            </button>
                            <button onClick={handleContextSendToBack} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <span className="w-4 text-center text-gray-400">⇣</span>
                                移动至底层
                            </button>
                            <div className="h-px bg-gray-100 my-1" />
                            {renderAlignmentMenuSection(contextTargetIds.length)}
                            {contextTargetIds.length === 1 && contextTargetElement?.type !== 'frame' && !!contextTargetElement?.content && onDownloadElement && (
                                (contextTargetElement.type === 'image' || contextTargetElement.type === 'video') ? (
                                    <div className="px-3 py-2">
                                        <ExportMenu
                                            kind={contextTargetElement.type === 'video' ? 'video' : 'image'}
                                            onSelect={(format) => { onDownloadElement(contextTargetElement, format); closeContextMenu(); }}
                                            className="w-full shadow-sm"
                                        />
                                    </div>
                                ) : (
                                    <button onClick={() => { onDownloadElement(contextTargetElement, 'original'); closeContextMenu(); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                        <Download size={14} className="text-gray-400" />
                                        导出
                                    </button>
                                )
                            )}
                            {contextCanGroup && (
                                <button onClick={handleContextGroup} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                    <Frame size={14} className="text-gray-400" />
                                    创建编组
                                </button>
                            )}
                            {contextCanUngroup && (
                                <button onClick={handleContextUngroup} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                    <Frame size={14} className="text-gray-400" />
                                    解除编组
                                </button>
                            )}
                            {contextCanMerge && (
                                <button onClick={handleContextMerge} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                    <Minus size={14} className="text-gray-400" />
                                    合并图层
                                </button>
                            )}
                            <button onClick={handleContextToggleHidden} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <span className="w-4 text-center text-gray-400">{contextAllHidden ? '◐' : '◌'}</span>
                                {contextAllHidden ? '显示' : '隐藏'}
                            </button>
                            <button onClick={handleContextToggleLocked} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                <span className="w-4 text-center text-gray-400">{contextAllLocked ? '🔓' : '🔒'}</span>
                                {contextAllLocked ? '解锁' : '锁定'}
                            </button>
                            <div className="h-px bg-gray-100 my-1" />
                            <button onClick={handleContextDeleteSelection} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors text-left">
                                <Trash2 size={14} className="text-red-400" />
                                删除
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={handleContextPaste}
                                disabled={!canPaste}
                                className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left ${canPaste ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                            >
                                <span className="w-4 text-center text-gray-400">⌘</span>
                                粘贴到此处
                                <span className="ml-auto text-xs text-gray-400">Ctrl+V</span>
                            </button>
                            {renderAlignmentMenuSection(selectedIds.length)}
                        </>
                    )}
                    {!contextTargetElement && <button onClick={handleContextImageUpload} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <ImageIcon size={14} className="text-gray-400" />
                        上传图片
                    </button>}
                    {!contextTargetElement && <button onClick={handleContextVideoUpload} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Video size={14} className="text-gray-400" />
                        上传视频
                    </button>}
                    {!contextTargetElement && <div className="h-px bg-gray-100 my-1" />}
                    {!contextTargetElement && <button onClick={handleContextImageGenerator} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Sparkles size={14} className="text-gray-400" />
                        图像生成器
                    </button>}
                    {!contextTargetElement && <button onClick={handleContextVideoGenerator} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Video size={14} className="text-gray-400" />
                        视频生成器
                    </button>}
                    {!contextTargetElement && <div className="h-px bg-gray-100 my-1" />}
                    {!contextTargetElement && <button onClick={handleContextAddText} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Type size={14} className="text-gray-400" />
                        添加文本
                        <span className="ml-auto text-xs text-gray-400">T</span>
                    </button>}
                    {!contextTargetElement && <button onClick={handleContextAddShape} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Square size={14} className="text-gray-400" />
                        添加形状
                    </button>}
                    {!contextTargetElement && <button onClick={handleContextAddMark} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <MapPin size={14} className="text-red-400" />
                        添加标记
                        <span className="ml-auto text-xs text-gray-400">M</span>
                    </button>}
                    {!contextTargetElement && <button onClick={handleContextAddFrame} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <Frame size={14} className="text-blue-400" />
                        添加画板
                        <span className="ml-auto text-xs text-gray-400">F</span>
                    </button>}
                    {!contextTargetElement && <div className="h-px bg-gray-100 my-1" />}
                    {!contextTargetElement && <button onClick={handleContextSelectAll} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <MousePointer2 size={14} className="text-gray-400" />
                        全选
                        <span className="ml-auto text-xs text-gray-400">Ctrl+A</span>
                    </button>}
                </div>
            )}

            {/* Minimap */}
            <CanvasMinimap
                elements={elements}
                scale={scale}
                pan={pan}
                viewportSize={viewportSize}
                selectedIds={selectedIds}
                onPanChange={onPanChange}
                onScaleChange={onScaleChange}
                rightOffset={minimapRightOffset}
            />

            {/* Hidden file inputs for context menu uploads */}
            <input ref={imageInputRef} type="file" className="hidden" accept="image/*" multiple aria-label="上传图片" onChange={e => { const files = e.target.files; if (files && files.length > 0 && onAddImage) onAddImage(Array.from(files)); e.target.value = ''; }} />
            <input ref={videoInputRef} type="file" className="hidden" accept="video/*" aria-label="上传视频" onChange={e => { const f = e.target.files?.[0]; if (f && onAddVideo) onAddVideo(f); e.target.value = ''; }} />
        </div >
    );
});
