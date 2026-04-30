import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import {
    DirtyTracker,
    HistoryManager,
    SpatialIndex,
    type HistoryTimelineEntry,
    type PatchMetadata,
} from '@/lib/editor-kernel';
import { clearSubmission, persistGeneration, removeGeneration } from './generation-persistence';
import type { HistorySummary } from './canvas-page-utils';

export interface UseCanvasDocumentStateParams {
    isInitializedRef: MutableRefObject<boolean>;
    isCanvasReadyForHistory: boolean;
    currentProjectIdRef: MutableRefObject<string | null>;
    migrationPendingRef: MutableRefObject<string[]>;
}

export function useCanvasDocumentState({
    isInitializedRef,
    isCanvasReadyForHistory,
    currentProjectIdRef,
    migrationPendingRef,
}: UseCanvasDocumentStateParams) {
    const elementsMapRef = useRef<Map<string, CanvasElement>>(new Map());
    const dirtyTrackerRef = useRef<DirtyTracker>(new DirtyTracker());
    const historyManagerRef = useRef<HistoryManager>(new HistoryManager({ maxPatches: 100 }));
    const historyInitializedRef = useRef(false);
    const historyChangedIdsRef = useRef<Set<string>>(new Set());
    const historyNeedsFullRecordRef = useRef(true);
    const historyTransactionRef = useRef<PatchMetadata | null>(null);
    const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const spatialIndexRef = useRef<SpatialIndex>(new SpatialIndex());
    const spatialIndexNeedsRebuildRef = useRef(true);

    const [elementsVersion, setElementsVersion] = useState(0);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const selectedIdsRef = useRef<string[]>([]);
    const [activeTool, setActiveTool] = useState('select');
    const [historySummary, setHistorySummary] = useState<HistorySummary>({
        lastAction: '初始状态',
        patchCount: 0,
        currentIndex: -1,
        canUndo: false,
        canRedo: false,
    });
    const [historyTimeline, setHistoryTimeline] = useState<HistoryTimelineEntry[]>([]);

    const elements = useMemo(() => {
        void elementsVersion;
        return Array.from(elementsMapRef.current.values());
    }, [elementsVersion]);

    const updateHistorySummary = useCallback((lastAction?: string) => {
        const stats = historyManagerRef.current.stats;
        const timeline = historyManagerRef.current.timeline;
        setHistorySummary({
            lastAction: lastAction || historySummary.lastAction,
            patchCount: stats.patchCount,
            currentIndex: stats.currentIndex,
            canUndo: historyManagerRef.current.canUndo,
            canRedo: historyManagerRef.current.canRedo,
        });
        setHistoryTimeline(timeline.slice(-12).reverse());
    }, [historySummary.lastAction]);

    const setElements = useCallback((updater: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) => {
        const map = elementsMapRef.current;
        const prevArr = Array.from(map.values());
        const newArr = typeof updater === 'function' ? updater(prevArr) : updater;
        map.clear();
        for (const element of newArr) {
            map.set(element.id, element);
        }

        const changedIds = new Set<string>();
        for (const element of prevArr) {
            changedIds.add(element.id);
        }
        for (const element of newArr) {
            changedIds.add(element.id);
        }

        if (historyTransactionRef.current) {
            historyChangedIdsRef.current = changedIds;
            historyManagerRef.current.touchTransactionIds(changedIds);
            historyNeedsFullRecordRef.current = false;
        } else {
            historyNeedsFullRecordRef.current = true;
            historyChangedIdsRef.current.clear();
        }

        spatialIndexNeedsRebuildRef.current = true;
        setElementsVersion((version) => version + 1);
    }, []);

    useEffect(() => {
        selectedIdsRef.current = selectedIds;
    }, [selectedIds]);

    useEffect(() => {
        if (!isCanvasReadyForHistory) return;
        if (!isInitializedRef.current) return;
        if (historyInitializedRef.current) return;
        historyInitializedRef.current = true;
        historyManagerRef.current.initialize(elements);
        dirtyTrackerRef.current.initialize(elements.map((element) => element.id));
        historyChangedIdsRef.current.clear();
        historyNeedsFullRecordRef.current = false;
        updateHistorySummary('初始状态');

        if (migrationPendingRef.current.length > 0) {
            for (const id of migrationPendingRef.current) {
                dirtyTrackerRef.current.markModified(id);
            }
            migrationPendingRef.current = [];
        }
    }, [elements, isCanvasReadyForHistory, isInitializedRef, migrationPendingRef, updateHistorySummary]);

    const flushHistoryRecord = useCallback((metadata?: PatchMetadata) => {
        if (!historyInitializedRef.current) return false;

        if (historyTimerRef.current) {
            clearTimeout(historyTimerRef.current);
            historyTimerRef.current = null;
        }

        if (historyTransactionRef.current) {
            const mergedMetadata = {
                ...historyTransactionRef.current,
                ...metadata,
                selectionBefore: metadata?.selectionBefore ?? historyTransactionRef.current.selectionBefore,
                selectionAfter: metadata?.selectionAfter ?? historyTransactionRef.current.selectionAfter,
            } satisfies PatchMetadata;
            const recorded = historyManagerRef.current.commitTransaction(elementsMapRef.current, mergedMetadata);
            historyChangedIdsRef.current.clear();
            historyNeedsFullRecordRef.current = false;
            historyTransactionRef.current = null;
            if (recorded) {
                updateHistorySummary(mergedMetadata.label || mergedMetadata.source || '事务操作');
            }
            return recorded;
        }

        if (historyNeedsFullRecordRef.current) {
            const recorded = historyManagerRef.current.record(elements);
            historyChangedIdsRef.current.clear();
            historyNeedsFullRecordRef.current = false;
            if (recorded) {
                updateHistorySummary(metadata?.label || metadata?.source || '全量记录');
            }
            return recorded;
        }

        const recorded = historyManagerRef.current.recordIncremental(elementsMapRef.current, historyChangedIdsRef.current, metadata);
        historyChangedIdsRef.current.clear();
        historyNeedsFullRecordRef.current = false;
        if (recorded) {
            updateHistorySummary(metadata?.label || metadata?.source || '增量记录');
        }
        return recorded;
    }, [elements, updateHistorySummary]);

    const beginHistoryTransaction = useCallback((metadata?: PatchMetadata) => {
        if (!historyInitializedRef.current) return;

        if (historyTimerRef.current) {
            clearTimeout(historyTimerRef.current);
            historyTimerRef.current = null;
        }

        const transactionMetadata: PatchMetadata = {
            ...metadata,
            selectionBefore: metadata?.selectionBefore ?? [...selectedIdsRef.current],
        };

        historyTransactionRef.current = transactionMetadata;
        historyManagerRef.current.beginTransaction(transactionMetadata);
    }, []);

    const commitHistoryTransaction = useCallback((metadata?: PatchMetadata) => {
        if (!historyTransactionRef.current) return false;
        return flushHistoryRecord({
            ...metadata,
            selectionAfter: metadata?.selectionAfter ?? [...selectedIdsRef.current],
        });
    }, [flushHistoryRecord]);

    const runHistoryTransaction = useCallback((metadata: PatchMetadata, action: () => PatchMetadata | void) => {
        beginHistoryTransaction(metadata);
        try {
            const resultMetadata = action();
            commitHistoryTransaction({
                ...resultMetadata,
                selectionAfter: resultMetadata?.selectionAfter ?? [...selectedIdsRef.current],
            });
        } finally {
            if (historyTransactionRef.current) {
                commitHistoryTransaction({
                    selectionAfter: [...selectedIdsRef.current],
                });
            }
        }
    }, [beginHistoryTransaction, commitHistoryTransaction]);

    useEffect(() => {
        if (!historyInitializedRef.current) return;
        if (historyTransactionRef.current) return;
        if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
        historyTimerRef.current = setTimeout(() => {
            flushHistoryRecord();
        }, 500);
    }, [elements, flushHistoryRecord, setElements]);

    const undo = useCallback(() => {
        const oldElements = elements;
        const result = historyManagerRef.current.undo(elements);
        if (result) {
            historyNeedsFullRecordRef.current = true;
            historyChangedIdsRef.current.clear();
            dirtyTrackerRef.current.diffAndMark(oldElements, result.elements);
            setElements(result.elements as unknown as CanvasElement[]);
            setSelectedIds(result.metadata?.selectionBefore || []);
            updateHistorySummary(`撤销：${result.metadata?.label || result.metadata?.source || '上一步'}`);
        }
    }, [elements, setElements, updateHistorySummary]);

    const redo = useCallback(() => {
        const oldElements = elements;
        const result = historyManagerRef.current.redo(elements);
        if (result) {
            historyNeedsFullRecordRef.current = true;
            historyChangedIdsRef.current.clear();
            dirtyTrackerRef.current.diffAndMark(oldElements, result.elements);
            setElements(result.elements as unknown as CanvasElement[]);
            setSelectedIds(result.metadata?.selectionAfter || []);
            updateHistorySummary(`重做：${result.metadata?.label || result.metadata?.source || '下一步'}`);
        }
    }, [elements, setElements, updateHistorySummary]);

    const removeElementsByIds = useCallback((ids: string[]) => {
        if (ids.length === 0) {
            return;
        }

        const uniqueIds = Array.from(new Set(ids));
        const idSet = new Set(uniqueIds);
        let hasRemoved = false;

        for (const id of uniqueIds) {
            if (!elementsMapRef.current.delete(id)) {
                continue;
            }

            hasRemoved = true;
            historyChangedIdsRef.current.add(id);
            historyManagerRef.current.touchTransactionIds([id]);
            spatialIndexRef.current.remove(id);
            dirtyTrackerRef.current.markRemoved(id);
        }

        if (!hasRemoved) {
            return;
        }

        const pid = currentProjectIdRef.current;
        if (pid) {
            for (const id of uniqueIds) {
                removeGeneration(pid, id);
                clearSubmission(pid, id);
            }
        }

        setElementsVersion((version) => version + 1);
        setSelectedIds((prev) => prev.filter((selectedId) => !idSet.has(selectedId)));
    }, [currentProjectIdRef]);

    const handleElementChange = useCallback((id: string, newAttrs: Partial<CanvasElement>) => {
        const map = elementsMapRef.current;
        const element = map.get(id);
        if (element) {
            const changedEntries = Object.entries(newAttrs).filter(([key, value]) => !Object.is(element[key as keyof CanvasElement], value));
            if (changedEntries.length === 0) {
                return;
            }

            const updated = {
                ...element,
                ...Object.fromEntries(changedEntries),
            };
            map.set(id, updated);
            historyChangedIdsRef.current.add(id);
            historyManagerRef.current.touchTransactionIds([id]);
            spatialIndexRef.current.update(updated);
            setElementsVersion((version) => version + 1);

            if ('generatingTaskId' in newAttrs) {
                const pid = currentProjectIdRef.current;
                if (pid) {
                    if (updated.generatingTaskId && updated.generatingTaskId !== 'ai-editing') {
                        persistGeneration(pid, id, {
                            taskId: updated.generatingTaskId,
                            taskType: updated.generatingTaskType || 'image',
                            progress: updated.generatingProgress || 0,
                            savedPrompt: updated.savedPrompt,
                        });
                    } else if (!updated.generatingTaskId) {
                        removeGeneration(pid, id);
                    }
                }
            }
        }
        dirtyTrackerRef.current.markModified(id);
    }, [currentProjectIdRef]);

    const handleDelete = useCallback((id: string) => {
        removeElementsByIds([id]);
    }, [removeElementsByIds]);

    const addElement = useCallback((element: CanvasElement) => {
        elementsMapRef.current.set(element.id, element);
        historyChangedIdsRef.current.add(element.id);
        historyManagerRef.current.touchTransactionIds([element.id]);
        spatialIndexRef.current.insert(element);
        setElementsVersion((version) => version + 1);
        dirtyTrackerRef.current.markAdded(element.id);
        if (element.generatingTaskId && element.generatingTaskId !== 'ai-editing') {
            const pid = currentProjectIdRef.current;
            if (pid) {
                persistGeneration(pid, element.id, {
                    taskId: element.generatingTaskId,
                    taskType: element.generatingTaskType || 'image',
                    progress: element.generatingProgress || 0,
                    savedPrompt: element.savedPrompt,
                });
            }
        }
    }, [currentProjectIdRef]);

    const addElements = useCallback((newElements: CanvasElement[]) => {
        const map = elementsMapRef.current;
        for (const element of newElements) {
            map.set(element.id, element);
            historyChangedIdsRef.current.add(element.id);
        }
        historyManagerRef.current.touchTransactionIds(newElements.map((element) => element.id));
        spatialIndexRef.current.batchUpdate(newElements);
        setElementsVersion((version) => version + 1);
        for (const element of newElements) {
            dirtyTrackerRef.current.markAdded(element.id);
        }
    }, []);

    const handleBatchElementChange = useCallback((changes: { id: string; attrs: Partial<CanvasElement> }[]) => {
        const shouldAutoTransaction = !historyTransactionRef.current && changes.length > 0;
        if (shouldAutoTransaction) {
            beginHistoryTransaction({
                label: changes.length > 1 ? '批量更新元素' : '更新元素',
                source: 'canvas-batch-change',
            });
        }

        const map = elementsMapRef.current;
        const updatedElements: CanvasElement[] = [];
        for (const { id, attrs } of changes) {
            const element = map.get(id);
            if (element) {
                const updated = { ...element, ...attrs };
                map.set(id, updated);
                updatedElements.push(updated);
                historyChangedIdsRef.current.add(id);
            }
        }
        historyManagerRef.current.touchTransactionIds(changes.map((change) => change.id));
        if (updatedElements.length > 0) {
            spatialIndexRef.current.batchUpdate(updatedElements);
        }
        setElementsVersion((version) => version + 1);
        for (const change of changes) {
            dirtyTrackerRef.current.markModified(change.id);
        }
        if (shouldAutoTransaction) {
            commitHistoryTransaction();
        }
    }, [beginHistoryTransaction, commitHistoryTransaction]);

    return {
        elementsMapRef,
        dirtyTrackerRef,
        elementsVersion,
        setElementsVersion,
        elements,
        setElements,
        selectedIds,
        setSelectedIds,
        selectedIdsRef,
        activeTool,
        setActiveTool,
        historySummary,
        historyTimeline,
        historyManagerRef,
        historyInitializedRef,
        historyChangedIdsRef,
        historyNeedsFullRecordRef,
        historyTransactionRef,
        updateHistorySummary,
        beginHistoryTransaction,
        commitHistoryTransaction,
        runHistoryTransaction,
        undo,
        redo,
        spatialIndexRef,
        spatialIndexNeedsRebuildRef,
        removeElementsByIds,
        handleElementChange,
        handleDelete,
        addElement,
        addElements,
        handleBatchElementChange,
    };
}