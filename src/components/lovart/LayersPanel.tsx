"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers3, Search } from 'lucide-react';
import { PanelShell, PanelBadge } from './PanelShell';
import layersPanelTestEvents from '@/lib/testing/layers-panel-test-events.json';
import type { StoryboardMetaTemplateEntry, StoryboardMetaTemplateValue } from '@/lib/storyboard-meta-presets';
import { parseStoryboardShotCode, validateStoryboardDuration } from '@/lib/storyboard-utils';
import type { CanvasElement } from './canvas-types';
import {
    getLayerLabel,
    LayerTreeBuilder,
    type FlattenedLayerRow,
    type LayerFilterType,
    type LayerSortMode,
    type StoryboardAuditFilter,
} from './layers-tree-model';
import {
    buildLayerDragHintLabel,
    buildLayerDragPayload,
    canApplyLayerDropReorder,
    canApplyLayerTestReorder,
    getLayerDropPlacement,
    normalizeLayerMoveToParentDetail,
    normalizeLayerReorderDetail,
    readLayerDragIds,
    type LayerDropIndicator,
    type LayerParentDropTarget,
    type LayersPanelMoveToParentDetail,
    type LayersPanelReorderDetail,
} from './layers-dnd-model';
import { LayerBulkOperations } from './LayerBulkOperations';
import { LayerRow } from './LayerRow';
import { isElementLocked, validateStoryboardPrefix } from './layers-panel-utils';
import { useDragAutoScroll } from './use-drag-auto-scroll';
import { useStoryboardDrafts } from './use-storyboard-drafts';
import { useStoryboardTemplates } from './use-storyboard-templates';

interface LayersPanelProps {
    elements: CanvasElement[];
    selectedIds: string[];
    highlightedIds?: string[];
    storyboardAuditFilter?: StoryboardAuditFilter;
    storyboardNavigationScope?: StoryboardNavigationScope;
    storyboardAutoAdvanceEnabled?: boolean;
    onStoryboardAuditFilterChange?: (filter: StoryboardAuditFilter) => void;
    onSelect: (ids: string[]) => void;
    onLocate: (id: string) => void;
    onRenameElement: (id: string, attrs: Partial<CanvasElement>) => void;
    onMoveLayerToParent: (draggedIds: string[], parentId?: string) => void;
    onToggleHidden: (ids: string[]) => void;
    onToggleLocked: (ids: string[]) => void;
    onBringForward: (ids: string[]) => void;
    onSendBackward: (ids: string[]) => void;
    onBringToFront: (ids: string[]) => void;
    onSendToBack: (ids: string[]) => void;
    onReorderLayer: (draggedIds: string[], targetId: string, placement: 'before' | 'after') => void;
    onDeleteSelection: (ids: string[]) => void;
    historySummary?: {
        lastAction: string;
        patchCount: number;
        canUndo: boolean;
        canRedo: boolean;
    };
    historyTimeline?: Array<{
        id: number;
        label: string;
        timestamp: number;
        active: boolean;
    }>;
    onClose?: () => void;
}

type StoryboardNavigationScope = 'issues' | 'invalid' | 'partial' | 'untracked';

const TEST_MOVE_TO_PARENT_EVENT = layersPanelTestEvents.moveToParentEvent;
const TEST_REORDER_EVENT = layersPanelTestEvents.reorderEvent;

function LayerVirtualList({
    scrollContainerRef,
    draggingId,
    parentDropTarget,
    dragHintLabel,
    filteredRowsState,
    flattenedRowCount,
    visibleRows,
    onRootDragOver,
    onRootDragLeave,
    onRootDrop,
    renderRow,
}: {
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    draggingId: string | null;
    parentDropTarget: string | 'root' | null;
    dragHintLabel: string;
    filteredRowsState: { rows: FlattenedLayerRow[]; totalHeight: number };
    flattenedRowCount: number;
    visibleRows: FlattenedLayerRow[];
    onRootDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
    onRootDragLeave: () => void;
    onRootDrop: (event: React.DragEvent<HTMLDivElement>) => void;
    renderRow: (row: FlattenedLayerRow) => React.ReactNode;
}) {
    return (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-2 py-1.5">
            <div
                data-testid="layers-root-drop-zone"
                className={`mb-1 rounded-md border border-dashed px-2.5 py-1.5 text-[10px] font-medium transition-all ${draggingId ? 'border-slate-300 bg-slate-50 text-slate-500' : 'border-transparent bg-transparent text-transparent h-0 overflow-hidden p-0 mb-0'} ${parentDropTarget === 'root' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''}`}
                onDragOver={onRootDragOver}
                onDragLeave={onRootDragLeave}
                onDrop={onRootDrop}
            >
                拖到这里移出画板
            </div>
            {draggingId && (
                <div className="sticky top-0 z-10 mb-1 rounded-md border border-blue-200 bg-blue-50/95 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 shadow-sm backdrop-blur-sm" data-testid="layers-drag-hint">
                    {dragHintLabel}
                </div>
            )}
            {filteredRowsState.rows.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                        <Layers3 size={16} />
                    </div>
                    <div className="mt-2 text-[12px] font-medium text-slate-700">{flattenedRowCount === 0 ? '画布还没有可管理的图层' : '当前筛选没有匹配图层'}</div>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">{flattenedRowCount === 0 ? '添加形状、图片或画板后，这里会自动显示层级结构。' : '可以尝试修改搜索词或切换筛选类型。'}</p>
                </div>
            ) : (
                <div className="relative" style={{ height: `${filteredRowsState.totalHeight}px` }}>
                    {visibleRows.map((row) => renderRow(row))}
                </div>
            )}
        </div>
    );
}

export function LayersPanel({
    elements,
    selectedIds,
    highlightedIds = [],
    storyboardAuditFilter: externalStoryboardAuditFilter,
    onSelect,
    onLocate,
    onRenameElement,
    onMoveLayerToParent,
    onToggleHidden,
    onToggleLocked,
    onBringForward,
    onSendBackward,
    onBringToFront,
    onSendToBack,
    onReorderLayer,
    onDeleteSelection,
    historySummary,
    historyTimeline = [],
    onClose,
}: LayersPanelProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const elementsById = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);
    const highlightedIdSet = useMemo(() => new Set(highlightedIds), [highlightedIds]);
    const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
    const [editingNameId, setEditingNameId] = useState<string | null>(null);
    const [editingNameValue, setEditingNameValue] = useState('');
    const [bulkRenameOpen, setBulkRenameOpen] = useState(false);
    const [bulkRenameValue, setBulkRenameValue] = useState('');
    const [bulkRenameStart, setBulkRenameStart] = useState(1);
    const [bulkStoryboardOpen, setBulkStoryboardOpen] = useState(false);
    const [bulkStoryboardPrefix, setBulkStoryboardPrefix] = useState('A');
    const [bulkStoryboardStart, setBulkStoryboardStart] = useState(1);
    const [bulkStoryboardDigits, setBulkStoryboardDigits] = useState(2);
    const [bulkStoryboardStep, setBulkStoryboardStep] = useState(1);
    const [bulkStoryboardSkipExisting, setBulkStoryboardSkipExisting] = useState(false);
    const [bulkStoryboardAvoidExistingNumbers, setBulkStoryboardAvoidExistingNumbers] = useState(true);
    const [bulkStoryboardMetaOpen, setBulkStoryboardMetaOpen] = useState(false);
    const [bulkStoryboardSceneType, setBulkStoryboardSceneType] = useState('');
    const [bulkStoryboardCameraMove, setBulkStoryboardCameraMove] = useState('');
    const [bulkStoryboardDuration, setBulkStoryboardDuration] = useState('');
    const [bulkStoryboardNote, setBulkStoryboardNote] = useState('');
    const [layerQuery, setLayerQuery] = useState('');
    const [layerFilterType, setLayerFilterType] = useState<LayerFilterType>('all');
    const [layerSortMode, setLayerSortMode] = useState<LayerSortMode>('canvas');
    const [storyboardOnly, setStoryboardOnly] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<LayerDropIndicator | null>(null);
    const [parentDropTarget, setParentDropTarget] = useState<LayerParentDropTarget>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const { updateDragAutoScroll, resetDragAutoScroll } = useDragAutoScroll(scrollContainerRef, draggingId);
    const {
        getStoryboardDraft,
        updateStoryboardDraft,
        commitStoryboardDraft,
        resetStoryboardDraft,
    } = useStoryboardDrafts({ onRenameElement });
    const getBulkStoryboardTemplateValue = useCallback(() => ({
        storyboardSceneType: bulkStoryboardSceneType,
        storyboardCameraMove: bulkStoryboardCameraMove,
        storyboardDuration: bulkStoryboardDuration,
        storyboardNote: bulkStoryboardNote,
    }), [bulkStoryboardCameraMove, bulkStoryboardDuration, bulkStoryboardNote, bulkStoryboardSceneType]);
    const loadBulkStoryboardTemplate = useCallback((template: StoryboardMetaTemplateEntry) => {
        setBulkStoryboardSceneType(template.value.storyboardSceneType || '');
        setBulkStoryboardCameraMove(template.value.storyboardCameraMove || '');
        setBulkStoryboardDuration(template.value.storyboardDuration || '');
        setBulkStoryboardNote(template.value.storyboardNote || '');
    }, []);
    const {
        storyboardTemplates,
        storyboardTemplateName,
        setStoryboardTemplateName,
        storyboardTemplateHint,
        saveCurrentStoryboardTemplate,
        loadStoryboardTemplate,
        deleteStoryboardTemplate,
        resetStoryboardTemplateForm,
    } = useStoryboardTemplates({
        getTemplateValue: getBulkStoryboardTemplateValue,
        onLoadTemplate: loadBulkStoryboardTemplate,
    });
    const bulkStoryboardPrefixError = useMemo(() => validateStoryboardPrefix(bulkStoryboardPrefix), [bulkStoryboardPrefix]);
    const bulkStoryboardDurationError = useMemo(() => validateStoryboardDuration(bulkStoryboardDuration), [bulkStoryboardDuration]);
    const effectiveStoryboardAuditFilter = externalStoryboardAuditFilter ?? 'all';

    const layerTree = useMemo(() => LayerTreeBuilder.buildTree(elements), [elements]);

    const flattenedRows = useMemo(() => LayerTreeBuilder.flattenRows({
        layerTree,
        expandedMap,
        selectedIdSet,
        draggingId,
    }), [draggingId, expandedMap, layerTree, selectedIdSet]);

    const filteredRowsState = useMemo(() => LayerTreeBuilder.filterRows({
        flattenedRows: flattenedRows.rows,
        layerQuery,
        layerFilterType,
        layerSortMode,
        storyboardOnly,
        storyboardAuditFilter: effectiveStoryboardAuditFilter,
    }), [effectiveStoryboardAuditFilter, flattenedRows.rows, layerFilterType, layerQuery, layerSortMode, storyboardOnly]);

    const visibleRows = useMemo(
        () => LayerTreeBuilder.visibleRows(filteredRowsState.rows, scrollTop, viewportHeight),
        [filteredRowsState.rows, scrollTop, viewportHeight],
    );

    useEffect(() => {
        const targetId = highlightedIds[0];
        const container = scrollContainerRef.current;
        if (!targetId || !container) return;
        const targetRow = filteredRowsState.rows.find((row) => row.element.id === targetId);
        if (!targetRow) return;

        const nextTop = Math.max(0, targetRow.top - Math.max(24, container.clientHeight * 0.25));
        container.scrollTo({ top: nextTop, behavior: 'smooth' });
    }, [filteredRowsState.rows, highlightedIds]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const syncViewport = () => {
            setViewportHeight(container.clientHeight);
            setScrollTop(container.scrollTop);
        };

        syncViewport();
        container.addEventListener('scroll', syncViewport, { passive: true });
        window.addEventListener('resize', syncViewport);
        return () => {
            container.removeEventListener('scroll', syncViewport);
            window.removeEventListener('resize', syncViewport);
        };
    }, []);

    const layerCount = useMemo(() => elements.filter((element) => element.type !== 'connector').length, [elements]);
    const selectedElements = useMemo(() => elements.filter((element) => selectedIdSet.has(element.id)), [elements, selectedIdSet]);
    const selectedHidden = selectedElements.length > 0 && selectedElements.every((element) => !!element.hidden);
    const selectedLocked = selectedElements.length > 0 && selectedElements.every((element) => isElementLocked(element));
    const selectedParentSummary = useMemo(() => {
        if (selectedElements.length === 0) return '未选择图层';
        const parentIds = Array.from(new Set(selectedElements.map((element) => element.parentFrameId || '__root__')));
        if (parentIds.length > 1) return '跨多个层级';
        if (parentIds[0] === '__root__') return '当前位于根层级';
        const parent = elementsById.get(parentIds[0]);
        return `当前位于“${parent ? getLayerLabel(parent) : '画板'}”`;
    }, [elementsById, selectedElements]);

    const bulkRenameTargets = useMemo(() => (
        filteredRowsState.rows
            .map((row) => row.element)
                .filter((element) => selectedIdSet.has(element.id))
    ), [filteredRowsState.rows, selectedIdSet]);

    const bulkStoryboardTargets = useMemo(() => (
        filteredRowsState.rows
            .map((row) => row.element)
                .filter((element) => selectedIdSet.has(element.id) && element.type === 'image')
            ), [filteredRowsState.rows, selectedIdSet]);

    const draggingElement = useMemo(
        () => draggingId ? elementsById.get(draggingId) || null : null,
        [draggingId, elementsById],
    );

    const openBulkRenamePanel = useCallback(() => {
        setBulkRenameValue('');
        setBulkRenameStart(1);
        setBulkRenameOpen(true);
    }, []);

    const openBulkStoryboardNumberingPanel = useCallback(() => {
        setBulkStoryboardPrefix('A');
        setBulkStoryboardStart(1);
        setBulkStoryboardDigits(2);
        setBulkStoryboardStep(1);
        setBulkStoryboardSkipExisting(false);
        setBulkStoryboardAvoidExistingNumbers(true);
        setBulkStoryboardOpen(true);
    }, []);

    const openBulkStoryboardMetaPanel = useCallback(() => {
        setBulkStoryboardSceneType('');
        setBulkStoryboardCameraMove('');
        setBulkStoryboardDuration('');
        setBulkStoryboardNote('');
        resetStoryboardTemplateForm();
        setBulkStoryboardMetaOpen(true);
    }, [resetStoryboardTemplateForm]);

    const cancelBulkRename = useCallback(() => {
        setBulkRenameOpen(false);
        setBulkRenameValue('');
        setBulkRenameStart(1);
    }, []);

    const cancelBulkStoryboardNumbering = useCallback(() => {
        setBulkStoryboardOpen(false);
        setBulkStoryboardPrefix('A');
        setBulkStoryboardStart(1);
        setBulkStoryboardDigits(2);
        setBulkStoryboardStep(1);
        setBulkStoryboardSkipExisting(false);
        setBulkStoryboardAvoidExistingNumbers(true);
    }, []);

    const cancelBulkStoryboardMeta = useCallback(() => {
        setBulkStoryboardMetaOpen(false);
        setBulkStoryboardSceneType('');
        setBulkStoryboardCameraMove('');
        setBulkStoryboardDuration('');
        setBulkStoryboardNote('');
    }, []);
    const draggingSelectionIds = useMemo(() => {
        if (!draggingId) return [];
        return selectedIdSet.has(draggingId) && selectedIds.length > 1 ? selectedIds : [draggingId];
    }, [draggingId, selectedIdSet, selectedIds]);
    const dragHintLabel = useMemo(() => {
        return buildLayerDragHintLabel({
            draggingId,
            parentDropTarget,
            dropIndicator,
            draggedCount: draggingSelectionIds.length,
            getLabel: (id) => {
                const target = elementsById.get(id);
                return target ? getLayerLabel(target) : null;
            },
        });
    }, [draggingId, draggingSelectionIds.length, dropIndicator, elementsById, parentDropTarget]);

    const toggleExpanded = (id: string) => {
        setExpandedMap((prev) => ({
            ...prev,
            [id]: !(prev[id] ?? true),
        }));
    };

    const startRename = (element: CanvasElement) => {
        setEditingNameId(element.id);
        if (element.type === 'frame') {
            setEditingNameValue(element.frameName?.trim() || '');
            return;
        }

        setEditingNameValue(element.displayName?.trim() || '');
    };

    const commitRename = () => {
        if (!editingNameId) return;
        const nextValue = editingNameValue.trim();
        const element = elementsById.get(editingNameId);
        if (element?.type === 'frame') {
            onRenameElement(editingNameId, { frameName: nextValue || undefined });
        } else {
            onRenameElement(editingNameId, { displayName: nextValue || undefined });
        }
        setEditingNameId(null);
        setEditingNameValue('');
    };

    const commitBulkRename = () => {
        const prefix = bulkRenameValue.trim();
        if (!prefix || bulkRenameTargets.length <= 1) return;

        const startIndex = Math.max(1, Math.round(Number.isFinite(bulkRenameStart) ? bulkRenameStart : 1));

        bulkRenameTargets.forEach((element, index) => {
            const nextName = `${prefix} ${String(startIndex + index).padStart(2, '0')}`;
            if (element.type === 'frame') {
                onRenameElement(element.id, { frameName: nextName });
            } else {
                onRenameElement(element.id, { displayName: nextName });
            }
        });

        setBulkRenameOpen(false);
        setBulkRenameValue('');
        setBulkRenameStart(1);
    };

    const commitBulkStoryboardNumbering = () => {
        if (bulkStoryboardTargets.length <= 1) return;
        if (bulkStoryboardPrefixError) return;

        const prefix = bulkStoryboardPrefix.trim().toUpperCase();
        const startIndex = Math.max(1, Math.round(Number.isFinite(bulkStoryboardStart) ? bulkStoryboardStart : 1));
        const digits = Math.max(1, Math.min(6, Math.round(Number.isFinite(bulkStoryboardDigits) ? bulkStoryboardDigits : 2)));
        const step = Math.max(1, Math.min(999, Math.round(Number.isFinite(bulkStoryboardStep) ? bulkStoryboardStep : 1)));
        const usedNumbers = new Set(
            bulkStoryboardTargets
                .map((element) => parseStoryboardShotCode(element.storyboardShotCode))
                .filter((item): item is NonNullable<ReturnType<typeof parseStoryboardShotCode>> => !!item)
                .filter((item) => item.prefix === prefix && !item.suffix)
                .map((item) => item.number),
        );

        let nextNumber = startIndex;

        bulkStoryboardTargets.forEach((element) => {
            if (bulkStoryboardSkipExisting && element.storyboardShotCode?.trim()) {
                return;
            }

            while (bulkStoryboardAvoidExistingNumbers && usedNumbers.has(nextNumber)) {
                nextNumber += step;
            }

            const serial = String(nextNumber).padStart(digits, '0');
            usedNumbers.add(nextNumber);
            nextNumber += step;
            onRenameElement(element.id, {
                storyboardShotCode: `${prefix}${serial}`,
            });
        });

        setBulkStoryboardOpen(false);
        setBulkStoryboardPrefix('A');
        setBulkStoryboardStart(1);
        setBulkStoryboardDigits(2);
        setBulkStoryboardStep(1);
        setBulkStoryboardSkipExisting(false);
        setBulkStoryboardAvoidExistingNumbers(true);
    };

    const commitBulkStoryboardMeta = () => {
        if (bulkStoryboardTargets.length <= 1) return;

        const normalizeValue = (value: string) => {
            const nextValue = value.trim();
            return nextValue ? nextValue : undefined;
        };

        const nextSceneType = normalizeValue(bulkStoryboardSceneType);
        const nextCameraMove = normalizeValue(bulkStoryboardCameraMove);
        const nextDuration = normalizeValue(bulkStoryboardDuration);
        const nextNote = normalizeValue(bulkStoryboardNote);

        if (nextDuration && validateStoryboardDuration(nextDuration)) {
            return;
        }

        if (!nextSceneType && !nextCameraMove && !nextDuration && !nextNote) {
            return;
        }

        bulkStoryboardTargets.forEach((element) => {
            const nextAttrs: Partial<CanvasElement> = {};
            if (nextSceneType !== undefined) nextAttrs.storyboardSceneType = nextSceneType;
            if (nextCameraMove !== undefined) nextAttrs.storyboardCameraMove = nextCameraMove;
            if (nextDuration !== undefined) nextAttrs.storyboardDuration = nextDuration;
            if (nextNote !== undefined) nextAttrs.storyboardNote = nextNote;
            onRenameElement(element.id, nextAttrs);
        });

        setBulkStoryboardMetaOpen(false);
        setBulkStoryboardSceneType('');
        setBulkStoryboardCameraMove('');
        setBulkStoryboardDuration('');
        setBulkStoryboardNote('');
    };

    const applyStoryboardTemplateToElement = useCallback((element: CanvasElement, templateValue: StoryboardMetaTemplateValue) => {
        const nextAttrs: Partial<CanvasElement> = {};
        if (templateValue.storyboardSceneType !== undefined) {
            nextAttrs.storyboardSceneType = templateValue.storyboardSceneType;
        }
        if (templateValue.storyboardCameraMove !== undefined) {
            nextAttrs.storyboardCameraMove = templateValue.storyboardCameraMove;
        }
        if (templateValue.storyboardDuration !== undefined) {
            nextAttrs.storyboardDuration = templateValue.storyboardDuration;
        }
        if (templateValue.storyboardNote !== undefined) {
            nextAttrs.storyboardNote = templateValue.storyboardNote;
        }

        if (Object.keys(nextAttrs).length === 0) {
            return;
        }

        onRenameElement(element.id, nextAttrs);
        resetStoryboardDraft(element.id);
    }, [onRenameElement, resetStoryboardDraft]);

    const handleSelect = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) {
            if (selectedIdSet.has(id)) {
                onSelect(selectedIds.filter((selectedId) => selectedId !== id));
            } else {
                onSelect([...selectedIds, id]);
            }
            return;
        }

        if (event.shiftKey) {
            if (!selectedIdSet.has(id)) {
                onSelect([...selectedIds, id]);
            }
            return;
        }

        onSelect([id]);
    };

    const handleDragStart = (event: React.DragEvent<HTMLDivElement>, id: string) => {
        const dragPayload = buildLayerDragPayload({
            primaryId: id,
            selectedIds,
            isPrimarySelected: selectedIdSet.has(id),
        });
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
        event.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
        setDraggingId(id);
    };

    const getDraggedIds = (event: Pick<React.DragEvent<HTMLDivElement>, 'dataTransfer'> | { dataTransfer: DataTransfer | null }) => {
        return readLayerDragIds({
            dataTransfer: event.dataTransfer,
            fallbackDraggingId: draggingId,
        });
    };

    const handleDragEnd = () => {
        setDraggingId(null);
        setDropIndicator(null);
        setParentDropTarget(null);
        resetDragAutoScroll();
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetId: string, placement: 'before' | 'after') => {
        event.preventDefault();
        event.stopPropagation();
        const draggedIds = getDraggedIds(event);
        if (!canApplyLayerDropReorder({
            draggedIds,
            targetId,
            hasElement: (id) => elementsById.has(id),
        })) {
            handleDragEnd();
            return;
        }

        onReorderLayer(draggedIds, targetId, placement);
        handleDragEnd();
    };

    const updateRowDropIndicator = (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
        event.preventDefault();
        if (!draggingId || draggingId === targetId) return;
        updateDragAutoScroll(event.clientY);
        const rect = event.currentTarget.getBoundingClientRect();
        const placement = getLayerDropPlacement(event.clientY, rect.top, rect.height);
        setDropIndicator({ targetId, placement });
        setParentDropTarget(null);
    };

    const handleMoveToParentDrop = (event: React.DragEvent<HTMLDivElement>, parentId?: string) => {
        event.preventDefault();
        event.stopPropagation();
        const draggedIds = getDraggedIds(event);
        if (draggedIds.length === 0) {
            handleDragEnd();
            return;
        }
        onMoveLayerToParent(draggedIds, parentId);
        handleDragEnd();
    };

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const handleTestMoveToParent = (event: Event) => {
            const customEvent = event as CustomEvent<LayersPanelMoveToParentDetail>;
            const moveDetail = normalizeLayerMoveToParentDetail(customEvent.detail);
            if (!moveDetail) {
                return;
            }

            onMoveLayerToParent(moveDetail.draggedIds, moveDetail.parentId);
        };

        const handleTestReorder = (event: Event) => {
            const customEvent = event as CustomEvent<LayersPanelReorderDetail>;
            const reorderDetail = normalizeLayerReorderDetail(customEvent.detail);
            if (!reorderDetail || !canApplyLayerTestReorder({
                draggedIds: reorderDetail.draggedIds,
                targetId: reorderDetail.targetId,
                hasElement: (id) => elementsById.has(id),
            })) {
                return;
            }

            onReorderLayer(reorderDetail.draggedIds, reorderDetail.targetId, reorderDetail.placement);
        };

        const eventTargets = Array.from(new Set([root, root.parentElement].filter((target): target is HTMLElement => !!target)));
        eventTargets.forEach((target) => {
            target.addEventListener(TEST_MOVE_TO_PARENT_EVENT, handleTestMoveToParent as EventListener);
            target.addEventListener(TEST_REORDER_EVENT, handleTestReorder as EventListener);
        });
        return () => {
            eventTargets.forEach((target) => {
                target.removeEventListener(TEST_MOVE_TO_PARENT_EVENT, handleTestMoveToParent as EventListener);
                target.removeEventListener(TEST_REORDER_EVENT, handleTestReorder as EventListener);
            });
        };
    }, [elementsById, onMoveLayerToParent, onReorderLayer]);

    const renderLayerRow = (row: FlattenedLayerRow): React.ReactNode => (
        <LayerRow
            key={row.element.id}
            row={row}
            selectedIdSet={selectedIdSet}
            highlightedIdSet={highlightedIdSet}
            draggingId={draggingId}
            dropIndicator={dropIndicator}
            parentDropTarget={parentDropTarget}
            editingNameId={editingNameId}
            editingNameValue={editingNameValue}
            storyboardTemplates={storyboardTemplates}
            getStoryboardDraft={getStoryboardDraft}
            onToggleExpanded={toggleExpanded}
            onSelect={handleSelect}
            onLocate={onLocate}
            onStartRename={startRename}
            onSetEditingNameValue={setEditingNameValue}
            onCancelRename={() => {
                setEditingNameId(null);
                setEditingNameValue('');
            }}
            onCommitRename={commitRename}
            onUpdateStoryboardDraft={updateStoryboardDraft}
            onCommitStoryboardDraft={commitStoryboardDraft}
            onResetStoryboardDraft={resetStoryboardDraft}
            onApplyStoryboardTemplateToElement={applyStoryboardTemplateToElement}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onUpdateDragAutoScroll={updateDragAutoScroll}
            onDropIndicatorChange={setDropIndicator}
            onParentDropTargetChange={setParentDropTarget}
            onUpdateRowDropIndicator={updateRowDropIndicator}
            onMoveToParentDrop={handleMoveToParentDrop}
            onToggleHidden={onToggleHidden}
            onToggleLocked={onToggleLocked}
            onBringForward={onBringForward}
            onSendBackward={onSendBackward}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
            onDeleteSelection={onDeleteSelection}
        />
    );

    return (
        <PanelShell
            icon={<Layers3 size={12} />}
            title="图层"
            badge={<PanelBadge>{layerCount}</PanelBadge>}
            onClose={onClose}
            data-testid="layers-panel"
        >
            <div ref={rootRef}>
            {draggingElement && (
                <div className="mx-2 my-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
                    {draggingSelectionIds.length > 1
                        ? `正在拖动 ${draggingSelectionIds.length} 个图层`
                        : `正在拖动「${getLayerLabel(draggingElement)}」`}
                </div>
            )}

            <div className="space-y-1 border-b border-slate-100 px-2 py-1.5">
                <div className="flex items-center gap-1.5 rounded-md border border-slate-200/60 bg-slate-50/60 px-2 py-1.5">
                    <Search size={13} className="text-slate-400" />
                    <input
                        type="text"
                        value={layerQuery}
                        onChange={(event) => setLayerQuery(event.target.value)}
                        placeholder="搜索图层"
                        className="w-full bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
                    />
                </div>
                <div className="flex flex-wrap gap-0.5">
                    {([
                        ['all', '全部'],
                        ['image', '图片'],
                        ['frame', '画板'],
                        ['text', '文本'],
                        ['shape', '图形'],
                        ['video', '视频'],
                        ['other', '其他'],
                    ] as Array<[LayerFilterType, string]>).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setLayerFilterType(id)}
                            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors ${layerFilterType === id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setStoryboardOnly((prev) => !prev)}
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${storyboardOnly ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                    >
                        仅分镜
                    </button>
                    <button
                        type="button"
                        onClick={() => setLayerSortMode((prev) => prev === 'canvas' ? 'storyboard-shot' : 'canvas')}
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${layerSortMode === 'storyboard-shot' ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                    >
                        {layerSortMode === 'storyboard-shot' ? '镜头号排序' : '画布顺序'}
                    </button>
                </div>
            </div>

            <LayerVirtualList
                scrollContainerRef={scrollContainerRef}
                draggingId={draggingId}
                parentDropTarget={parentDropTarget}
                dragHintLabel={dragHintLabel}
                filteredRowsState={filteredRowsState}
                flattenedRowCount={flattenedRows.rows.length}
                visibleRows={visibleRows}
                onRootDragOver={(event) => {
                    if (!draggingId) return;
                    event.preventDefault();
                    updateDragAutoScroll(event.clientY);
                    setParentDropTarget('root');
                    setDropIndicator(null);
                }}
                onRootDragLeave={() => {
                    setParentDropTarget((prev) => prev === 'root' ? null : prev);
                }}
                onRootDrop={(event) => handleMoveToParentDrop(event, undefined)}
                renderRow={renderLayerRow}
            />

            {(selectedIds.length > 1 || historySummary) && (
                <div className="border-t border-slate-100 bg-slate-50/90 px-3 py-2.5 space-y-2.5">
                    {historySummary && (
                        <div className="rounded-md bg-white px-3 py-2.5 ring-1 ring-slate-100" data-testid="layers-history-summary">
                            <div className="flex items-center justify-between">
                                <span className="text-[12px] font-semibold text-slate-700">历史摘要</span>
                                <span className="text-[11px] font-medium text-slate-500">{historySummary.patchCount} 步</span>
                            </div>
                            <div className="mt-1 truncate text-[12px] font-medium text-slate-800">{historySummary.lastAction}</div>
                            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                                <span className={`font-medium ${historySummary.canUndo ? 'text-violet-600' : 'text-slate-400'}`}>{historySummary.canUndo ? '可撤销' : '起点'}</span>
                                <span className="text-slate-300">/</span>
                                <span className={`font-medium ${historySummary.canRedo ? 'text-emerald-600' : 'text-slate-400'}`}>{historySummary.canRedo ? '可重做' : '最新'}</span>
                            </div>
                            {historyTimeline.length > 0 && (
                                <div className="mt-2 space-y-1" data-testid="layers-history-timeline">
                                    {historyTimeline.slice(0, 3).map((entry) => (
                                        <div
                                            key={entry.id}
                                            className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                                                entry.active ? 'bg-slate-900 text-white' : 'text-slate-500'
                                            }`}
                                        >
                                            <span className={`truncate text-[12px] font-medium ${entry.active ? 'text-white' : 'text-slate-700'}`}>{entry.label}</span>
                                            <span className={`ml-2 flex-shrink-0 text-[10px] tabular-nums ${entry.active ? 'text-white/60' : 'text-slate-400'}`}>
                                                {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {selectedIds.length > 1 && (
                        <LayerBulkOperations
                            selectedIds={selectedIds}
                            selectedParentSummary={selectedParentSummary}
                            selectedHidden={selectedHidden}
                            selectedLocked={selectedLocked}
                            bulkRenameTargetsCount={bulkRenameTargets.length}
                            bulkStoryboardTargetsCount={bulkStoryboardTargets.length}
                            bulkRenameOpen={bulkRenameOpen}
                            bulkRenameValue={bulkRenameValue}
                            bulkRenameStart={bulkRenameStart}
                            bulkStoryboardOpen={bulkStoryboardOpen}
                            bulkStoryboardPrefix={bulkStoryboardPrefix}
                            bulkStoryboardStart={bulkStoryboardStart}
                            bulkStoryboardDigits={bulkStoryboardDigits}
                            bulkStoryboardStep={bulkStoryboardStep}
                            bulkStoryboardSkipExisting={bulkStoryboardSkipExisting}
                            bulkStoryboardAvoidExistingNumbers={bulkStoryboardAvoidExistingNumbers}
                            bulkStoryboardPrefixError={bulkStoryboardPrefixError}
                            bulkStoryboardMetaOpen={bulkStoryboardMetaOpen}
                            bulkStoryboardSceneType={bulkStoryboardSceneType}
                            bulkStoryboardCameraMove={bulkStoryboardCameraMove}
                            bulkStoryboardDuration={bulkStoryboardDuration}
                            bulkStoryboardNote={bulkStoryboardNote}
                            bulkStoryboardDurationError={bulkStoryboardDurationError}
                            storyboardTemplateName={storyboardTemplateName}
                            storyboardTemplateHint={storyboardTemplateHint}
                            storyboardTemplates={storyboardTemplates}
                            onOpenBulkRenamePanel={openBulkRenamePanel}
                            onOpenBulkStoryboardNumberingPanel={openBulkStoryboardNumberingPanel}
                            onOpenBulkStoryboardMetaPanel={openBulkStoryboardMetaPanel}
                            onCommitBulkRename={commitBulkRename}
                            onCommitBulkStoryboardNumbering={commitBulkStoryboardNumbering}
                            onCommitBulkStoryboardMeta={commitBulkStoryboardMeta}
                            onCancelBulkRename={cancelBulkRename}
                            onCancelBulkStoryboardNumbering={cancelBulkStoryboardNumbering}
                            onCancelBulkStoryboardMeta={cancelBulkStoryboardMeta}
                            onSaveStoryboardTemplate={saveCurrentStoryboardTemplate}
                            onLoadStoryboardTemplate={loadStoryboardTemplate}
                            onDeleteStoryboardTemplate={deleteStoryboardTemplate}
                            onBulkRenameValueChange={setBulkRenameValue}
                            onBulkRenameStartChange={setBulkRenameStart}
                            onBulkStoryboardPrefixChange={setBulkStoryboardPrefix}
                            onBulkStoryboardStartChange={setBulkStoryboardStart}
                            onBulkStoryboardDigitsChange={setBulkStoryboardDigits}
                            onBulkStoryboardStepChange={setBulkStoryboardStep}
                            onBulkStoryboardSkipExistingChange={setBulkStoryboardSkipExisting}
                            onBulkStoryboardAvoidExistingNumbersChange={setBulkStoryboardAvoidExistingNumbers}
                            onBulkStoryboardSceneTypeChange={setBulkStoryboardSceneType}
                            onBulkStoryboardCameraMoveChange={setBulkStoryboardCameraMove}
                            onBulkStoryboardDurationChange={setBulkStoryboardDuration}
                            onBulkStoryboardNoteChange={setBulkStoryboardNote}
                            onStoryboardTemplateNameChange={setStoryboardTemplateName}
                            onToggleHidden={onToggleHidden}
                            onToggleLocked={onToggleLocked}
                            onMoveLayerToParent={onMoveLayerToParent}
                            onBringForward={onBringForward}
                            onSendBackward={onSendBackward}
                            onBringToFront={onBringToFront}
                            onSendToBack={onSendToBack}
                            onDeleteSelection={onDeleteSelection}
                        />
                    )}
                </div>
            )}
        </div>
        </PanelShell>
    );
}
