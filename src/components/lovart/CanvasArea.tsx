import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AlignStartVertical, AlignEndVertical, AlignCenterHorizontal, AlignStartHorizontal, AlignEndHorizontal, AlignCenterVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter } from 'lucide-react';
import { isImageRef, getImageDataUrl } from '@/lib/editor-kernel';
import type { ElementHandlers } from './CanvasElementRenderer';
import { CanvasMinimap } from './CanvasMinimap';
import type { CanvasElement } from './canvas-types';
import type { AlignmentDirection, DistributionAxis, LayoutSelectionMode } from './canvas-alignment';
import { buildCanvasElementIndex } from './canvas-element-index';
import { buildCanvasRenderPlan } from './canvas-render-plan';
import { getTopElementAtCanvasPoint } from './canvas-hit-test';
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE, clampCanvasScale, computeFitViewport } from './canvas-viewport-utils';
import { useCanvasAlignGuides } from './CanvasAlignGuides';
import { canUseScreenSpaceResizeOverlayForElement } from './ScreenSpaceResizeOverlay';
import { CanvasContextMenu, useCanvasContextMenu } from './CanvasContextMenu';
import { resolveMediaPreviewElements, useImageHoverPreview } from './CanvasMediaOverlays';
import { useCanvasPointerInteraction } from './use-canvas-pointer-interaction';
import type { CanvasAreaDomains, CanvasRenderMetrics } from './canvas-area-domains';
import { useCanvasTestEventBridge } from './use-canvas-test-event-bridge';
import { useCanvasSelectionLayoutActions } from './use-canvas-selection-layout-actions';
import { useCanvasFrameActions } from './use-canvas-frame-actions';
import { CanvasAreaViewportOverlays } from './CanvasAreaOverlays';
import { CanvasAreaContentLayer } from './CanvasAreaContentLayer';
import { CanvasAreaHud } from './CanvasAreaHud';

function serializeRenderMetrics(metrics: CanvasRenderMetrics) {
    return JSON.stringify(metrics);
}

export const CanvasArea = React.memo(function CanvasArea({
    selection,
    view,
    elementCRUD,
    clipboard,
    layout,
    generator,
    media,
    editingTools,
    export: exportDomain,
    canvasSelectMode: canvasSelectModeDomain,
    storyboard,
    misc,
}: CanvasAreaDomains) {
    const { scale, pan, onPanChange, onScaleChange } = view;
    const { selectedIds, highlightedElementIds = [], onSelect, activeTool, onToolChange } = selection;
    const { elements, onElementChange, onBatchElementChange, onDelete, onAddElement } = elementCRUD;
    const { canPaste, onCopyElement, onCopySelection, onCutSelection, onPasteAt, onDuplicateSelection } = clipboard;
    const { onGroupSelection, onUngroupSelection, onMergeSelection, onBringForward, onSendBackward, onBringToFront, onSendToBack, onToggleElementsHidden, onToggleElementsLocked, onDeleteSelection } = layout;
    const { onOpenImageGenerator, onOpenVideoGenerator, onGenerateStoryboardSelection, onGenerateStoryboardVideoSelection, onExportStoryboardSelection, generatorSubmittingMap, highlightedResultId } = generator;
    const { projectReferenceImages, onUseProjectReferenceImage, onSaveAsProjectReference, onSaveSelectionAsProjectReference, onAddImage, onAddVideo } = media;
    const { onAiEditElement, onRecoverImageEditTask, onReplaceBackground, onMockupElement, onAnnotateImage, onCropImage, onSplitStoryboard, onStoryboardPlanFromImage } = editingTools;
    const { onDownloadElement, onSendSelectionToChat } = exportDomain;
    const { canvasSelectMode, onCanvasSelectPick, onCancelCanvasSelect } = canvasSelectModeDomain;
    const { onStoryboardSaved, storyboardAutoAdvanceEnabled = false } = storyboard;
    const { onDragStart, onDragEnd, onConnectFlow, onCanvasMouseMove, spatialIndex, minimapRightOffset, canvasTheme, resolvedImageSrcMap, onRenderMetricsChange } = misc;
    const MULTI_LAYOUT_GAP = 24;
    const ALIGN_GUIDE_FLASH_MS = 800;
    const selectionBoxOverlayRef = useRef<HTMLDivElement | null>(null);
    const lastRenderMetricsRef = useRef<string>('');

    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [editingMarkId, setEditingMarkId] = useState<string | null>(null);
    const [quickEditMarkId, setQuickEditMarkId] = useState<string | null>(null);
    const [quickEditPrompt, setQuickEditPrompt] = useState('');
    const highlightedElementIdSet = useMemo(() => new Set(highlightedElementIds), [highlightedElementIds]);
    const [showFramePresetMenu, setShowFramePresetMenu] = useState<string | null>(null); // element id
    const [showFrameExportMenu, setShowFrameExportMenu] = useState<string | null>(null); // element id for export dropdown
    const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
    const [activeImagePreviewId, setActiveImagePreviewId] = useState<string | null>(null);
    const [activeMediaPreviewIds, setActiveMediaPreviewIds] = useState<string[]>([]);
    const [activeMediaPreviewIndex, setActiveMediaPreviewIndex] = useState(0);
    const [editingFrameName, setEditingFrameName] = useState<string | null>(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [imageDetailRequestVersions, setImageDetailRequestVersions] = useState<Record<string, number>>({});

    const { alignGuides, flashAlignGuides, setAlignGuidesIfChanged } = useCanvasAlignGuides(ALIGN_GUIDE_FLASH_MS);

    const {
        applyElementChanges,
        getSelectedBounds,
        alignElements,
        distributeElements,
        equalSpacing,
        layoutSelection,
    } = useCanvasSelectionLayoutActions({
        elements,
        selectedIds,
        onElementChange,
        onBatchElementChange,
        flashAlignGuides,
        multiLayoutGap: MULTI_LAYOUT_GAP,
    });

    const {
        contextMenu,
        setContextMenu,
        contextMenuAdjusted,
        setContextMenuAdjusted,
        contextMenuRef,
        closeContextMenu,
    } = useCanvasContextMenu();
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const outerRef = useRef<HTMLDivElement>(null);
    const elementsContainerRef = useRef<HTMLDivElement>(null);

    const {
        scheduleAutoLayout,
        moveElementToFrame,
        addFrameAtPosition,
    } = useCanvasFrameActions({
        elements,
        onElementChange,
        onAddElement,
        onSelect,
        applyElementChanges,
    });

    useCanvasTestEventBridge({
        rootRef: outerRef,
        elements,
        moveElementToFrame,
        onElementChange,
        scheduleAutoLayout,
        addFrameAtPosition,
    });

    const visibleElementsRef = useRef<CanvasElement[]>([]);

    const requestImageDetailUpgrade = useCallback((elementId: string | null) => {
        if (!elementId) {
            return;
        }

        setImageDetailRequestVersions((previous) => ({
            ...previous,
            [elementId]: (previous[elementId] ?? 0) + 1,
        }));
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

    const isElementLocked = useCallback((element?: CanvasElement | null) => {
        if (!element) return false;
        return !!(element.locked || (element.type === 'frame' && element.frameLocked));
    }, []);

    const {
        isDragging, isResizing, resizingElementId, isPanning, isDrawing, isSelecting,
        frameDrawBox, currentPath, dragPreviewState, dropTargetFrameId,
        cancelInertia, commitPanChange,
        handleMouseDown, handleMouseDownStable, handleResizeStartStable,
        handleScreenSpaceResizeStart, handleMouseMove,
        handleToolbarSelectionMouseDownCapture,
        handleToolbarSelectionPointerDownCapture,
        handleToolbarSelectionClickCapture,
    } = useCanvasPointerInteraction({
        scale, pan, onPanChange, elements, selectedIds, activeTool, onToolChange,
        onSelect, onElementChange, onBatchElementChange, onAddElement,
        onDragStart, onDragEnd, onDuplicateSelection, onCanvasMouseMove,
        outerRef, selectionBoxOverlayRef, visibleElementsRef,
        setAlignGuidesIfChanged, scheduleAutoLayout, moveElementToFrame,
        requestImageDetailUpgrade, isElementLocked,
        activeVideoId, setActiveVideoId, setEditingTextId,
        setQuickEditMarkId, setQuickEditPrompt,
    });

    const getTopElementAtPoint = useCallback((x: number, y: number) => (
        getTopElementAtCanvasPoint(elements, x, y)
    ), [elements]);

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


    const selectedElement = elements.find(el => selectedIds.includes(el.id)); // For context toolbar (just show first for now)

    // ── Fit single element into viewport (double-click zoom) ──
    const fitViewportToBounds = useCallback((bounds: { minX: number; minY: number; width: number; height: number }, maxScale = 2.5) => {
        const viewportWidth = viewportSize.width || outerRef.current?.clientWidth || window.innerWidth;
        const viewportHeight = viewportSize.height || outerRef.current?.clientHeight || window.innerHeight;
        const nextViewport = computeFitViewport({
            bounds,
            viewportSize: { width: viewportWidth, height: viewportHeight },
            minScale: CANVAS_MIN_SCALE,
            maxScale: CANVAS_MAX_SCALE,
            maxFitScale: maxScale,
            padding: 80,
        });
        onScaleChange(nextViewport.scale);
        commitPanChange(nextViewport.pan);
    }, [commitPanChange, onScaleChange, viewportSize.height, viewportSize.width]);

    const fitToElement = useCallback((el: CanvasElement) => {
        fitViewportToBounds({
            minX: el.x,
            minY: el.y,
            width: el.width || 300,
            height: el.height || 300,
        });
    }, [fitViewportToBounds]);

    const imageHoverPreviewTimerRef = useRef<number | null>(null);
    const isImageHoverPreviewSuppressed = !!contextMenu || activeMediaPreviewIds.length > 0;
    const clearImageHoverPreviewTimer = useCallback(() => {
        if (imageHoverPreviewTimerRef.current !== null) {
            window.clearTimeout(imageHoverPreviewTimerRef.current);
            imageHoverPreviewTimerRef.current = null;
        }
    }, []);

    const setActiveImagePreviewIdFromHover = useCallback((id: string | null) => {
        clearImageHoverPreviewTimer();

        if (isImageHoverPreviewSuppressed || id === null) {
            setActiveImagePreviewId((current) => current === null ? current : null);
            return;
        }

        imageHoverPreviewTimerRef.current = window.setTimeout(() => {
            setActiveImagePreviewId((current) => current === id ? current : id);
            imageHoverPreviewTimerRef.current = null;
        }, 90);
    }, [clearImageHoverPreviewTimer, isImageHoverPreviewSuppressed]);

    useEffect(() => {
        if (!isImageHoverPreviewSuppressed) {
            return;
        }

        clearImageHoverPreviewTimer();
        setActiveImagePreviewId((current) => current === null ? current : null);
    }, [clearImageHoverPreviewTimer, isImageHoverPreviewSuppressed]);

    useEffect(() => () => clearImageHoverPreviewTimer(), [clearImageHoverPreviewTimer]);

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
        setActiveImagePreviewId: setActiveImagePreviewIdFromHover,
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
        setActiveImagePreviewIdFromHover,
    ]);
    const elementHandlersRef = useRef<ElementHandlers>(elementHandlers);

    useEffect(() => {
        elementHandlersRef.current = elementHandlers;
    }, [elementHandlers]);

    const {
        element: activeImagePreviewElement,
        metrics: activeImagePreviewMetrics,
    } = useImageHoverPreview({
        elements,
        activeImagePreviewId,
        scale,
        pan,
        viewportSize,
        disabled: isImageHoverPreviewSuppressed,
    });

    const activeMediaPreviewElements = useMemo(() => (
        activeMediaPreviewIds
            .map((id) => elements.find((element) => element.id === id && !element.hidden && !!element.content && (element.type === 'image' || element.type === 'video')))
            .filter((element): element is CanvasElement => !!element)
    ), [activeMediaPreviewIds, elements]);

    const activeMediaPreviewItems = useMemo(() => (
        activeMediaPreviewElements.map((element) => ({
            element,
            resolvedImageSrc: element.type === 'image' ? resolvedImageSrcMap?.[element.id] : undefined,
        }))
    ), [activeMediaPreviewElements, resolvedImageSrcMap]);

    useEffect(() => {
        if (activeMediaPreviewIds.length === 0) {
            return;
        }

        if (activeMediaPreviewElements.length === 0) {
            setActiveMediaPreviewIds([]);
            setActiveMediaPreviewIndex(0);
            return;
        }

        const nextIds = activeMediaPreviewElements.map((element) => element.id);
        if (nextIds.length !== activeMediaPreviewIds.length || nextIds.some((id, index) => id !== activeMediaPreviewIds[index])) {
            setActiveMediaPreviewIds(nextIds);
        }

        if (activeMediaPreviewIndex >= nextIds.length) {
            setActiveMediaPreviewIndex(nextIds.length - 1);
        }
    }, [activeMediaPreviewElements, activeMediaPreviewIds, activeMediaPreviewIndex]);

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
            const newScale = clampCanvasScale(scale * zoomFactor);
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
    }, [scale, pan, onScaleChange, commitPanChange, cancelInertia]);

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
        clearImageHoverPreviewTimer();
        setActiveImagePreviewId((current) => current === null ? current : null);
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
    }, [clearImageHoverPreviewTimer, getTopElementAtPoint, onSelect, pan, scale, selectedIds, setContextMenu, setContextMenuAdjusted]);

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

    // ═══ Element index for O(1) lookups and render classifications ═══
    const {
        elementMap,
        connectorElements,
        frameChildCounts,
        hiddenElementIds,
    } = useMemo(() => buildCanvasElementIndex(elements), [elements]);

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
    const contextPreviewElements = useMemo(() => resolveMediaPreviewElements(contextTargetElements), [contextTargetElements]);
    const contextCanPreview = contextPreviewElements.length > 0;
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

    const handleContextPreview = useCallback(() => {
        if (!contextCanPreview) return;

        setActiveVideoId(null);
        setActiveImagePreviewId(null);
        setActiveMediaPreviewIds(contextPreviewElements.map((element) => element.id));
        setActiveMediaPreviewIndex(0);
        closeContextMenu();
    }, [closeContextMenu, contextCanPreview, contextPreviewElements]);

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

    // ═══ Viewport culling + virtualization for large canvas performance ═══
    // 视口外元素按缩放动态裁剪；交互中进一步收紧节点上限，减少大画布掉帧。
    const viewportRenderPlan = useMemo(() => buildCanvasRenderPlan({
        elements,
        selectedIds,
        pan,
        scale,
        viewportSize,
        spatialIndex,
        isDragging,
        isPanning,
        isResizing,
        isSelecting,
    }), [elements, isDragging, isPanning, isResizing, isSelecting, pan, scale, selectedIds, spatialIndex, viewportSize]);

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

    const visibleConnectorElements = useMemo(() => {
        const visibleElementIds = new Set(visibleElements.map((element) => element.id));
        return connectorElements.filter((connector) => visibleElementIds.has(connector.id));
    }, [connectorElements, visibleElements]);

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
            className={`canvas-area-surface w-full h-full relative overflow-hidden ${canvasSelectMode ? 'cursor-crosshair' : activeTool === 'hand' ? 'cursor-grab active:cursor-grabbing' : activeTool === 'draw' ? 'cursor-crosshair' : activeTool === 'mark' ? 'cursor-crosshair' : activeTool === 'frame' ? 'cursor-crosshair' : ''}`}
            onMouseMove={handleMouseMove}
            onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
            onDragStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onMouseDown={(e) => {
                setShowFramePresetMenu(null);
                setShowFrameExportMenu(null);
                if (canvasSelectMode && e.button === 0) {
                    // Clicking empty space cancels canvas select mode
                    onCancelCanvasSelect?.();
                    return;
                }
                handleMouseDown(e, null);
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
            <CanvasAreaHud
                {...{
                    canvasSelectMode, onCancelCanvasSelect, hiddenElementIds, onToggleElementsHidden,
                    selectedIds, selectedElement, scale, pan, isDragging, isResizing, isPanning,
                    isDrawing, isSelecting, storyboardAutoAdvanceEnabled, projectReferenceImages,
                    alignmentActions, distributionActions, equalSpacingActions, layoutSelectionActions,
                    canGenerateStoryboardBatch, canGenerateStoryboardVideoBatch, multiStoryboardGenerateIds,
                    multiCanUngroup, multiCanMerge, multiCanSendToChat, multiReferenceCandidateCount,
                    multiAllHidden, multiAllLocked, onElementChange, onStoryboardSaved, onDelete,
                    onCopyElement, onDownloadElement, onUseProjectReferenceImage, onSaveAsProjectReference,
                    onSendSelectionToChat, onToggleElementsLocked, onAiEditElement, onRecoverImageEditTask,
                    onReplaceBackground, onMockupElement, onAnnotateImage, onCropImage, onSplitStoryboard,
                    onStoryboardPlanFromImage, onConnectFlow, onExportStoryboardSelection,
                    onGenerateStoryboardSelection, onGenerateStoryboardVideoSelection, onGroupSelection,
                    onUngroupSelection, onMergeSelection, onSaveSelectionAsProjectReference,
                }}
                canExportStoryboardSelection={multiReferenceCandidateCount >= 2 && !!onExportStoryboardSelection}
                canFocusSelection={!!multiSelectionBounds}
                onPointerDownCapture={handleToolbarSelectionPointerDownCapture}
                onMouseDownCapture={handleToolbarSelectionMouseDownCapture}
                onClickCapture={handleToolbarSelectionClickCapture}
                onAlign={alignElements}
                onDistribute={distributeElements}
                onEqualSpacing={equalSpacing}
                onLayoutSelection={layoutSelection}
                onFocusSelection={focusSelection}
                onDeleteSelection={deleteSelectionByIds}
            />

            <CanvasAreaContentLayer
                {...{
                    containerRef, elementsContainerRef, pan, scale, connectorElements: visibleConnectorElements, elementMap,
                    renderElements, elements, selectedIds, activeTool, canvasSelectMode, dragPreviewState,
                    dropTargetFrameId, editingTextId, editingFrameName, editingMarkId, quickEditMarkId,
                    quickEditPrompt, showFramePresetMenu, showFrameExportMenu, canGenerateFromImage,
                    frameChildCounts, generatorSubmittingMap, highlightedResultId, highlightedElementIdSet,
                    isDragging, isResizing, resizingElementId, isDrawing, isSelecting, imageDetailRequestVersions,
                    renderZIndexById, resolvedImageSrcMap, multiReferenceCandidateCount, multiSelectionBounds,
                    multiSelectionPreviewOffset, currentPath, alignGuides, frameDrawBox, elementHandlersRef,
                }}
            />

            <CanvasAreaViewportOverlays
                selectionBoxOverlayRef={selectionBoxOverlayRef}
                singleSelectionResizeOverlay={singleSelectionResizeOverlay}
                onResizeStart={handleScreenSpaceResizeStart}
                elements={elements}
                activeVideoId={activeVideoId}
                scale={scale}
                pan={pan}
                onCloseVideo={() => setActiveVideoId(null)}
                activeImagePreviewElement={activeMediaPreviewItems.length > 0 ? null : activeImagePreviewElement}
                activeImagePreviewMetrics={activeMediaPreviewItems.length > 0 ? null : activeImagePreviewMetrics}
                activeImagePreviewResolvedSrc={activeMediaPreviewItems.length === 0 && activeImagePreviewElement ? resolvedImageSrcMap?.[activeImagePreviewElement.id] : undefined}
                activeMediaPreviewItems={activeMediaPreviewItems}
                activeMediaPreviewIndex={activeMediaPreviewIndex}
                onActiveMediaPreviewIndexChange={setActiveMediaPreviewIndex}
                onCloseMediaPreview={() => {
                    setActiveMediaPreviewIds([]);
                    setActiveMediaPreviewIndex(0);
                }}
            />

            {/* Right-click Context Menu */}
            {contextMenu && (
                <CanvasContextMenu
                    contextMenu={contextMenu}
                    adjustedPosition={contextMenuAdjusted}
                    menuRef={contextMenuRef}
                    contextTargetElement={contextTargetElement}
                    contextTargetIds={contextTargetIds}
                    selectedCount={contextTargetIds.length}
                    canPaste={canPaste}
                    contextAllHidden={contextAllHidden}
                    contextAllLocked={contextAllLocked}
                    contextCanSendToChat={contextCanSendToChat}
                    contextCanPreview={contextCanPreview}
                    contextCanGroup={contextCanGroup}
                    contextCanUngroup={contextCanUngroup}
                    contextCanMerge={contextCanMerge}
                    onContextCopySelection={handleContextCopySelection}
                    onContextCutSelection={handleContextCutSelection}
                    onContextPaste={handleContextPaste}
                    onContextPreview={handleContextPreview}
                    onContextDuplicate={handleContextDuplicate}
                    onContextSendToChat={handleContextSendToChat}
                    onContextBringForward={handleContextBringForward}
                    onContextSendBackward={handleContextSendBackward}
                    onContextBringToFront={handleContextBringToFront}
                    onContextSendToBack={handleContextSendToBack}
                    onContextGroup={handleContextGroup}
                    onContextUngroup={handleContextUngroup}
                    onContextMerge={handleContextMerge}
                    onContextToggleHidden={handleContextToggleHidden}
                    onContextToggleLocked={handleContextToggleLocked}
                    onContextDeleteSelection={handleContextDeleteSelection}
                    onContextImageUpload={handleContextImageUpload}
                    onContextVideoUpload={handleContextVideoUpload}
                    onContextImageGenerator={handleContextImageGenerator}
                    onContextVideoGenerator={handleContextVideoGenerator}
                    onContextAddText={handleContextAddText}
                    onContextAddShape={handleContextAddShape}
                    onContextAddMark={handleContextAddMark}
                    onContextAddFrame={handleContextAddFrame}
                    onContextSelectAll={handleContextSelectAll}
                    onDownloadElement={onDownloadElement}
                    onClose={closeContextMenu}
                    renderAlignmentMenuSection={(selectionCount) => renderAlignmentMenuSection(contextTargetElement ? selectionCount : selectedIds.length)}
                />
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
                canvasTheme={canvasTheme}
            />

            {/* Hidden file inputs for context menu uploads */}
            <input ref={imageInputRef} type="file" className="hidden" accept="image/*" multiple aria-label="上传图片" onChange={e => { const files = e.target.files; if (files && files.length > 0 && onAddImage) onAddImage(Array.from(files)); e.target.value = ''; }} />
            <input ref={videoInputRef} type="file" className="hidden" accept="video/*" aria-label="上传视频" onChange={e => { const f = e.target.files?.[0]; if (f && onAddVideo) onAddVideo(f); e.target.value = ''; }} />
        </div >
    );
});
