'use client';

import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { isCanvasElementOfType } from '@/components/lovart/canvas-types';
import { computeReorder } from '@/components/lovart/canvas-alignment';
import { isImageRef, getImageDataUrl, type PatchMetadata } from '@/lib/editor-kernel';
import type { WorkbenchSettings } from '@/lib/workbench-settings';
import {
    collectSelectionWithFrameChildren as _collectSelectionWithFrameChildren,
} from './canvas-element-ops';
import { getDefaultImagePresentation } from './canvas-page-utils';

// ---------------------------------------------------------------------------
// Pure helpers – no React state, safe to call from anywhere
// ---------------------------------------------------------------------------

/** Recursively collect all descendant element IDs inside a frame tree. */
export function collectFrameDescendants(sourceElements: CanvasElement[], frameId: string): Set<string> {
    const descendants = new Set<string>();
    const collect = (parentId: string) => {
        sourceElements.forEach((element) => {
            if (element.parentFrameId === parentId && !descendants.has(element.id)) {
                descendants.add(element.id);
                if (isCanvasElementOfType(element, 'frame')) {
                    collect(element.id);
                }
            }
        });
    };
    collect(frameId);
    return descendants;
}

/**
 * Normalise a list of dragged/selected IDs so that if a parent frame is
 * already selected the children are de-duped out.
 */
export function normalizeLayerDragIds(sourceElements: CanvasElement[], ids: string[]): string[] {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return [];

    const selectedSet = new Set(uniqueIds);
    const parentById = new Map(sourceElements.map((element) => [element.id, element.parentFrameId || undefined]));

    return sourceElements
        .filter((element) => selectedSet.has(element.id))
        .filter((element) => {
            let currentParentId = parentById.get(element.id);
            while (currentParentId) {
                if (selectedSet.has(currentParentId)) return false;
                currentParentId = parentById.get(currentParentId);
            }
            return true;
        })
        .map((element) => element.id);
}

/**
 * For a set of top-level dragged IDs, expand to include all nested children
 * (block move), keeping source order.
 */
export function collectLayerMoveBlockIds(sourceElements: CanvasElement[], ids: string[]): string[] {
    const topLevelIds = normalizeLayerDragIds(sourceElements, ids);
    if (topLevelIds.length === 0) return [];

    const includedIds = new Set<string>(topLevelIds);
    const queue = [...topLevelIds];
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId) continue;
        sourceElements.forEach((element) => {
            if (element.parentFrameId === currentId && !includedIds.has(element.id)) {
                includedIds.add(element.id);
                if (isCanvasElementOfType(element, 'frame')) queue.push(element.id);
            }
        });
    }

    return sourceElements.filter((element) => includedIds.has(element.id)).map((element) => element.id);
}

/**
 * Move a set of layers within the elements array, optionally re-parenting
 * them to a new frame and inserting relative to a target element.
 */
export function moveLayerInArray(
    sourceElements: CanvasElement[],
    draggedIds: string[],
    nextParentId?: string,
    targetId?: string,
    placement: 'before' | 'after' = 'after',
): CanvasElement[] {
    const normalizedDraggedIds = normalizeLayerDragIds(sourceElements, draggedIds);
    if (normalizedDraggedIds.length === 0) return sourceElements;

    const draggedIdSet = new Set(normalizedDraggedIds);
    const draggedBlockIds = collectLayerMoveBlockIds(sourceElements, normalizedDraggedIds);
    const draggedBlockIdSet = new Set(draggedBlockIds);
    const movedElements = sourceElements
        .filter((element) => draggedBlockIdSet.has(element.id))
        .map((element) => ({
            ...element,
            parentFrameId: draggedIdSet.has(element.id) ? nextParentId : element.parentFrameId,
        }));
    const nextElements = sourceElements.filter((element) => !draggedBlockIdSet.has(element.id));

    if (targetId) {
        if (draggedBlockIdSet.has(targetId)) return sourceElements;
        const targetIndex = nextElements.findIndex((element) => element.id === targetId);
        const insertIndex = targetIndex < 0
            ? nextElements.length
            : placement === 'before' ? targetIndex : targetIndex + 1;
        nextElements.splice(insertIndex, 0, ...movedElements);
        return nextElements;
    }

    let insertIndex = nextElements.length;

    if (nextParentId) {
        const siblingIndices = nextElements.reduce<number[]>((indices, element, index) => {
            if ((element.parentFrameId || undefined) === nextParentId) indices.push(index);
            return indices;
        }, []);
        if (siblingIndices.length > 0) {
            insertIndex = siblingIndices[siblingIndices.length - 1] + 1;
        } else {
            const parentIndex = nextElements.findIndex((element) => element.id === nextParentId);
            insertIndex = parentIndex >= 0 ? parentIndex + 1 : nextElements.length;
        }
    } else {
        const rootIndices = nextElements.reduce<number[]>((indices, element, index) => {
            if (!element.parentFrameId) indices.push(index);
            return indices;
        }, []);
        if (rootIndices.length > 0) {
            insertIndex = rootIndices[rootIndices.length - 1] + 1;
        }
    }

    nextElements.splice(insertIndex, 0, ...movedElements);
    return nextElements;
}

// ---------------------------------------------------------------------------
// Hook – selection-aware canvas mutation actions
// ---------------------------------------------------------------------------

export interface UseCanvasActionsArgs {
    elements: CanvasElement[];
    setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
    setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
    handleElementChange: (id: string, newAttrs: Partial<CanvasElement>) => void;
    addElement: (element: CanvasElement) => void;
    removeElementsByIds: (ids: string[]) => void;
    runHistoryTransaction: (metadata: PatchMetadata, action: () => PatchMetadata | void) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
    flashLayerHighlights: (ids: string[]) => void;
    workbenchSettings: WorkbenchSettings;
}

export function useCanvasActions({
    elements,
    setElements,
    setSelectedIds,
    handleElementChange,
    addElement,
    removeElementsByIds,
    runHistoryTransaction,
    showToast,
    flashLayerHighlights,
    workbenchSettings,
}: UseCanvasActionsArgs) {

    // --- Selection helpers (bound to current elements) ---

    const collectSelectionWithFrameChildren = useCallback((ids: string[]) => {
        return _collectSelectionWithFrameChildren(ids, elements);
    }, [elements]);

    const selectSingleElement = useCallback((elementId: string) => {
        setSelectedIds([elementId]);
    }, [setSelectedIds]);

    // --- Toggle hidden / locked ---

    const handleToggleElementsHidden = useCallback((ids: string[]) => {
        const expandedIds = collectSelectionWithFrameChildren(ids);
        const targetElements = elements.filter(el => expandedIds.includes(el.id));
        if (targetElements.length === 0) return;

        const shouldHide = targetElements.some(el => !el.hidden);
        runHistoryTransaction({
            label: shouldHide ? '批量隐藏图层' : '批量显示图层',
            source: 'layers-toggle-hidden',
        }, () => {
            targetElements.forEach(el => {
                handleElementChange(el.id, { hidden: shouldHide });
            });
            if (shouldHide) {
                setSelectedIds(prev => prev.filter(id => !expandedIds.includes(id)));
            }
            showToast(shouldHide ? '已隐藏所选元素' : '已显示所选元素', 'success');
        });
    }, [collectSelectionWithFrameChildren, elements, handleElementChange, runHistoryTransaction, setSelectedIds, showToast]);

    const handleToggleElementsLocked = useCallback((ids: string[]) => {
        const expandedIds = collectSelectionWithFrameChildren(ids);
        const targetElements = elements.filter(el => expandedIds.includes(el.id));
        if (targetElements.length === 0) return;

        const shouldLock = targetElements.some(el => !(el.locked || (el.type === 'frame' && el.frameLocked)));
        runHistoryTransaction({
            label: shouldLock ? '批量锁定图层' : '批量解锁图层',
            source: 'layers-toggle-locked',
        }, () => {
            targetElements.forEach(el => {
                handleElementChange(el.id, el.type === 'frame'
                    ? { locked: shouldLock, frameLocked: shouldLock }
                    : { locked: shouldLock });
            });
            showToast(shouldLock ? '已锁定所选元素' : '已解锁所选元素', 'success');
        });
    }, [collectSelectionWithFrameChildren, elements, handleElementChange, runHistoryTransaction, showToast]);

    // --- Group / Ungroup ---

    const handleGroupSelection = useCallback((ids: string[]) => {
        const selectedEls = elements.filter(el => ids.includes(el.id) && el.type !== 'connector');
        if (selectedEls.length < 2) return;

        const xs = selectedEls.map(el => el.x);
        const ys = selectedEls.map(el => el.y);
        const xe = selectedEls.map(el => el.x + (el.width || 0));
        const ye = selectedEls.map(el => el.y + (el.height || 0));
        const padding = 20;
        const fx = Math.min(...xs) - padding;
        const fy = Math.min(...ys) - padding;
        const fw = Math.max(...xe) - fx + padding;
        const fh = Math.max(...ye) - fy + padding;
        const frameId = uuidv4();
        const newFrame: CanvasElement = {
            id: frameId,
            type: 'frame',
            x: fx,
            y: fy,
            width: fw,
            height: fh,
            framePreset: 'Custom',
            frameBgColor: '#FFFFFF',
            frameClip: true,
            frameName: 'Group',
            groupFrame: true,
        };

        runHistoryTransaction({ label: '创建编组', source: 'selection-group' }, () => {
            addElement(newFrame);
            selectedEls.forEach(el => handleElementChange(el.id, { parentFrameId: frameId }));
            selectSingleElement(frameId);
            showToast('已创建编组', 'success');
            return { selectionAfter: [frameId] };
        });
    }, [addElement, elements, handleElementChange, runHistoryTransaction, selectSingleElement, showToast]);

    const handleUngroupSelection = useCallback((ids: string[]) => {
        const groupFrames = elements.filter(el => ids.includes(el.id) && el.type === 'frame' && el.groupFrame);
        if (groupFrames.length === 0) {
            showToast('当前选择中没有可解除的编组', 'info');
            return;
        }

        const releasedIds: string[] = [];
        groupFrames.forEach((frame) => {
            elements
                .filter(child => child.parentFrameId === frame.id)
                .forEach(child => {
                    handleElementChange(child.id, { parentFrameId: undefined });
                    releasedIds.push(child.id);
                });
        });

        runHistoryTransaction({ label: '解除编组', source: 'selection-ungroup' }, () => {
            removeElementsByIds(groupFrames.map(frame => frame.id));
            if (releasedIds.length > 0) {
                setSelectedIds(releasedIds);
            }
            showToast('已解除编组', 'success');
            return { selectionAfter: releasedIds };
        });
    }, [elements, handleElementChange, removeElementsByIds, runHistoryTransaction, setSelectedIds, showToast]);

    // --- Merge ---

    const handleMergeSelection = useCallback(async (ids: string[]) => {
        const mergeableElements = elements
            .filter(el => ids.includes(el.id) && ['image', 'text', 'shape', 'path'].includes(el.type) && !el.hidden)
            .sort((a, b) => elements.indexOf(a) - elements.indexOf(b));

        if (mergeableElements.length < 2) {
            showToast('至少选择两个可合并元素', 'info');
            return;
        }

        const minX = Math.min(...mergeableElements.map(el => el.x));
        const minY = Math.min(...mergeableElements.map(el => el.y));
        const maxX = Math.max(...mergeableElements.map(el => el.x + (el.width || 0)));
        const maxY = Math.max(...mergeableElements.map(el => el.y + (el.height || 0)));
        const width = Math.max(1, Math.ceil(maxX - minX));
        const height = Math.max(1, Math.ceil(maxY - minY));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            showToast('无法创建合并画布', 'error');
            return;
        }

        const drawImageElement = async (element: CanvasElement) => {
            if (!element.content) return;
            const src = isImageRef(element.content) ? await getImageDataUrl(element.content) || element.content : element.content;
            await new Promise<void>((resolve) => {
                const img = new window.Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    ctx.drawImage(img, element.x - minX, element.y - minY, element.width || img.naturalWidth, element.height || img.naturalHeight);
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = src;
            });
        };

        const drawTextElement = (element: CanvasElement) => {
            ctx.font = `${element.fontSize || 24}px ${element.fontFamily || 'Inter'}`;
            ctx.fillStyle = element.color || '#000000';
            ctx.textBaseline = 'top';
            ctx.fillText(element.content || '', element.x - minX, element.y - minY);
        };

        const drawShapeElement = (element: CanvasElement) => {
            const x = element.x - minX;
            const y = element.y - minY;
            const w = element.width || 0;
            const h = element.height || 0;
            const color = element.color || '#9CA3AF';
            ctx.fillStyle = color;
            ctx.strokeStyle = color;

            switch (element.shapeType) {
                case 'circle':
                    ctx.beginPath();
                    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                case 'triangle':
                    ctx.beginPath();
                    ctx.moveTo(x + w / 2, y);
                    ctx.lineTo(x + w, y + h);
                    ctx.lineTo(x, y + h);
                    ctx.closePath();
                    ctx.fill();
                    break;
                case 'message':
                    ctx.beginPath();
                    ctx.roundRect(x, y, w, h * 0.82, 16);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(x + w * 0.22, y + h * 0.82);
                    ctx.lineTo(x + w * 0.36, y + h);
                    ctx.lineTo(x + w * 0.42, y + h * 0.82);
                    ctx.closePath();
                    ctx.fill();
                    break;
                case 'arrow-left':
                    ctx.beginPath();
                    ctx.moveTo(x + w * 0.35, y);
                    ctx.lineTo(x, y + h / 2);
                    ctx.lineTo(x + w * 0.35, y + h);
                    ctx.lineTo(x + w * 0.35, y + h * 0.68);
                    ctx.lineTo(x + w, y + h * 0.68);
                    ctx.lineTo(x + w, y + h * 0.32);
                    ctx.lineTo(x + w * 0.35, y + h * 0.32);
                    ctx.closePath();
                    ctx.fill();
                    break;
                case 'arrow-right':
                    ctx.beginPath();
                    ctx.moveTo(x + w * 0.65, y);
                    ctx.lineTo(x + w, y + h / 2);
                    ctx.lineTo(x + w * 0.65, y + h);
                    ctx.lineTo(x + w * 0.65, y + h * 0.68);
                    ctx.lineTo(x, y + h * 0.68);
                    ctx.lineTo(x, y + h * 0.32);
                    ctx.lineTo(x + w * 0.65, y + h * 0.32);
                    ctx.closePath();
                    ctx.fill();
                    break;
                default:
                    ctx.fillRect(x, y, w, h);
                    break;
            }
        };

        const drawPathElement = (element: CanvasElement) => {
            if (!element.points || element.points.length === 0) return;
            ctx.beginPath();
            element.points.forEach((point, index) => {
                const px = point.x - minX;
                const py = point.y - minY;
                if (index === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.strokeStyle = element.color || '#000000';
            ctx.lineWidth = element.strokeWidth || 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        };

        for (const element of mergeableElements) {
            if (element.type === 'image') await drawImageElement(element);
            if (element.type === 'text') drawTextElement(element);
            if (element.type === 'shape') drawShapeElement(element);
            if (element.type === 'path') drawPathElement(element);
        }

        const mergedDataUrl = canvas.toDataURL('image/png');
        const mergedElement: CanvasElement = {
            id: uuidv4(),
            type: 'image',
            x: minX,
            y: minY,
            width,
            height,
            content: mergedDataUrl,
            ...getDefaultImagePresentation(workbenchSettings),
        };

        removeElementsByIds(mergeableElements.map(el => el.id));
        addElement(mergedElement);
        selectSingleElement(mergedElement.id);
        showToast('已合并图层', 'success');
    }, [addElement, elements, removeElementsByIds, selectSingleElement, showToast, workbenchSettings]);

    // --- Reorder ---

    const reorderSelectedElements = useCallback((ids: string[], mode: 'forward' | 'backward' | 'front' | 'back') => {
        const selectedElements = elements.filter(el => new Set(ids).has(el.id));
        if (selectedElements.length === 0) return;

        const { reordered: nextElements, didChange } = computeReorder(elements, ids, mode);

        if (!didChange) {
            const boundaryMessageMap = {
                forward: '已在最顶层',
                backward: '已在最底层',
                front: '已在最顶层',
                back: '已在最底层',
            } satisfies Record<typeof mode, string>;

            setSelectedIds(ids);
            flashLayerHighlights(ids);
            showToast(boundaryMessageMap[mode], 'info');
            return;
        }

        runHistoryTransaction({
            label: {
                forward: '图层上移一层',
                backward: '图层下移一层',
                front: '图层置顶',
                back: '图层置底',
            }[mode],
            source: 'layers-reorder-step',
        }, () => {
            setElements(nextElements);
            setSelectedIds(ids);
            flashLayerHighlights(ids);

            const messageMap = {
                forward: '已上移一层',
                backward: '已下移一层',
                front: '已移动到顶层',
                back: '已移动到底层',
            } satisfies Record<typeof mode, string>;

            showToast(messageMap[mode], 'success');
            return { selectionAfter: [...ids] };
        });
    }, [elements, flashLayerHighlights, runHistoryTransaction, setElements, setSelectedIds, showToast]);

    const handleBringForward = useCallback((ids: string[]) => {
        reorderSelectedElements(ids, 'forward');
    }, [reorderSelectedElements]);

    const handleSendBackward = useCallback((ids: string[]) => {
        reorderSelectedElements(ids, 'backward');
    }, [reorderSelectedElements]);

    const handleBringToFront = useCallback((ids: string[]) => {
        reorderSelectedElements(ids, 'front');
    }, [reorderSelectedElements]);

    const handleSendToBack = useCallback((ids: string[]) => {
        reorderSelectedElements(ids, 'back');
    }, [reorderSelectedElements]);

    // --- Layer drag-reorder ---

    const handleReorderLayer = useCallback((draggedIds: string[], targetId: string, placement: 'before' | 'after') => {
        const normalizedDraggedIds = normalizeLayerDragIds(elements, draggedIds);
        if (normalizedDraggedIds.length === 0 || !targetId || normalizedDraggedIds.includes(targetId)) return;

        const target = elements.find((element) => element.id === targetId);
        const draggedElements = elements.filter((element) => normalizedDraggedIds.includes(element.id));
        if (!target || draggedElements.length === 0) return;

        for (const dragged of draggedElements) {
            if (dragged.type === 'frame') {
                const descendants = collectFrameDescendants(elements, dragged.id);
                if (descendants.has(target.id)) {
                    showToast('不能把画板拖入自己的子层级中', 'error');
                    return;
                }
            }
        }

        const nextParentId = target.parentFrameId || undefined;
        if (normalizedDraggedIds.includes(nextParentId || '')) {
            showToast('不能把图层移动到自身内部', 'error');
            return;
        }

        runHistoryTransaction({ label: '批量重排图层', source: 'layers-reorder' }, () => {
            const nextElements = moveLayerInArray(elements, normalizedDraggedIds, nextParentId, targetId, placement);
            setElements(nextElements);
            setSelectedIds(draggedIds);
            flashLayerHighlights(normalizedDraggedIds);

            const parentChanged = draggedElements.some((dragged) => (dragged.parentFrameId || undefined) !== nextParentId);
            showToast(
                parentChanged
                    ? normalizedDraggedIds.length > 1
                        ? `已移动 ${normalizedDraggedIds.length} 个图层并更新层级`
                        : '已移动图层并更新层级'
                    : normalizedDraggedIds.length > 1
                        ? `已更新 ${normalizedDraggedIds.length} 个图层顺序`
                        : '已更新图层顺序',
                'success',
            );
            return { selectionAfter: [...draggedIds] };
        });
    }, [elements, flashLayerHighlights, runHistoryTransaction, setElements, setSelectedIds, showToast]);

    const handleMoveLayerToParent = useCallback((draggedIds: string[], parentId?: string) => {
        const normalizedDraggedIds = normalizeLayerDragIds(elements, draggedIds);
        if (normalizedDraggedIds.length === 0) return;

        const draggedElements = elements.filter((element) => normalizedDraggedIds.includes(element.id));
        if (draggedElements.length === 0) return;

        const nextParentId = parentId || undefined;
        if (draggedElements.every((element) => (element.parentFrameId || undefined) === nextParentId)) return;

        if (nextParentId) {
            const targetFrame = elements.find((element) => element.id === nextParentId && element.type === 'frame');
            if (!targetFrame) return;

            if (normalizedDraggedIds.includes(nextParentId)) {
                showToast('不能把图层移动到自身内部', 'error');
                return;
            }

            for (const draggedElement of draggedElements) {
                if (draggedElement.type !== 'frame') continue;
                const descendants = collectFrameDescendants(elements, draggedElement.id);
                if (descendants.has(nextParentId)) {
                    showToast('不能把画板移动到自己的子层级中', 'error');
                    return;
                }
            }
        }

        runHistoryTransaction({
            label: nextParentId ? '图层移入父级' : '图层移出父级',
            source: 'layers-move-parent',
        }, () => {
            const nextElements = moveLayerInArray(elements, normalizedDraggedIds, nextParentId);
            setElements(nextElements);
            setSelectedIds(draggedIds);
            flashLayerHighlights(normalizedDraggedIds);
            showToast(
                nextParentId
                    ? normalizedDraggedIds.length > 1
                        ? `已将 ${normalizedDraggedIds.length} 个图层移动到画板中`
                        : '已移动到画板中'
                    : normalizedDraggedIds.length > 1
                        ? `已将 ${normalizedDraggedIds.length} 个图层移出画板`
                        : '已移出画板',
                'success',
            );
            return { selectionAfter: [...draggedIds] };
        });
    }, [elements, flashLayerHighlights, runHistoryTransaction, setElements, setSelectedIds, showToast]);

    return {
        // selection helpers
        collectSelectionWithFrameChildren,
        selectSingleElement,
        // toggle
        handleToggleElementsHidden,
        handleToggleElementsLocked,
        // group
        handleGroupSelection,
        handleUngroupSelection,
        // merge
        handleMergeSelection,
        // reorder
        reorderSelectedElements,
        handleBringForward,
        handleSendBackward,
        handleBringToFront,
        handleSendToBack,
        // layer drag
        handleReorderLayer,
        handleMoveLayerToParent,
    };
}
