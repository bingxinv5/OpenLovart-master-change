import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { CANVAS_REFERENCE_CONNECTOR_KIND } from '@/components/lovart/canvas-reference-connectors';
import { cloneCanvasElement } from './canvas-element-naming';
import type { CanvasToastType } from './canvas-feedback';

export type DuplicateSelectionResult = {
    copies: CanvasElement[];
    sourceToCopyId: Record<string, string>;
};

export type DuplicateSelectionOptions = {
    preserveReferenceConnectors?: boolean;
    stripReferenceState?: boolean;
};

type BuildDuplicateElementsResult = DuplicateSelectionResult & {
    connectorCopies: CanvasElement[];
};

function isReferenceConnector(element: CanvasElement) {
    return element.type === 'connector' && element.connectorKind === CANVAS_REFERENCE_CONNECTOR_KIND;
}

export function stripReferenceStateForDuplicate(element: CanvasElement): CanvasElement {
    if (element.type === 'connector') {
        return element;
    }

    return {
        ...element,
        referenceImageId: undefined,
        savedReferenceImage: undefined,
        savedReferenceImages: undefined,
        flowReferenceImages: undefined,
        savedFrameImages: undefined,
        savedReferenceVideos: undefined,
        savedReferenceAudios: undefined,
        savedPromptMentionIds: undefined,
        savedPromptMentionBindings: undefined,
    };
}

function remapConnectorEndpoints(element: CanvasElement, sourceToCopyId: Record<string, string>): CanvasElement {
    if (element.type !== 'connector') {
        return element;
    }

    return {
        ...element,
        connectorFrom: element.connectorFrom ? sourceToCopyId[element.connectorFrom] ?? element.connectorFrom : element.connectorFrom,
        connectorTo: element.connectorTo ? sourceToCopyId[element.connectorTo] ?? element.connectorTo : element.connectorTo,
    };
}

export function buildDuplicateElements(params: {
    elements: CanvasElement[];
    ids: string[];
    anchor?: { x: number; y: number };
    nextId: () => string;
    options?: DuplicateSelectionOptions;
}): BuildDuplicateElementsResult {
    const selectedIdSet = new Set(params.ids);
    const shouldStripReferenceState = !!params.options?.stripReferenceState;
    const shouldPreserveReferenceConnectors = params.options?.preserveReferenceConnectors !== false;
    const sourceElements = params.elements
        .filter((element) => selectedIdSet.has(element.id))
        .filter((element) => !(shouldStripReferenceState && isReferenceConnector(element)));

    if (sourceElements.length === 0) {
        return {
            copies: [],
            connectorCopies: [],
            sourceToCopyId: {},
        };
    }

    const minX = Math.min(...sourceElements.map((element) => element.x));
    const minY = Math.min(...sourceElements.map((element) => element.y));
    const targetX = params.anchor?.x ?? minX + 30;
    const targetY = params.anchor?.y ?? minY + 30;
    const offsetX = targetX - minX;
    const offsetY = targetY - minY;
    const sourceToCopyId: Record<string, string> = {};
    for (const element of sourceElements) {
        sourceToCopyId[element.id] = params.nextId();
    }

    const copies = sourceElements.map((element) => {
        const nextElement = {
            ...cloneCanvasElement(element),
            id: sourceToCopyId[element.id],
            x: element.x + offsetX,
            y: element.y + offsetY,
        };

        const normalized = shouldStripReferenceState
            ? stripReferenceStateForDuplicate(nextElement)
            : nextElement;
        return remapConnectorEndpoints(normalized, sourceToCopyId);
    });

    const connectorCopies = shouldPreserveReferenceConnectors
        ? params.elements.flatMap((element) => {
            if (!isReferenceConnector(element) || selectedIdSet.has(element.id)) {
                return [];
            }

            const mapsFrom = !!(element.connectorFrom && sourceToCopyId[element.connectorFrom]);
            const mapsTo = !!(element.connectorTo && sourceToCopyId[element.connectorTo]);
            if (!mapsFrom && !mapsTo) {
                return [];
            }

            return [remapConnectorEndpoints({
                ...cloneCanvasElement(element),
                id: params.nextId(),
                x: element.x + offsetX,
                y: element.y + offsetY,
            }, sourceToCopyId)];
        })
        : [];

    return {
        copies,
        connectorCopies,
        sourceToCopyId,
    };
}

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

    const duplicateElementsByIds = useCallback((ids: string[], anchor?: { x: number; y: number }, options?: DuplicateSelectionOptions): DuplicateSelectionResult => {
        const duplicateResult = buildDuplicateElements({
            elements,
            ids,
            anchor,
            nextId: uuidv4,
            options,
        });
        const elementsToAdd = [...duplicateResult.copies, ...duplicateResult.connectorCopies];

        if (elementsToAdd.length === 0) {
            return {
                copies: [],
                sourceToCopyId: {},
            };
        }

        addElements(elementsToAdd);
        const { copies, sourceToCopyId } = duplicateResult;
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

    const handleDuplicateSelection = useCallback((ids: string[], anchor?: { x: number; y: number }, options?: DuplicateSelectionOptions): DuplicateSelectionResult => {
        let duplicateResult: DuplicateSelectionResult = {
            copies: [],
            sourceToCopyId: {},
        };

        runHistoryTransaction({ label: '复制副本', source: 'selection-duplicate' }, () => {
            duplicateResult = duplicateElementsByIds(ids, anchor, options);
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
