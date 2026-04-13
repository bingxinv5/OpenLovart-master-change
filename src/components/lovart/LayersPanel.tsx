"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    ChevronsDown,
    ChevronsUp,
    Eye,
    EyeOff,
    Frame,
    Image as ImageIcon,
    LayoutGrid,
    Layers3,
    Lock,
    Search,
    Sparkles,
    Square,
    Type,
    Unlock,
    Video,
    Pencil,
    Shapes,
    Trash2,
    GripVertical,
} from 'lucide-react';
import { PanelShell, PanelBadge } from './PanelShell';
import layersPanelTestEvents from '@/lib/testing/layers-panel-test-events.json';
import {
    deleteStoryboardMetaTemplate,
    listStoryboardMetaTemplates,
    saveStoryboardMetaTemplate,
    type StoryboardMetaTemplateValue,
    type StoryboardMetaTemplateEntry,
} from '@/lib/storyboard-meta-presets';
import { getStoryboardShotSortTuple, parseStoryboardShotCode, validateStoryboardDuration, validateStoryboardShotCode } from '@/lib/storyboard-utils';
import type { CanvasElement } from './canvas-types';

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

interface LayerNode {
    element: CanvasElement;
    children: LayerNode[];
}

interface FlattenedLayerRow {
    element: CanvasElement;
    children: LayerNode[];
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
    top: number;
    height: number;
}

interface LayersPanelMoveToParentDetail {
    draggedId?: string;
    draggedIds?: string[];
    parentId?: string | null;
}

interface LayersPanelReorderDetail {
    draggedId?: string;
    draggedIds?: string[];
    targetId?: string;
    placement?: 'before' | 'after';
}

interface LayerDragPayload {
    primaryId: string;
    ids: string[];
}

type LayerFilterType = 'all' | 'image' | 'frame' | 'text' | 'shape' | 'video' | 'other';
type LayerSortMode = 'canvas' | 'storyboard-shot';
type StoryboardAuditFilter = 'all' | 'ready' | 'partial' | 'invalid' | 'untracked';
type StoryboardNavigationScope = 'issues' | 'invalid' | 'partial' | 'untracked';

const TEST_MOVE_TO_PARENT_EVENT = layersPanelTestEvents.moveToParentEvent;
const TEST_REORDER_EVENT = layersPanelTestEvents.reorderEvent;
const LAYER_ROW_BASE_HEIGHT = 36;
const LAYER_ROW_SELECTED_ACTIONS_HEIGHT = 28;
const LAYER_ROW_STORYBOARD_META_HEIGHT = 140;
const LAYER_ROW_NEST_TARGET_HEIGHT = 32;
const LAYER_ROW_GAP_HEIGHT = 4;
const LAYER_ROW_OVERSCAN = 8;

function validateStoryboardPrefix(value?: string) {
    const rawValue = value?.trim();
    if (!rawValue) return null;
    if (!/^[A-Z\-]+$/i.test(rawValue)) {
        return '前缀建议只使用字母或连字符，例如 A、SC、SHOT-。';
    }
    return null;
}

function getLayerLabel(element: CanvasElement) {
    if (element.displayName?.trim()) {
        return element.displayName.trim();
    }

    if (element.type === 'frame') {
        return element.frameName?.trim() || (element.groupFrame ? '编组' : '画板');
    }

    if (element.type === 'text') {
        return element.content?.trim().slice(0, 18) || '文本';
    }

    if (element.type === 'shape') {
        const shapeMap: Record<NonNullable<CanvasElement['shapeType']>, string> = {
            square: '矩形',
            circle: '圆形',
            triangle: '三角形',
            star: '星形',
            message: '气泡',
            'arrow-left': '左箭头',
            'arrow-right': '右箭头',
        };
        return shapeMap[element.shapeType || 'square'];
    }

    if (element.type === 'path') return '路径';
    if (element.type === 'image') return '图片';
    if (element.type === 'video') return '视频';
    if (element.type === 'image-generator') return '图片生成器';
    if (element.type === 'video-generator') return '视频生成器';
    if (element.type === 'mark') return `标记 ${element.markNumber || ''}`.trim();
    return element.type;
}

function getLayerIcon(element: CanvasElement) {
    switch (element.type) {
        case 'image':
            return ImageIcon;
        case 'text':
            return Type;
        case 'shape':
            return Shapes;
        case 'path':
            return Pencil;
        case 'video':
            return Video;
        case 'image-generator':
        case 'video-generator':
            return Sparkles;
        case 'frame':
            return Frame;
        default:
            return Square;
    }
}

function isElementLocked(element: CanvasElement) {
    return !!(element.locked || (element.type === 'frame' && element.frameLocked));
}

function getLayerFilterType(element: CanvasElement): LayerFilterType {
    if (element.type === 'image') return 'image';
    if (element.type === 'frame') return 'frame';
    if (element.type === 'text') return 'text';
    if (element.type === 'shape' || element.type === 'path' || element.type === 'mark') return 'shape';
    if (element.type === 'video' || element.type === 'video-generator') return 'video';
    return 'other';
}

function getStoryboardSummaryParts(element: CanvasElement) {
    return [
        element.storyboardShotCode?.trim(),
        element.storyboardSceneType?.trim(),
        element.storyboardCameraMove?.trim(),
        element.storyboardDuration?.trim(),
    ].filter(Boolean) as string[];
}

function getStoryboardAuditState(element: CanvasElement) {
    const shotCode = element.storyboardShotCode?.trim();
    const sceneType = element.storyboardSceneType?.trim();
    const duration = element.storyboardDuration?.trim();
    const note = element.storyboardNote?.trim();
    const cameraMove = element.storyboardCameraMove?.trim();
    const hasAnyMeta = !!(shotCode || sceneType || duration || note || cameraMove);
    const hasValidationError = !!(validateStoryboardShotCode(shotCode) || validateStoryboardDuration(duration));
    const isReady = !!(shotCode && sceneType && duration) && !hasValidationError;
    const isPartial = hasAnyMeta && !isReady && !hasValidationError;
    const isUntracked = !hasAnyMeta;
    const needsAttention = hasValidationError || isPartial;

    return {
        hasAnyMeta,
        hasValidationError,
        isReady,
        isPartial,
        isUntracked,
        needsAttention,
    };
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
    const [storyboardTemplateName, setStoryboardTemplateName] = useState('');
    const [storyboardTemplateHint, setStoryboardTemplateHint] = useState('');
    const [storyboardTemplates, setStoryboardTemplates] = useState<StoryboardMetaTemplateEntry[]>(() => listStoryboardMetaTemplates());
    const [storyboardDrafts, setStoryboardDrafts] = useState<Record<string, {
        storyboardShotCode: string;
        storyboardSceneType: string;
        storyboardCameraMove: string;
        storyboardDuration: string;
        storyboardNote: string;
    }>>({});
    const [layerQuery, setLayerQuery] = useState('');
    const [layerFilterType, setLayerFilterType] = useState<LayerFilterType>('all');
    const [layerSortMode, setLayerSortMode] = useState<LayerSortMode>('canvas');
    const [storyboardOnly, setStoryboardOnly] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ targetId: string; placement: 'before' | 'after' } | null>(null);
    const [parentDropTarget, setParentDropTarget] = useState<string | 'root' | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const dragAutoScrollVelocityRef = useRef(0);
    const dragAutoScrollFrameRef = useRef<number | null>(null);
    const bulkStoryboardPrefixError = useMemo(() => validateStoryboardPrefix(bulkStoryboardPrefix), [bulkStoryboardPrefix]);
    const bulkStoryboardDurationError = useMemo(() => validateStoryboardDuration(bulkStoryboardDuration), [bulkStoryboardDuration]);
    const effectiveStoryboardAuditFilter = externalStoryboardAuditFilter ?? 'all';

    const layerTree = useMemo(() => {
        const layerElements = elements.filter((element) => element.type !== 'connector');
        const idSet = new Set(layerElements.map((element) => element.id));
        const childrenByParent = new Map<string, CanvasElement[]>();

        layerElements.forEach((element) => {
            if (!element.parentFrameId || !idSet.has(element.parentFrameId)) {
                return;
            }
            const siblings = childrenByParent.get(element.parentFrameId) || [];
            siblings.push(element);
            childrenByParent.set(element.parentFrameId, siblings);
        });

        const buildNodes = (parentId?: string): LayerNode[] => {
            const source = parentId
                ? (childrenByParent.get(parentId) || [])
                : layerElements.filter((element) => !element.parentFrameId || !idSet.has(element.parentFrameId));

            return [...source].reverse().map((element) => ({
                element,
                children: buildNodes(element.id),
            }));
        };

        return buildNodes();
    }, [elements]);

    const flattenedRows = useMemo(() => {
        const rows: FlattenedLayerRow[] = [];
        let offsetTop = 0;

        const visit = (nodes: LayerNode[], depth: number) => {
            nodes.forEach((node) => {
                const hasChildren = node.children.length > 0;
                const expanded = expandedMap[node.element.id] ?? true;
                const selected = selectedIdSet.has(node.element.id);
                const storyboardMetaVisible = selected && node.element.type === 'image';
                const rowHeight = LAYER_ROW_BASE_HEIGHT
                    + (selected ? LAYER_ROW_SELECTED_ACTIONS_HEIGHT : 0)
                    + (storyboardMetaVisible ? LAYER_ROW_STORYBOARD_META_HEIGHT : 0)
                    + (node.element.type === 'frame' && draggingId && draggingId !== node.element.id ? LAYER_ROW_NEST_TARGET_HEIGHT : 0)
                    + LAYER_ROW_GAP_HEIGHT;

                rows.push({
                    element: node.element,
                    children: node.children,
                    depth,
                    hasChildren,
                    expanded,
                    top: offsetTop,
                    height: rowHeight,
                });

                offsetTop += rowHeight;

                if (hasChildren && expanded) {
                    visit(node.children, depth + 1);
                }
            });
        };

        visit(layerTree, 0);
        return {
            rows,
            totalHeight: offsetTop,
        };
    }, [draggingId, expandedMap, layerTree, selectedIdSet]);

    const filteredRowsState = useMemo(() => {
        const query = layerQuery.trim().toLowerCase();
        const filteredRows = flattenedRows.rows
            .filter((row) => {
                const typeMatched = layerFilterType === 'all' || getLayerFilterType(row.element) === layerFilterType;
                const label = getLayerLabel(row.element).toLowerCase();
                const queryMatched = !query || label.includes(query) || row.element.type.toLowerCase().includes(query);
                const storyboardMatched = !storyboardOnly || !!row.element.storyboardShotCode?.trim();
                let storyboardAuditMatched = true;

                if (effectiveStoryboardAuditFilter !== 'all') {
                    if (row.element.type !== 'image') {
                        storyboardAuditMatched = false;
                    } else {
                        const auditState = getStoryboardAuditState(row.element);
                        storyboardAuditMatched = (
                            (effectiveStoryboardAuditFilter === 'ready' && auditState.isReady)
                            || (effectiveStoryboardAuditFilter === 'partial' && auditState.isPartial)
                            || (effectiveStoryboardAuditFilter === 'invalid' && auditState.hasValidationError)
                            || (effectiveStoryboardAuditFilter === 'untracked' && auditState.isUntracked)
                        );
                    }
                }

                return typeMatched && queryMatched && storyboardMatched && storyboardAuditMatched;
            })
            ;

        if (layerSortMode === 'storyboard-shot') {
            filteredRows.sort((a, b) => {
                const tupleA = getStoryboardShotSortTuple(a.element.storyboardShotCode, getLayerLabel(a.element));
                const tupleB = getStoryboardShotSortTuple(b.element.storyboardShotCode, getLayerLabel(b.element));
                if (tupleA[0] !== tupleB[0]) return tupleA[0] - tupleB[0];
                if (tupleA[1] !== tupleB[1]) return tupleA[1].localeCompare(tupleB[1], 'zh-CN');
                if (tupleA[2] !== tupleB[2]) return tupleA[2] - tupleB[2];
                return tupleA[3].localeCompare(tupleB[3], 'zh-CN');
            });
        }

        const rows = filteredRows.reduce<FlattenedLayerRow[]>((accumulator, row) => {
            const nextTop = accumulator.length === 0
                ? 0
                : accumulator[accumulator.length - 1].top + accumulator[accumulator.length - 1].height;
            accumulator.push({ ...row, top: nextTop });
            return accumulator;
        }, []);

        const totalHeight = rows.length === 0
            ? 0
            : rows[rows.length - 1].top + rows[rows.length - 1].height;

        return {
            rows,
            totalHeight,
        };
    }, [effectiveStoryboardAuditFilter, flattenedRows.rows, layerFilterType, layerQuery, layerSortMode, storyboardOnly]);

    const visibleRows = useMemo(() => {
        const rows = filteredRowsState.rows;
        if (rows.length === 0) {
            return rows;
        }

        const viewportBottom = scrollTop + Math.max(viewportHeight, 1);
        let startIndex = rows.findIndex((row) => row.top + row.height >= scrollTop);
        if (startIndex < 0) {
            startIndex = 0;
        }

        let endIndex = rows.findIndex((row) => row.top > viewportBottom);
        if (endIndex < 0) {
            endIndex = rows.length;
        }

        startIndex = Math.max(0, startIndex - LAYER_ROW_OVERSCAN);
        endIndex = Math.min(rows.length, endIndex + LAYER_ROW_OVERSCAN);
        return rows.slice(startIndex, endIndex);
    }, [filteredRowsState.rows, scrollTop, viewportHeight]);

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
    }, [draggingId]);

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
    }, [draggingId]);

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
        setStoryboardTemplateName('');
        setStoryboardTemplateHint('');
        setBulkStoryboardMetaOpen(true);
    }, []);
    const draggingSelectionIds = useMemo(() => {
        if (!draggingId) return [];
        return selectedIdSet.has(draggingId) && selectedIds.length > 1 ? selectedIds : [draggingId];
    }, [draggingId, selectedIdSet, selectedIds]);
    const dragHintLabel = useMemo(() => {
        if (!draggingId) return '';
        if (parentDropTarget === 'root') {
            return '释放后移到根层级';
        }
        if (parentDropTarget && parentDropTarget !== 'root') {
            const target = elementsById.get(parentDropTarget);
            return `释放后加入“${target ? getLayerLabel(target) : '画板'}”`;
        }
        if (dropIndicator) {
            const target = elementsById.get(dropIndicator.targetId);
            return `${dropIndicator.placement === 'before' ? '释放后排到前面' : '释放后排到后面'} · ${target ? getLayerLabel(target) : '目标图层'}`;
        }
        return draggingSelectionIds.length > 1 ? `正在拖动 ${draggingSelectionIds.length} 个图层` : '正在拖动图层';
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

    const getStoryboardDraft = useCallback((element: CanvasElement) => {
        const draft = storyboardDrafts[element.id];
        return draft || {
            storyboardShotCode: element.storyboardShotCode || '',
            storyboardSceneType: element.storyboardSceneType || '',
            storyboardCameraMove: element.storyboardCameraMove || '',
            storyboardDuration: element.storyboardDuration || '',
            storyboardNote: element.storyboardNote || '',
        };
    }, [storyboardDrafts]);

    const updateStoryboardDraft = useCallback((
        id: string,
        key: 'storyboardShotCode' | 'storyboardSceneType' | 'storyboardCameraMove' | 'storyboardDuration' | 'storyboardNote',
        value: string,
        element: CanvasElement,
    ) => {
        setStoryboardDrafts((prev) => ({
            ...prev,
            [id]: {
                ...getStoryboardDraft(element),
                ...prev[id],
                [key]: value,
            },
        }));
    }, [getStoryboardDraft]);

    const commitStoryboardDraft = useCallback((id: string, element: CanvasElement) => {
        const draft = storyboardDrafts[id];
        if (!draft) return;

        const normalizeValue = (value: string) => {
            const nextValue = value.trim();
            return nextValue ? nextValue : undefined;
        };

        const nextAttrs: Partial<CanvasElement> = {};
        const nextShotCode = normalizeValue(draft.storyboardShotCode);
        const nextSceneType = normalizeValue(draft.storyboardSceneType);
        const nextCameraMove = normalizeValue(draft.storyboardCameraMove);
        const nextDuration = normalizeValue(draft.storyboardDuration);
        const nextNote = normalizeValue(draft.storyboardNote);

        if (validateStoryboardShotCode(nextShotCode) || validateStoryboardDuration(nextDuration)) {
            return;
        }

        if ((element.storyboardShotCode || undefined) !== nextShotCode) {
            nextAttrs.storyboardShotCode = nextShotCode;
        }
        if ((element.storyboardSceneType || undefined) !== nextSceneType) {
            nextAttrs.storyboardSceneType = nextSceneType;
        }
        if ((element.storyboardCameraMove || undefined) !== nextCameraMove) {
            nextAttrs.storyboardCameraMove = nextCameraMove;
        }
        if ((element.storyboardDuration || undefined) !== nextDuration) {
            nextAttrs.storyboardDuration = nextDuration;
        }
        if ((element.storyboardNote || undefined) !== nextNote) {
            nextAttrs.storyboardNote = nextNote;
        }

        if (Object.keys(nextAttrs).length > 0) {
            onRenameElement(id, nextAttrs);
        }

        setStoryboardDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, [onRenameElement, storyboardDrafts]);

    const resetStoryboardDraft = useCallback((id: string) => {
        setStoryboardDrafts((prev) => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

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
        setStoryboardDrafts((prev) => {
            const next = { ...prev };
            delete next[element.id];
            return next;
        });
    }, [onRenameElement]);

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
        const dragIds = selectedIdSet.has(id) && selectedIds.length > 1 ? selectedIds : [id];
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
        event.dataTransfer.setData('application/json', JSON.stringify({ primaryId: id, ids: dragIds } satisfies LayerDragPayload));
        setDraggingId(id);
    };

    const getDraggedIds = (event: Pick<React.DragEvent<HTMLDivElement>, 'dataTransfer'> | { dataTransfer: DataTransfer | null }) => {
        const jsonPayload = event.dataTransfer?.getData('application/json');
        if (jsonPayload) {
            try {
                const parsed = JSON.parse(jsonPayload) as LayerDragPayload;
                if (Array.isArray(parsed.ids) && parsed.ids.length > 0) {
                    return parsed.ids;
                }
            } catch {
                // ignore parse errors
            }
        }

        const draggedId = draggingId || event.dataTransfer?.getData('text/plain');
        return draggedId ? [draggedId] : [];
    };

    const handleDragEnd = () => {
        setDraggingId(null);
        setDropIndicator(null);
        setParentDropTarget(null);
        dragAutoScrollVelocityRef.current = 0;
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetId: string, placement: 'before' | 'after') => {
        event.preventDefault();
        event.stopPropagation();
        const draggedIds = getDraggedIds(event);
        if (draggedIds.length === 0 || draggedIds.includes(targetId)) {
            handleDragEnd();
            return;
        }

        const hasDraggedElement = draggedIds.some((id) => elementsById.has(id));
        if (!hasDraggedElement) {
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
        const placement: 'before' | 'after' = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
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
            const draggedId = customEvent.detail?.draggedId?.trim();
            const draggedIds = Array.isArray(customEvent.detail?.draggedIds)
                ? customEvent.detail?.draggedIds.map((id) => id.trim()).filter(Boolean)
                : draggedId ? [draggedId] : [];
            const parentId = customEvent.detail?.parentId ?? undefined;
            if (draggedIds.length === 0) {
                return;
            }

            onMoveLayerToParent(draggedIds, parentId || undefined);
        };

        const handleTestReorder = (event: Event) => {
            const customEvent = event as CustomEvent<LayersPanelReorderDetail>;
            const draggedId = customEvent.detail?.draggedId?.trim();
            const draggedIds = Array.isArray(customEvent.detail?.draggedIds)
                ? customEvent.detail?.draggedIds.map((id) => id.trim()).filter(Boolean)
                : draggedId ? [draggedId] : [];
            const targetId = customEvent.detail?.targetId?.trim();
            const placement = customEvent.detail?.placement;
            if (draggedIds.length === 0 || !targetId || !placement || draggedIds.includes(targetId)) {
                return;
            }

            const draggedElement = elementsById.get(draggedIds[0]);
            const targetElement = elementsById.get(targetId);
            if (!draggedElement || !targetElement) {
                return;
            }

            onReorderLayer(draggedIds, targetId, placement);
        };

        root.addEventListener(TEST_MOVE_TO_PARENT_EVENT, handleTestMoveToParent as EventListener);
        root.addEventListener(TEST_REORDER_EVENT, handleTestReorder as EventListener);
        return () => {
            root.removeEventListener(TEST_MOVE_TO_PARENT_EVENT, handleTestMoveToParent as EventListener);
            root.removeEventListener(TEST_REORDER_EVENT, handleTestReorder as EventListener);
        };
    }, [elementsById, onMoveLayerToParent, onReorderLayer]);

    const renderRow = (row: FlattenedLayerRow): React.ReactNode => {
        const { element, children, depth, hasChildren, expanded, top, height } = row;
        const selected = selectedIdSet.has(element.id);
        const locked = isElementLocked(element);
        const hidden = !!element.hidden;
        const Icon = getLayerIcon(element);
        const isDragging = draggingId === element.id;
        const isHighlighted = highlightedIdSet.has(element.id);
        const storyboardDraft = getStoryboardDraft(element);
        const storyboardShotCodeError = validateStoryboardShotCode(storyboardDraft.storyboardShotCode);
        const storyboardDurationError = validateStoryboardDuration(storyboardDraft.storyboardDuration);
        const hasStoryboardValidationError = !!(storyboardShotCodeError || storyboardDurationError);
        const showStoryboardEditor = selected && element.type === 'image';
        const storyboardSummaryParts = getStoryboardSummaryParts(element);
        const storyboardNote = element.storyboardNote?.trim();
        return (
            <div
                key={element.id}
                className="absolute left-0 right-0"
                style={{ transform: `translateY(${top}px)`, height: `${height}px` }}
            >
                <div
                    data-testid={`layer-drop-before-${element.id}`}
                    className={`h-1 rounded-full transition-all ${dropIndicator?.targetId === element.id && dropIndicator.placement === 'before' ? 'bg-blue-400/80' : 'bg-transparent'}`}
                    style={{ marginLeft: `${depth * 12 + 8}px` }}
                    onDragOver={(event) => {
                        event.preventDefault();
                        if (!draggingId || draggingId === element.id) return;
                        updateDragAutoScroll(event.clientY);
                        setDropIndicator({ targetId: element.id, placement: 'before' });
                    }}
                    onDragLeave={() => {
                        setDropIndicator((prev) => prev?.targetId === element.id && prev.placement === 'before' ? null : prev);
                    }}
                    onDrop={(event) => handleDrop(event, element.id, 'before')}
                />
                <div
                    data-testid={`layer-row-${element.id}`}
                    onDragOver={(event) => updateRowDropIndicator(event, element.id)}
                    onDrop={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const placement: 'before' | 'after' = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                        handleDrop(event, element.id, placement);
                    }}
                    className={`group relative flex items-center gap-1 rounded-md border px-1 py-1 transition-all duration-200 ${selected ? 'border-blue-200 bg-blue-50/70' : 'border-transparent bg-white/80 hover:border-slate-200 hover:bg-white'} ${isHighlighted ? 'border-amber-300 bg-amber-50/95 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]' : ''} ${hidden ? 'opacity-60' : ''} ${isDragging ? 'opacity-40' : ''}`}
                    style={{ marginLeft: `${depth * 12}px` }}
                >
                    <div
                        data-testid={`layer-drag-${element.id}`}
                        draggable={editingNameId !== element.id}
                        onDragStart={(event) => handleDragStart(event, element.id)}
                        onDragEnd={handleDragEnd}
                        className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                        title="拖拽排序或跨画板移动图层"
                    >
                        <GripVertical size={12} />
                    </div>
                    <button
                        type="button"
                        aria-label={hasChildren ? (expanded ? '收起图层分组' : '展开图层分组') : '图层无子项'}
                        onClick={() => hasChildren && toggleExpanded(element.id)}
                        className={`flex h-6 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors ${hasChildren ? 'hover:text-slate-700' : 'cursor-default opacity-30'}`}
                    >
                        {hasChildren ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="h-1.5 w-1.5" />}
                    </button>

                    <button
                        type="button"
                        data-testid={`layer-select-${element.id}`}
                        onClick={(event) => handleSelect(event, element.id)}
                        onDoubleClick={() => onLocate(element.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 text-left"
                    >
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${selected ? 'bg-violet-100 text-blue-700 ring-violet-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
                            <Icon size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                                {editingNameId === element.id ? (
                                    <input
                                        data-testid={`layer-name-input-${element.id}`}
                                        value={editingNameValue}
                                        autoFocus
                                        onChange={(event) => setEditingNameValue(event.target.value)}
                                        onBlur={commitRename}
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => {
                                            event.stopPropagation();
                                            if (event.key === 'Enter') commitRename();
                                            if (event.key === 'Escape') {
                                                setEditingNameId(null);
                                                setEditingNameValue('');
                                            }
                                        }}
                                        className="h-6 min-w-0 max-w-[160px] rounded border border-blue-200 bg-white px-1.5 text-[12px] font-medium text-slate-800 outline-none ring-2 ring-blue-100"
                                    />
                                ) : (
                                    <span
                                        className="truncate text-[12px] font-medium text-slate-800"
                                        title="双击重命名"
                                        onDoubleClick={(event) => {
                                            event.stopPropagation();
                                            startRename(element);
                                        }}
                                    >
                                        {getLayerLabel(element)}
                                    </span>
                                )}
                                {element.groupFrame && (
                                    <span className="rounded bg-violet-100 px-1 py-px text-[9px] font-semibold text-blue-700">组</span>
                                )}
                                {element.type === 'frame' && !element.groupFrame && (
                                    <span className="rounded bg-sky-100 px-1 py-px text-[9px] font-semibold text-sky-700">板</span>
                                )}
                                {hidden && <span className="rounded bg-slate-100 px-1 py-px text-[9px] text-slate-500">隐</span>}
                                {locked && <span className="rounded bg-amber-50 px-1 py-px text-[9px] text-amber-600">锁</span>}
                                {hasChildren && <span className="text-[9px] text-slate-400">{children.length}</span>}
                            </div>
                            {element.type === 'image' && (storyboardSummaryParts.length > 0 || storyboardNote) && (
                                <div className="mt-px flex flex-wrap items-center gap-0.5">
                                    {storyboardSummaryParts.map((part, index) => (
                                        <span
                                            key={`${element.id}-storyboard-${index}-${part}`}
                                            className="rounded border border-amber-200/70 bg-amber-50/80 px-1 py-px text-[8px] font-medium text-amber-700"
                                        >
                                            {part}
                                        </span>
                                    ))}
                                    {storyboardNote && (
                                        <span
                                            className="max-w-[120px] truncate rounded border border-slate-200/70 bg-slate-50/80 px-1 py-px text-[8px] text-slate-500"
                                            title={storyboardNote}
                                        >
                                            {storyboardNote}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </button>

                    <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-lg bg-white/95 shadow-sm ring-1 ring-slate-100 px-0.5 backdrop-blur-sm transition-opacity ${selected ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
                        <button
                            type="button"
                            title={hidden ? '显示图层' : '隐藏图层'}
                            aria-label={hidden ? '显示图层' : '隐藏图层'}
                            onClick={(event) => {
                                event.stopPropagation();
                                onToggleHidden([element.id]);
                            }}
                            className={`rounded p-1 transition-colors ${hidden ? 'text-slate-600 hover:text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <button
                            type="button"
                            title={locked ? '解锁图层' : '锁定图层'}
                            aria-label={locked ? '解锁图层' : '锁定图层'}
                            onClick={(event) => {
                                event.stopPropagation();
                                onToggleLocked([element.id]);
                            }}
                            className={`rounded p-1 transition-colors ${locked ? 'text-amber-600 hover:text-amber-700' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {locked ? <Unlock size={13} /> : <Lock size={13} />}
                        </button>
                        <button
                            type="button"
                            data-testid={`layer-rename-${element.id}`}
                            title="重命名图层"
                            aria-label="重命名图层"
                            onClick={(event) => {
                                event.stopPropagation();
                                startRename(element);
                            }}
                            className="rounded p-1 text-slate-400 transition-colors hover:text-slate-600"
                        >
                            <Pencil size={13} />
                        </button>
                        <button
                            type="button"
                            data-testid={`layer-delete-${element.id}`}
                            title="删除图层"
                            aria-label="删除图层"
                            onClick={(event) => {
                                event.stopPropagation();
                                onDeleteSelection([element.id]);
                            }}
                            className="rounded p-1 text-slate-400 transition-colors hover:text-red-500"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </div>
                <div
                    data-testid={`layer-drop-after-${element.id}`}
                    className={`h-2 rounded-full transition-all ${dropIndicator?.targetId === element.id && dropIndicator.placement === 'after' ? 'bg-violet-400/80' : 'bg-transparent'}`}
                    style={{ marginLeft: `${depth * 14 + 10}px` }}
                    onDragOver={(event) => {
                        event.preventDefault();
                        if (!draggingId || draggingId === element.id) return;
                        updateDragAutoScroll(event.clientY);
                        setDropIndicator({ targetId: element.id, placement: 'after' });
                    }}
                    onDragLeave={() => {
                        setDropIndicator((prev) => prev?.targetId === element.id && prev.placement === 'after' ? null : prev);
                    }}
                    onDrop={(event) => handleDrop(event, element.id, 'after')}
                />

                {element.type === 'frame' && draggingId !== element.id && (
                    <div
                        data-testid={`layer-nest-target-${element.id}`}
                        className={`ml-10 rounded-2xl border border-dashed text-[11px] font-medium transition-all ${draggingId ? 'px-3 py-2' : 'min-h-[8px] px-0 py-0 border-transparent bg-transparent text-transparent'} ${parentDropTarget === element.id ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : draggingId ? 'border-slate-200 bg-slate-50/80 text-slate-500' : ''}`}
                        style={{ marginLeft: `${depth * 14 + 42}px` }}
                        onDragOver={(event) => {
                            if (!draggingId) return;
                            event.preventDefault();
                            updateDragAutoScroll(event.clientY);
                            setParentDropTarget(element.id);
                            setDropIndicator(null);
                        }}
                        onDragLeave={() => {
                            setParentDropTarget((prev) => prev === element.id ? null : prev);
                        }}
                        onDrop={(event) => handleMoveToParentDrop(event, element.id)}
                    >
                        拖到这里加入“{getLayerLabel(element)}”
                    </div>
                )}

                {selected && (
                    <div className="flex items-center gap-0.5 py-0.5" style={{ marginLeft: `${depth * 12 + 30}px` }}>
                        <button
                            type="button"
                            title="上移一层"
                            aria-label="上移一层"
                            onClick={() => onBringForward([element.id])}
                            className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                        >
                            <ArrowUp size={12} />
                        </button>
                        <button
                            type="button"
                            title="下移一层"
                            aria-label="下移一层"
                            onClick={() => onSendBackward([element.id])}
                            className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                        >
                            <ArrowDown size={12} />
                        </button>
                        <button
                            type="button"
                            title="置于顶层"
                            aria-label="置于顶层"
                            onClick={() => onBringToFront([element.id])}
                            className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                        >
                            <ChevronsUp size={12} />
                        </button>
                        <button
                            type="button"
                            title="置于底层"
                            aria-label="置于底层"
                            onClick={() => onSendToBack([element.id])}
                            className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                        >
                            <ChevronsDown size={12} />
                        </button>
                    </div>
                )}

                {showStoryboardEditor && (
                    <div
                        className={`mt-1 rounded-md border bg-white p-2.5 shadow-sm ${hasStoryboardValidationError ? 'border-rose-200' : 'border-slate-200'}`}
                        style={{ marginLeft: `${depth * 12 + 30}px` }}
                    >
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <div className="text-[11px] font-semibold text-slate-700">分镜字段</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {hasStoryboardValidationError && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                                        <AlertCircle size={10} />
                                        需校验
                                    </span>
                                )}
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">快捷编辑</span>
                            </div>
                        </div>

                        {hasStoryboardValidationError && (
                            <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] leading-4 text-rose-700">
                                镜头号或时长格式不符合约定，修正后会自动保存。
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <label className={`rounded-md border bg-white px-2.5 py-2 shadow-sm ${storyboardShotCodeError ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'}`}>
                                <div className="text-[10px] font-medium text-slate-500">镜头号</div>
                                <input
                                    type="text"
                                    value={storyboardDraft.storyboardShotCode}
                                    onChange={(event) => updateStoryboardDraft(element.id, 'storyboardShotCode', event.target.value, element)}
                                    onBlur={() => commitStoryboardDraft(element.id, element)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            commitStoryboardDraft(element.id, element);
                                        }
                                        if (event.key === 'Escape') {
                                            resetStoryboardDraft(element.id);
                                        }
                                    }}
                                    placeholder="A01"
                                    className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                                />
                                {storyboardShotCodeError && (
                                    <div className="mt-1 text-[10px] leading-4 text-rose-600">{storyboardShotCodeError}</div>
                                )}
                            </label>
                            <label className="rounded-md border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                                <div className="text-[10px] font-medium text-slate-500">景别</div>
                                <input
                                    type="text"
                                    value={storyboardDraft.storyboardSceneType}
                                    onChange={(event) => updateStoryboardDraft(element.id, 'storyboardSceneType', event.target.value, element)}
                                    onBlur={() => commitStoryboardDraft(element.id, element)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            commitStoryboardDraft(element.id, element);
                                        }
                                        if (event.key === 'Escape') {
                                            resetStoryboardDraft(element.id);
                                        }
                                    }}
                                    placeholder="中景"
                                    className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                                />
                            </label>
                            <label className="rounded-md border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                                <div className="text-[10px] font-medium text-slate-500">运镜</div>
                                <input
                                    type="text"
                                    value={storyboardDraft.storyboardCameraMove}
                                    onChange={(event) => updateStoryboardDraft(element.id, 'storyboardCameraMove', event.target.value, element)}
                                    onBlur={() => commitStoryboardDraft(element.id, element)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            commitStoryboardDraft(element.id, element);
                                        }
                                        if (event.key === 'Escape') {
                                            resetStoryboardDraft(element.id);
                                        }
                                    }}
                                    placeholder="推镜"
                                    className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                                />
                            </label>
                            <label className={`rounded-md border bg-white px-2.5 py-2 shadow-sm ${storyboardDurationError ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'}`}>
                                <div className="text-[10px] font-medium text-slate-500">时长</div>
                                <input
                                    type="text"
                                    value={storyboardDraft.storyboardDuration}
                                    onChange={(event) => updateStoryboardDraft(element.id, 'storyboardDuration', event.target.value, element)}
                                    onBlur={() => commitStoryboardDraft(element.id, element)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            commitStoryboardDraft(element.id, element);
                                        }
                                        if (event.key === 'Escape') {
                                            resetStoryboardDraft(element.id);
                                        }
                                    }}
                                    placeholder="3s"
                                    className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                                />
                                {storyboardDurationError && (
                                    <div className="mt-1 text-[10px] leading-4 text-rose-600">{storyboardDurationError}</div>
                                )}
                            </label>
                        </div>

                        <label className="mt-2 block rounded-md border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                            <div className="text-[10px] font-medium text-slate-500">备注</div>
                            <input
                                type="text"
                                value={storyboardDraft.storyboardNote}
                                onChange={(event) => updateStoryboardDraft(element.id, 'storyboardNote', event.target.value, element)}
                                onBlur={() => commitStoryboardDraft(element.id, element)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        commitStoryboardDraft(element.id, element);
                                    }
                                    if (event.key === 'Escape') {
                                        resetStoryboardDraft(element.id);
                                    }
                                }}
                                placeholder="补充剧情动作或画面说明"
                                className="mt-1 w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-300"
                            />
                        </label>

                        {storyboardTemplates.length > 0 && (
                            <div className="mt-2 rounded-md border border-sky-100 bg-sky-50/60 px-2.5 py-2">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-[10px] font-semibold tracking-[0.08em] text-sky-700">模板快速套用</div>
                                        <div className="text-[10px] text-sky-500">点击模板即可将字段填入当前分镜。</div>
                                    </div>
                                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-sky-600 ring-1 ring-sky-100">{storyboardTemplates.length} 个模板</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {storyboardTemplates.slice(0, 6).map((template) => (
                                        <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => applyStoryboardTemplateToElement(element, template.value)}
                                            className="group rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[10px] font-medium text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100"
                                            title={[
                                                template.value.storyboardSceneType,
                                                template.value.storyboardCameraMove,
                                                template.value.storyboardDuration,
                                                template.value.storyboardNote,
                                            ].filter(Boolean).join(' · ') || template.name}
                                        >
                                            {template.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

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

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-2 py-1.5">
                <div
                    data-testid="layers-root-drop-zone"
                    className={`mb-1 rounded-md border border-dashed px-2.5 py-1.5 text-[10px] font-medium transition-all ${draggingId ? 'border-slate-300 bg-slate-50 text-slate-500' : 'border-transparent bg-transparent text-transparent h-0 overflow-hidden p-0 mb-0'} ${parentDropTarget === 'root' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''}`}
                    onDragOver={(event) => {
                        if (!draggingId) return;
                        event.preventDefault();
                        updateDragAutoScroll(event.clientY);
                        setParentDropTarget('root');
                        setDropIndicator(null);
                    }}
                    onDragLeave={() => {
                        setParentDropTarget((prev) => prev === 'root' ? null : prev);
                    }}
                    onDrop={(event) => handleMoveToParentDrop(event, undefined)}
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
                        <div className="mt-2 text-[12px] font-medium text-slate-700">{flattenedRows.rows.length === 0 ? '画布还没有可管理的图层' : '当前筛选没有匹配图层'}</div>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">{flattenedRows.rows.length === 0 ? '添加形状、图片或画板后，这里会自动显示层级结构。' : '可以尝试修改搜索词或切换筛选类型。'}</p>
                    </div>
                ) : (
                    <div className="relative" style={{ height: `${filteredRowsState.totalHeight}px` }}>
                        {visibleRows.map((row) => renderRow(row))}
                    </div>
                )}
            </div>

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
                        <>
                    <div className="mb-2 flex items-center justify-between text-[12px] text-slate-600">
                        <span>已选 {selectedIds.length} 个图层</span>
                        <span className="font-medium">批量操作</span>
                    </div>
                    <div className="mb-2 text-[12px] text-slate-500">{selectedParentSummary}</div>
                    <div className="mb-3 rounded-2xl border border-blue-200 bg-gradient-to-br from-violet-50 to-white p-2.5 shadow-sm">
                        {bulkRenameOpen ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-medium text-blue-700">
                                    <span>批量重命名</span>
                                    <span>{bulkRenameTargets.length} 项</span>
                                </div>
                                <input
                                    type="text"
                                    value={bulkRenameValue}
                                    autoFocus
                                    onChange={(event) => setBulkRenameValue(event.target.value)}
                                    onKeyDown={(event) => {
                                        event.stopPropagation();
                                        if (event.key === 'Enter') commitBulkRename();
                                        if (event.key === 'Escape') {
                                            setBulkRenameOpen(false);
                                            setBulkRenameValue('');
                                            setBulkRenameStart(1);
                                        }
                                    }}
                                    placeholder="输入前缀，如：镜头A"
                                    className="h-9 w-full rounded-md border border-blue-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none ring-2 ring-blue-100 placeholder:text-blue-300"
                                />
                                <div className="grid grid-cols-[1fr_92px] gap-2">
                                    <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-700">
                                        编号将按当前图层顺序依次递增。
                                    </div>
                                    <label className="rounded-md border border-blue-200 bg-white px-2.5 py-2">
                                        <div className="text-[10px] font-medium text-violet-500">起始编号</div>
                                        <input
                                            type="number"
                                            min={1}
                                            max={9999}
                                            value={bulkRenameStart}
                                            onChange={(event) => setBulkRenameStart(Math.max(1, Number(event.target.value) || 1))}
                                            className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none"
                                        />
                                    </label>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                    <span>示例：{(bulkRenameValue.trim() || '镜头A')} {String(Math.max(1, bulkRenameStart || 1)).padStart(2, '0')}</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBulkRenameOpen(false);
                                                setBulkRenameValue('');
                                                setBulkRenameStart(1);
                                            }}
                                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-500 transition-colors hover:bg-slate-50"
                                        >
                                            取消
                                        </button>
                                        <button
                                            type="button"
                                            onClick={commitBulkRename}
                                            disabled={!bulkRenameValue.trim()}
                                            className="rounded-lg bg-violet-600 px-2.5 py-1 font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            应用
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={openBulkRenamePanel}
                                className="flex w-full items-center justify-between rounded-md border border-blue-200 bg-white px-3 py-2 text-left text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Pencil size={14} />
                                    批量重命名
                                </span>
                                <span className="text-[11px] text-violet-500">按顺序编号</span>
                            </button>
                        )}
                    </div>
                    {bulkStoryboardTargets.length > 1 && (
                        <div className="mb-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-2.5 shadow-sm">
                            {bulkStoryboardOpen ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[11px] font-medium text-amber-700">
                                        <span>批量镜头编号</span>
                                        <span>{bulkStoryboardTargets.length} 张图片</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className={`rounded-md border bg-white px-2.5 py-2 shadow-sm ${bulkStoryboardPrefixError ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200'}`}>
                                            <div className="text-[10px] font-medium text-amber-500">前缀</div>
                                            <input
                                                type="text"
                                                value={bulkStoryboardPrefix}
                                                autoFocus
                                                onChange={(event) => setBulkStoryboardPrefix(event.target.value)}
                                                onKeyDown={(event) => {
                                                    event.stopPropagation();
                                                    if (event.key === 'Enter') commitBulkStoryboardNumbering();
                                                    if (event.key === 'Escape') {
                                                        setBulkStoryboardOpen(false);
                                                        setBulkStoryboardPrefix('A');
                                                        setBulkStoryboardStart(1);
                                                        setBulkStoryboardDigits(2);
                                                        setBulkStoryboardStep(1);
                                                        setBulkStoryboardSkipExisting(false);
                                                        setBulkStoryboardAvoidExistingNumbers(true);
                                                    }
                                                }}
                                                placeholder="A"
                                                className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-amber-300"
                                            />
                                            {bulkStoryboardPrefixError && (
                                                <div className="mt-1 text-[10px] leading-4 text-rose-600">{bulkStoryboardPrefixError}</div>
                                            )}
                                        </label>
                                        <label className="rounded-md border border-amber-200 bg-white px-2.5 py-2 shadow-sm">
                                            <div className="text-[10px] font-medium text-amber-500">起始号</div>
                                            <input
                                                type="number"
                                                min={1}
                                                max={9999}
                                                value={bulkStoryboardStart}
                                                onChange={(event) => setBulkStoryboardStart(Math.max(1, Number(event.target.value) || 1))}
                                                className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none"
                                            />
                                        </label>
                                        <label className="rounded-md border border-amber-200 bg-white px-2.5 py-2 shadow-sm">
                                            <div className="text-[10px] font-medium text-amber-500">位数</div>
                                            <input
                                                type="number"
                                                min={1}
                                                max={6}
                                                value={bulkStoryboardDigits}
                                                onChange={(event) => setBulkStoryboardDigits(Math.max(1, Math.min(6, Number(event.target.value) || 2)))}
                                                className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none"
                                            />
                                        </label>
                                        <label className="rounded-md border border-amber-200 bg-white px-2.5 py-2 shadow-sm">
                                            <div className="text-[10px] font-medium text-amber-500">步长</div>
                                            <input
                                                type="number"
                                                min={1}
                                                max={999}
                                                value={bulkStoryboardStep}
                                                onChange={(event) => setBulkStoryboardStep(Math.max(1, Math.min(999, Number(event.target.value) || 1)))}
                                                className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none"
                                            />
                                        </label>
                                    </div>
                                    <label className="flex items-center gap-2 rounded-md border border-amber-100 bg-white/80 px-3 py-2 text-[11px] text-amber-700">
                                        <input
                                            type="checkbox"
                                            checked={bulkStoryboardSkipExisting}
                                            onChange={(event) => setBulkStoryboardSkipExisting(event.target.checked)}
                                            className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <span>跳过已有镜头号的图片，仅补齐空缺项</span>
                                    </label>
                                    <label className="flex items-center gap-2 rounded-md border border-amber-100 bg-white/80 px-3 py-2 text-[11px] text-amber-700">
                                        <input
                                            type="checkbox"
                                            checked={bulkStoryboardAvoidExistingNumbers}
                                            onChange={(event) => setBulkStoryboardAvoidExistingNumbers(event.target.checked)}
                                            className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <span>自动避让当前已存在的相同前缀编号</span>
                                    </label>
                                    <div className={`rounded-md border px-3 py-2 text-[11px] ${bulkStoryboardPrefixError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-100 bg-amber-50/60 text-amber-700'}`}>
                                        将按当前图层顺序生成镜头号，示例：{(bulkStoryboardPrefix.trim().toUpperCase() || 'A')}{String(Math.max(1, bulkStoryboardStart || 1)).padStart(Math.max(1, bulkStoryboardDigits || 2), '0')}
                                        {bulkStoryboardStep > 1 ? `，下一项会递增 ${bulkStoryboardStep}` : ''}
                                        {bulkStoryboardSkipExisting ? '，并跳过已存在编号的图片。' : ''}
                                        {bulkStoryboardAvoidExistingNumbers ? ' 如遇到相同前缀且已占用的编号，会自动顺延避开。' : ''}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                        <span>适合连续镜头快速编号，也可用于隔号排布。</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBulkStoryboardOpen(false);
                                                    setBulkStoryboardPrefix('A');
                                                    setBulkStoryboardStart(1);
                                                    setBulkStoryboardDigits(2);
                                                    setBulkStoryboardStep(1);
                                                    setBulkStoryboardSkipExisting(false);
                                                    setBulkStoryboardAvoidExistingNumbers(true);
                                                }}
                                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-500 transition-colors hover:bg-slate-50"
                                            >
                                                取消
                                            </button>
                                            <button
                                                type="button"
                                                onClick={commitBulkStoryboardNumbering}
                                                disabled={!!bulkStoryboardPrefixError}
                                                className="rounded-lg bg-amber-500 px-2.5 py-1 font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                应用
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={openBulkStoryboardNumberingPanel}
                                    className="flex w-full items-center justify-between rounded-md border border-amber-200 bg-white px-3 py-2 text-left text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <Type size={14} />
                                        批量镜头编号
                                    </span>
                                    <span className="text-[11px] text-amber-500">A01 / A02 / A03</span>
                                </button>
                            )}
                        </div>
                    )}
                    {bulkStoryboardTargets.length > 1 && (
                        <div className="mb-3 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-2.5 shadow-sm">
                            {bulkStoryboardMetaOpen ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[11px] font-medium text-sky-700">
                                        <span>批量套用分镜字段</span>
                                        <span>{bulkStoryboardTargets.length} 张图片</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="rounded-md border border-sky-200 bg-white px-2.5 py-2 shadow-sm">
                                            <div className="text-[10px] font-medium text-sky-500">景别</div>
                                            <input
                                                type="text"
                                                value={bulkStoryboardSceneType}
                                                autoFocus
                                                onChange={(event) => setBulkStoryboardSceneType(event.target.value)}
                                                onKeyDown={(event) => {
                                                    event.stopPropagation();
                                                    if (event.key === 'Enter') commitBulkStoryboardMeta();
                                                    if (event.key === 'Escape') {
                                                        setBulkStoryboardMetaOpen(false);
                                                        setBulkStoryboardSceneType('');
                                                        setBulkStoryboardCameraMove('');
                                                        setBulkStoryboardDuration('');
                                                        setBulkStoryboardNote('');
                                                    }
                                                }}
                                                placeholder="如：中景"
                                                className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-sky-300"
                                            />
                                        </label>
                                        <label className="rounded-md border border-sky-200 bg-white px-2.5 py-2 shadow-sm">
                                            <div className="text-[10px] font-medium text-sky-500">运镜</div>
                                            <input
                                                type="text"
                                                value={bulkStoryboardCameraMove}
                                                onChange={(event) => setBulkStoryboardCameraMove(event.target.value)}
                                                placeholder="如：推镜"
                                                className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-sky-300"
                                            />
                                        </label>
                                        <label className={`rounded-md border bg-white px-2.5 py-2 shadow-sm ${bulkStoryboardDurationError ? 'border-rose-200 bg-rose-50/50' : 'border-sky-200'}`}>
                                            <div className="text-[10px] font-medium text-sky-500">时长</div>
                                            <input
                                                type="text"
                                                value={bulkStoryboardDuration}
                                                onChange={(event) => setBulkStoryboardDuration(event.target.value)}
                                                placeholder="如：3s"
                                                className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-sky-300"
                                            />
                                            {bulkStoryboardDurationError && (
                                                <div className="mt-1 text-[10px] leading-4 text-rose-600">{bulkStoryboardDurationError}</div>
                                            )}
                                        </label>
                                        <label className="rounded-md border border-sky-200 bg-white px-2.5 py-2 shadow-sm">
                                            <div className="text-[10px] font-medium text-sky-500">备注模板</div>
                                            <input
                                                type="text"
                                                value={bulkStoryboardNote}
                                                onChange={(event) => setBulkStoryboardNote(event.target.value)}
                                                placeholder="如：角色转头看向镜头"
                                                className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-sky-300"
                                            />
                                        </label>
                                    </div>
                                    <div className={`rounded-md border px-3 py-2 text-[11px] ${bulkStoryboardDurationError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-100 bg-sky-50/70 text-sky-700'}`}>
                                        仅会覆盖当前填写过的字段；留空项不会修改原值。
                                        {bulkStoryboardDurationError ? ' 请先修正时长格式。' : ''}
                                    </div>
                                    <div className="rounded-2xl border border-sky-100 bg-white/85 p-2.5 shadow-sm">
                                        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-sky-700">
                                            <span>分镜模板预设</span>
                                            <span className="text-sky-500">保存常用字段组合</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={storyboardTemplateName}
                                                onChange={(event) => setStoryboardTemplateName(event.target.value)}
                                                placeholder="例如：对话中景模板"
                                                className="h-9 flex-1 rounded-md border border-sky-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none placeholder:text-sky-300"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = saveStoryboardMetaTemplate(storyboardTemplateName || '分镜模板', {
                                                        storyboardSceneType: bulkStoryboardSceneType,
                                                        storyboardCameraMove: bulkStoryboardCameraMove,
                                                        storyboardDuration: bulkStoryboardDuration,
                                                        storyboardNote: bulkStoryboardNote,
                                                    });
                                                    setStoryboardTemplates(next);
                                                    setStoryboardTemplateHint('已保存分镜模板');
                                                    setStoryboardTemplateName('');
                                                }}
                                                disabled={(!bulkStoryboardSceneType.trim() && !bulkStoryboardCameraMove.trim() && !bulkStoryboardDuration.trim() && !bulkStoryboardNote.trim()) || !!bulkStoryboardDurationError}
                                                className="rounded-md border border-sky-200 bg-white px-3 py-2 text-[11px] font-medium text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                保存模板
                                            </button>
                                        </div>
                                        {storyboardTemplateHint && (
                                            <div className="mt-2 text-[11px] text-sky-600">{storyboardTemplateHint}</div>
                                        )}
                                        {storyboardTemplates.length > 0 && (
                                            <div className="mt-3 space-y-1.5 rounded-md border border-sky-100 bg-sky-50/60 p-2">
                                                {storyboardTemplates.map((template) => (
                                                    <div key={template.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/90 px-2.5 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setBulkStoryboardSceneType(template.value.storyboardSceneType || '');
                                                                setBulkStoryboardCameraMove(template.value.storyboardCameraMove || '');
                                                                setBulkStoryboardDuration(template.value.storyboardDuration || '');
                                                                setBulkStoryboardNote(template.value.storyboardNote || '');
                                                                setStoryboardTemplateHint(`已载入模板：${template.name}`);
                                                            }}
                                                            className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-sky-800 hover:text-sky-900"
                                                        >
                                                            {template.name}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const next = deleteStoryboardMetaTemplate(template.id);
                                                                setStoryboardTemplates(next);
                                                                setStoryboardTemplateHint(`已删除模板：${template.name}`);
                                                            }}
                                                            className="text-[11px] text-sky-500 hover:text-red-500"
                                                        >
                                                            删除
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                        <span>适合快速统一镜头参数。</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBulkStoryboardMetaOpen(false);
                                                    setBulkStoryboardSceneType('');
                                                    setBulkStoryboardCameraMove('');
                                                    setBulkStoryboardDuration('');
                                                    setBulkStoryboardNote('');
                                                }}
                                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-500 transition-colors hover:bg-slate-50"
                                            >
                                                取消
                                            </button>
                                            <button
                                                type="button"
                                                onClick={commitBulkStoryboardMeta}
                                                disabled={(!bulkStoryboardSceneType.trim() && !bulkStoryboardCameraMove.trim() && !bulkStoryboardDuration.trim() && !bulkStoryboardNote.trim()) || !!bulkStoryboardDurationError}
                                                className="rounded-lg bg-sky-600 px-2.5 py-1 font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                应用
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={openBulkStoryboardMetaPanel}
                                    className="flex w-full items-center justify-between rounded-md border border-sky-200 bg-white px-3 py-2 text-left text-sm font-medium text-sky-700 transition-colors hover:bg-sky-50"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <LayoutGrid size={14} />
                                        批量套用分镜字段
                                    </span>
                                    <span className="text-[11px] text-sky-500">景别 / 运镜 / 时长</span>
                                </button>
                            )}
                        </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            title={selectedHidden ? '显示所选图层' : '隐藏所选图层'}
                            onClick={() => onToggleHidden(selectedIds)}
                            className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"
                        >
                            {selectedHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                            type="button"
                            title={selectedLocked ? '解锁所选图层' : '锁定所选图层'}
                            onClick={() => onToggleLocked(selectedIds)}
                            className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"
                        >
                            {selectedLocked ? <Unlock size={14} /> : <Lock size={14} />}
                        </button>
                        <button
                            type="button"
                            title="移到根层级"
                            onClick={() => onMoveLayerToParent(selectedIds, undefined)}
                            className="rounded-md border border-emerald-200 bg-white px-2 py-2 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                        >
                            根层级
                        </button>
                        <button
                            type="button"
                            title="上移一层"
                            onClick={() => onBringForward(selectedIds)}
                            className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"
                        >
                            <ArrowUp size={14} />
                        </button>
                        <button
                            type="button"
                            title="下移一层"
                            onClick={() => onSendBackward(selectedIds)}
                            className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"
                        >
                            <ArrowDown size={14} />
                        </button>
                        <button
                            type="button"
                            title="置于顶层"
                            onClick={() => onBringToFront(selectedIds)}
                            className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"
                        >
                            <ChevronsUp size={14} />
                        </button>
                        <button
                            type="button"
                            title="置于底层"
                            onClick={() => onSendToBack(selectedIds)}
                            className="flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100"
                        >
                            <ChevronsDown size={14} />
                        </button>
                        <button
                            type="button"
                            title="批量删除"
                            onClick={() => onDeleteSelection(selectedIds)}
                            className="flex items-center justify-center rounded-md border border-red-200 bg-white px-2 py-2 text-red-500 transition-colors hover:bg-red-50"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                        </>
                    )}
                </div>
            )}
        </div>
        </PanelShell>
    );
}
