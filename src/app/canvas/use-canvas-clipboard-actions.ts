import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { cloneCanvasElement } from './canvas-element-naming';
import type { CanvasToastType } from './canvas-feedback';

type DuplicateSelectionResult = {
    copies: CanvasElement[];
    sourceToCopyId: Record<string, string>;
};

interface UseCanvasClipboardActionsParams {
    elements: CanvasElement[];
    addElements: (elements: CanvasElement[]) => void;
    collectSelectionWithFrameChildren: (ids: string[]) => string[];
    removeElementsByIds: (ids: string[]) => void;
    runHistoryTransaction: (metadata: { label: string; source: string }, action: () => { selectionAfter?: string[] } | void) => void;
    setSelectedIds: (ids: string[]) => void;
    showToast: (message: string, type?: CanvasToastType) => void;
}

export function useCanvasClipboardActions({
    elements,
    addElements,
    collectSelectionWithFrameChildren,
    removeElementsByIds,
    runHistoryTransaction,
    setSelectedIds,
    showToast,
}: UseCanvasClipboardActionsParams) {
    const clipboardRef = useRef<CanvasElement[]>([]);
    const canvasClipboardPreferredRef = useRef(false);
    const [canPaste, setCanPaste] = useState(false);

    const markCanvasClipboardPreferred = useCallback(() => {
        canvasClipboardPreferredRef.current = true;
        setCanPaste(clipboardRef.current.length > 0);
    }, []);

    useEffect(() => {
        const handleWindowBlur = () => {
            canvasClipboardPreferredRef.current = false;
        };

        window.addEventListener('blur', handleWindowBlur);
        return () => window.removeEventListener('blur', handleWindowBlur);
    }, []);

    const duplicateElementsByIds = useCallback((ids: string[], anchor?: { x: number; y: number }): DuplicateSelectionResult => {
        const sourceElements = elements.filter((element) => ids.includes(element.id));
        if (sourceElements.length === 0) {
            return {
                copies: [],
                sourceToCopyId: {},
            };
        }

        const minX = Math.min(...sourceElements.map((element) => element.x));
        const minY = Math.min(...sourceElements.map((element) => element.y));
        const targetX = anchor?.x ?? minX + 30;
        const targetY = anchor?.y ?? minY + 30;
        const offsetX = targetX - minX;
        const offsetY = targetY - minY;
        const sourceToCopyId: Record<string, string> = {};

        const copies = sourceElements.map((element) => ({
            ...cloneCanvasElement(element),
            id: (() => {
                const nextId = uuidv4();
                sourceToCopyId[element.id] = nextId;
                return nextId;
            })(),
            x: element.x + offsetX,
            y: element.y + offsetY,
        }));

        addElements(copies);
        setSelectedIds(copies.map((copy) => copy.id));
        return {
            copies,
            sourceToCopyId,
        };
    }, [addElements, elements, setSelectedIds]);

    const handleCopySelection = useCallback((ids: string[]) => {
        const expandedIds = collectSelectionWithFrameChildren(ids);
        clipboardRef.current = elements
            .filter((element) => expandedIds.includes(element.id))
            .map(cloneCanvasElement);
        markCanvasClipboardPreferred();
        showToast(`已复制 ${expandedIds.length} 个元素`, 'success');
    }, [collectSelectionWithFrameChildren, elements, markCanvasClipboardPreferred, showToast]);

    const handleCutSelection = useCallback((ids: string[]) => {
        const expandedIds = collectSelectionWithFrameChildren(ids);
        clipboardRef.current = elements
            .filter((element) => expandedIds.includes(element.id))
            .map(cloneCanvasElement);
        markCanvasClipboardPreferred();
        runHistoryTransaction({ label: '剪切元素', source: 'clipboard-cut' }, () => {
            removeElementsByIds(expandedIds);
            showToast(`已剪切 ${expandedIds.length} 个元素`, 'success');
            return { selectionAfter: [] };
        });
    }, [collectSelectionWithFrameChildren, elements, markCanvasClipboardPreferred, removeElementsByIds, runHistoryTransaction, showToast]);

    const handlePasteAt = useCallback((position: { x: number; y: number }) => {
        if (clipboardRef.current.length === 0) {
            showToast('剪贴板为空', 'info');
            setCanPaste(false);
            return;
        }

        const minX = Math.min(...clipboardRef.current.map((element) => element.x));
        const minY = Math.min(...clipboardRef.current.map((element) => element.y));
        const offsetX = position.x - minX;
        const offsetY = position.y - minY;

        const copies = clipboardRef.current.map((element) => ({
            ...cloneCanvasElement(element),
            id: uuidv4(),
            x: element.x + offsetX,
            y: element.y + offsetY,
        }));

        runHistoryTransaction({ label: '粘贴元素', source: 'clipboard-paste' }, () => {
            addElements(copies);
            setSelectedIds(copies.map((copy) => copy.id));
            clipboardRef.current = copies.map(cloneCanvasElement);
            markCanvasClipboardPreferred();
            showToast(`已粘贴 ${copies.length} 个元素`, 'success');
            return { selectionAfter: copies.map((copy) => copy.id) };
        });
    }, [addElements, markCanvasClipboardPreferred, runHistoryTransaction, setSelectedIds, showToast]);

    const handleDuplicateSelection = useCallback((ids: string[], anchor?: { x: number; y: number }): DuplicateSelectionResult => {
        let duplicateResult: DuplicateSelectionResult = {
            copies: [],
            sourceToCopyId: {},
        };

        runHistoryTransaction({ label: '复制副本', source: 'selection-duplicate' }, () => {
            duplicateResult = duplicateElementsByIds(ids, anchor);
            if (duplicateResult.copies.length > 0) {
                showToast(`已创建 ${duplicateResult.copies.length} 个副本`, 'success');
            }
            return { selectionAfter: duplicateResult.copies.map((copy) => copy.id) };
        });

        return duplicateResult;
    }, [duplicateElementsByIds, runHistoryTransaction, showToast]);

    return {
        canPaste,
        canvasClipboardPreferredRef,
        clipboardRef,
        handleCopySelection,
        handleCutSelection,
        handleDuplicateSelection,
        handlePasteAt,
        markCanvasClipboardPreferred,
    };
}
