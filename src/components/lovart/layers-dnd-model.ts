export type LayerDropPlacement = 'before' | 'after';
export type LayerParentDropTarget = string | 'root' | null;

export interface LayerDropIndicator {
    targetId: string;
    placement: LayerDropPlacement;
}

export interface LayersPanelMoveToParentDetail {
    draggedId?: string;
    draggedIds?: string[];
    parentId?: string | null;
}

export interface LayersPanelReorderDetail {
    draggedId?: string;
    draggedIds?: string[];
    targetId?: string;
    placement?: LayerDropPlacement;
}

export interface LayerDragPayload {
    primaryId: string;
    ids: string[];
}

export interface LayerDragDataTransferReader {
    getData(type: string): string;
}

function normalizeLayerIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((id) => typeof id === 'string' ? id.trim() : '')
        .filter(Boolean);
}

function normalizeSingleLayerId(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
}

export function buildLayerDragPayload({
    primaryId,
    selectedIds,
    isPrimarySelected,
}: {
    primaryId: string;
    selectedIds: string[];
    isPrimarySelected: boolean;
}): LayerDragPayload {
    return {
        primaryId,
        ids: isPrimarySelected && selectedIds.length > 1 ? selectedIds : [primaryId],
    };
}

export function readLayerDragIds({
    dataTransfer,
    fallbackDraggingId,
}: {
    dataTransfer?: LayerDragDataTransferReader | null;
    fallbackDraggingId?: string | null;
}): string[] {
    const jsonPayload = dataTransfer?.getData('application/json');
    if (jsonPayload) {
        try {
            const parsed = JSON.parse(jsonPayload) as Partial<LayerDragPayload>;
            const ids = normalizeLayerIds(parsed.ids);
            if (ids.length > 0) {
                return ids;
            }
        } catch {
            // Malformed drag payloads fall back to text/plain or the active drag id.
        }
    }

    const draggedId = normalizeSingleLayerId(fallbackDraggingId) || normalizeSingleLayerId(dataTransfer?.getData('text/plain'));
    return draggedId ? [draggedId] : [];
}

export function getLayerDropPlacement(clientY: number, top: number, height: number): LayerDropPlacement {
    return clientY < top + height / 2 ? 'before' : 'after';
}

export function normalizeLayerMoveToParentDetail(detail: LayersPanelMoveToParentDetail | undefined | null) {
    const draggedId = normalizeSingleLayerId(detail?.draggedId);
    const draggedIds = normalizeLayerIds(detail?.draggedIds);
    const parentId = normalizeSingleLayerId(detail?.parentId);
    const effectiveDraggedIds = draggedIds.length > 0 ? draggedIds : draggedId ? [draggedId] : [];

    if (effectiveDraggedIds.length === 0) {
        return null;
    }

    return {
        draggedIds: effectiveDraggedIds,
        parentId,
    };
}

export function normalizeLayerReorderDetail(detail: LayersPanelReorderDetail | undefined | null) {
    const draggedId = normalizeSingleLayerId(detail?.draggedId);
    const draggedIds = normalizeLayerIds(detail?.draggedIds);
    const targetId = normalizeSingleLayerId(detail?.targetId);
    const placement = detail?.placement === 'before' || detail?.placement === 'after' ? detail.placement : undefined;
    const effectiveDraggedIds = draggedIds.length > 0 ? draggedIds : draggedId ? [draggedId] : [];

    if (effectiveDraggedIds.length === 0 || !targetId || !placement || effectiveDraggedIds.includes(targetId)) {
        return null;
    }

    return {
        draggedIds: effectiveDraggedIds,
        targetId,
        placement,
    };
}

export function canApplyLayerDropReorder({
    draggedIds,
    targetId,
    hasElement,
}: {
    draggedIds: string[];
    targetId: string;
    hasElement: (id: string) => boolean;
}) {
    return draggedIds.length > 0
        && !draggedIds.includes(targetId)
        && draggedIds.some((id) => hasElement(id));
}

export function canApplyLayerTestReorder({
    draggedIds,
    targetId,
    hasElement,
}: {
    draggedIds: string[];
    targetId: string;
    hasElement: (id: string) => boolean;
}) {
    return draggedIds.length > 0
        && !draggedIds.includes(targetId)
        && hasElement(draggedIds[0])
        && hasElement(targetId);
}

export function buildLayerDragHintLabel({
    draggingId,
    parentDropTarget,
    dropIndicator,
    draggedCount,
    getLabel,
}: {
    draggingId: string | null;
    parentDropTarget: LayerParentDropTarget;
    dropIndicator: LayerDropIndicator | null;
    draggedCount: number;
    getLabel: (id: string) => string | null;
}) {
    if (!draggingId) {
        return '';
    }

    if (parentDropTarget === 'root') {
        return '释放后移到根层级';
    }

    if (parentDropTarget) {
        return `释放后加入“${getLabel(parentDropTarget) || '画板'}”`;
    }

    if (dropIndicator) {
        const action = dropIndicator.placement === 'before' ? '释放后排到前面' : '释放后排到后面';
        return `${action} · ${getLabel(dropIndicator.targetId) || '目标图层'}`;
    }

    return draggedCount > 1 ? `正在拖动 ${draggedCount} 个图层` : '正在拖动图层';
}