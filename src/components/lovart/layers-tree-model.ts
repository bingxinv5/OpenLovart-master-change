import { getStoryboardShotSortTuple, validateStoryboardDuration, validateStoryboardShotCode } from '@/lib/storyboard-utils';
import type { CanvasElement } from './canvas-types';

export interface LayerNode {
    element: CanvasElement;
    children: LayerNode[];
}

export interface FlattenedLayerRow {
    element: CanvasElement;
    children: LayerNode[];
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
    top: number;
    height: number;
}

export type LayerFilterType = 'all' | 'image' | 'frame' | 'text' | 'shape' | 'video' | 'other';
export type LayerSortMode = 'canvas' | 'storyboard-shot';
export type StoryboardAuditFilter = 'all' | 'ready' | 'partial' | 'invalid' | 'untracked';

export interface LayerRowsState {
    rows: FlattenedLayerRow[];
    totalHeight: number;
}

const LAYER_ROW_BASE_HEIGHT = 36;
const LAYER_ROW_SELECTED_ACTIONS_HEIGHT = 28;
const LAYER_ROW_STORYBOARD_META_HEIGHT = 140;
const LAYER_ROW_NEST_TARGET_HEIGHT = 32;
const LAYER_ROW_GAP_HEIGHT = 4;
const LAYER_ROW_OVERSCAN = 8;

export function getLayerLabel(element: CanvasElement) {
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

export function getStoryboardAuditState(element: CanvasElement) {
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

function getLayerFilterType(element: CanvasElement): LayerFilterType {
    if (element.type === 'image') return 'image';
    if (element.type === 'frame') return 'frame';
    if (element.type === 'text') return 'text';
    if (element.type === 'shape' || element.type === 'path' || element.type === 'mark') return 'shape';
    if (element.type === 'video' || element.type === 'video-generator') return 'video';
    return 'other';
}

export const LayerTreeBuilder = {
    buildTree(elements: CanvasElement[]): LayerNode[] {
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
    },

    flattenRows({
        layerTree,
        expandedMap,
        selectedIdSet,
        draggingId,
    }: {
        layerTree: LayerNode[];
        expandedMap: Record<string, boolean>;
        selectedIdSet: Set<string>;
        draggingId: string | null;
    }): LayerRowsState {
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
    },

    filterRows({
        flattenedRows,
        layerQuery,
        layerFilterType,
        layerSortMode,
        storyboardOnly,
        storyboardAuditFilter,
    }: {
        flattenedRows: FlattenedLayerRow[];
        layerQuery: string;
        layerFilterType: LayerFilterType;
        layerSortMode: LayerSortMode;
        storyboardOnly: boolean;
        storyboardAuditFilter: StoryboardAuditFilter;
    }): LayerRowsState {
        const query = layerQuery.trim().toLowerCase();
        const filteredRows = flattenedRows
            .filter((row) => {
                const typeMatched = layerFilterType === 'all' || getLayerFilterType(row.element) === layerFilterType;
                const label = getLayerLabel(row.element).toLowerCase();
                const queryMatched = !query || label.includes(query) || row.element.type.toLowerCase().includes(query);
                const storyboardMatched = !storyboardOnly || !!row.element.storyboardShotCode?.trim();
                let storyboardAuditMatched = true;

                if (storyboardAuditFilter !== 'all') {
                    if (row.element.type !== 'image') {
                        storyboardAuditMatched = false;
                    } else {
                        const auditState = getStoryboardAuditState(row.element);
                        storyboardAuditMatched = (
                            (storyboardAuditFilter === 'ready' && auditState.isReady)
                            || (storyboardAuditFilter === 'partial' && auditState.isPartial)
                            || (storyboardAuditFilter === 'invalid' && auditState.hasValidationError)
                            || (storyboardAuditFilter === 'untracked' && auditState.isUntracked)
                        );
                    }
                }

                return typeMatched && queryMatched && storyboardMatched && storyboardAuditMatched;
            });

        if (layerSortMode === 'storyboard-shot') {
            filteredRows.sort((firstRow, secondRow) => {
                const tupleA = getStoryboardShotSortTuple(firstRow.element.storyboardShotCode, getLayerLabel(firstRow.element));
                const tupleB = getStoryboardShotSortTuple(secondRow.element.storyboardShotCode, getLayerLabel(secondRow.element));
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
    },

    visibleRows(rows: FlattenedLayerRow[], scrollTop: number, viewportHeight: number) {
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
    },
};