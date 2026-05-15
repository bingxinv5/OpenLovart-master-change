"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { useUser } from '@/lib/mock-clerk';
import { useSearchParams } from 'next/navigation';
import { useProjectAssetCollection } from '@/hooks/useProjectAssetCollection';
import { CanvasArea } from '@/components/lovart/CanvasArea';
import { AiDesignerPanel } from '@/components/lovart/AiDesignerPanel';
import { CanvasCommandPalette } from '@/components/lovart/CanvasCommandPalette';
import { CanvasShortcutHelp } from '@/components/lovart/CanvasShortcutHelp';
import { GenerationQueuePanel, type GenerationQueueItem } from '@/components/lovart/GenerationQueuePanel';
import { type CanvasElement } from '@/components/lovart/canvas-types';
import { useLocalDb } from '@/hooks/useLocalDb';
import { isImageRef, getImageBlob, getImageDataUrl } from '@/lib/editor-kernel';
import { useCanvasFeedback } from './canvas-feedback';
import { CanvasBenchmarkPanel } from './CanvasBenchmarkPanel';
import { CanvasFeedbackOverlays } from './CanvasFeedbackOverlays';
import { CanvasFloatingToolPanels } from './CanvasFloatingToolPanels';
import { CanvasHeader } from './CanvasHeader';
import { CanvasSideDockPanels } from './CanvasSideDockPanels';
import { CANVAS_SHORTCUT_SECTIONS } from './canvas-shortcut-sections';
import { buildAiCanvasSelectionSummary } from './ai-canvas-plan';
import { areChunkResidencyStatesEqual } from './canvas-compare-utils';
import type { CanvasAreaDomains } from '@/components/lovart/canvas-area-domains';
import {
    buildBelowElementDisplayMetricsOptions as createBelowElementDisplayMetricsOptions,
    buildBelowSourceImageResultElement as createBelowSourceImageResultElement,
    buildGeneratorElement as createGeneratorElement,
    buildImageElement as createImageElement,
    buildVideoElement as createVideoElement,
} from './canvas-element-factory';
import {
    normalizeGeneratedImageContent as localizeGeneratedImageContent,
    resolveAspectRatioFallbackMetrics as getAspectRatioFallbackMetrics,
    resolveImageDisplayMetrics as getImageDisplayMetrics,
    type ResolveImageDisplayMetricsOptions,
} from './canvas-image-assets';
import { getElementPanelStyle } from './canvas-panel-style-utils';
import { getViewportSize } from './canvas-focus';
import { getGeneratorOverlayStyle, getSelectedGeneratorElement } from './canvas-generator-overlay';
import { applyElementGenerationPatch, updateGeneratorSubmittingMap } from './canvas-generation';
import { buildActiveChunkSummary, buildCanvasRuntimeElements, buildChunkPanelEntries, buildChunkResidencyState as buildRuntimeChunkResidencyState } from './canvas-chunk-runtime';
import { useCanvasKeyboardShortcuts } from './canvas-keyboard-shortcuts';
import { useCanvasSelectionBridge } from './canvas-selection-bridge';
import { useCanvasWorkbenchPanels } from './canvas-workbench-panels';
import { useRuntimeImageRenderSrcs } from './use-runtime-image-render-srcs';
import { useCanvasDocumentState } from './use-canvas-document-state';
import { useCanvasProjectPersistence } from './use-canvas-project-persistence';
import { useCanvasMediaImport } from './use-canvas-media-import';
import { useCanvasToolPanels } from './use-canvas-tool-panels';
import { useCanvasGenerationActions } from './use-canvas-generation-actions';
import { useCanvasWorkbenchLayout } from './use-canvas-workbench-layout';
import { useCanvasSessionRuntime } from './canvas-session-runtime';
import { useGenerationPollingController } from './canvas-generation-controller';
import { useImageFinalizer } from './use-image-finalizer';
import { useCanvasProjectReferenceActions } from './use-canvas-project-reference-actions';
import { useCanvasBenchmarkActions } from './use-canvas-benchmark-actions';
import { useCanvasProjectBackflowActions } from './use-canvas-project-backflow-actions';
import { useCanvasStoryboardActions } from './use-canvas-storyboard-actions';
import { useCanvasImageToolActions } from './use-canvas-image-tool-actions';
import { useCanvasAiPlanExecutor } from './use-canvas-ai-plan-executor';
import { useCanvasFlowConnection } from './use-canvas-flow-connection';
import { useCanvasCommandActions } from './use-canvas-command-actions';
import { useCanvasImageMigration } from './use-canvas-image-migration';
import { useCanvasClipboardActions } from './use-canvas-clipboard-actions';
import { persistSubmission, clearSubmission } from './generation-persistence';
import { saveViewportState } from './viewport-persistence';
import {
    buildCanvasChunkManifest,
    type CanvasChunkManifestEntry,
    type CanvasChunkStats,
} from './project-storage';
import { getWorkbenchSettings, hasDirectoryPickerSupport, requestAutoSaveDirectoryHandle, requestPersistentStorage, saveBlobToAutoSaveDirectory, saveWorkbenchSettings, subscribeWorkbenchSettingsChange, type StorageEstimateInfo, type WorkbenchSettings, getStorageEstimateInfo } from '@/lib/workbench-settings';
import { v4 as uuidv4 } from 'uuid';
import {
    STORAGE_WARN_THRESHOLD,
    STORAGE_CRITICAL_THRESHOLD,
    CHUNK_RELEASE_GRACE_MS,
    type ChunkPreheatState,
    type ActiveChunkSummary,
    type ChunkResidencyState,
    type ElementExportFormat,
} from './canvas-runtime-types';
import {
    loadPinnedChunkIds,
    persistPinnedChunkIds,
    resolveElementChunkId,
} from './canvas-session-prefs';
import {
    getDefaultImagePresentation,
} from './canvas-media-utils';
import {
    triggerBrowserDownload,
    saveBlobToLocalFile,
    dataUrlToBlob,
    formatBytes,
    convertImageBlobToRasterBlob,
    buildSvgExportBlob,
    makeGeneratedFilename,
} from './canvas-export-utils';
import {
    cloneCanvasElement,
} from './canvas-element-naming';
import { fetchRemoteBlob } from '@/lib/blob-utils';
import {
    buildCenteredElementBounds,
    calculateCanvasCenter,
    buildAutoGroupFrame as _buildAutoGroupFrame,
    resolveElementReferenceImages as _resolveElementReferenceImages,
    resolveElementFrameImages as _resolveElementFrameImages,
    resolveCanvasContentBlob as _resolveCanvasContentBlob,
} from './canvas-element-ops';
import { useCanvasActions } from './canvas-actions';
import { buildGeneratorCanvasImages, buildSelectedCanvasImageIds } from './canvas-generator-panel-view-model';
import { cancelActiveWorkerJobs } from '@/lib/image-worker-bridge';
import { appendProjectMediaHistory, mediaHistoryStoreConfig, replaceProjectMediaHistory } from '@/lib/project-media-history';
import { referenceLibraryStoreConfig } from '@/lib/project-reference-library';

function isEditableOverlayTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    if (target.closest('[data-testid="canvas-area"]')) {
        return false;
    }

    return !!target.closest('textarea, input, select, [contenteditable]:not([contenteditable="false"])');
}

function LovartCanvasContent() {
    const { user } = useUser();
    const database = useLocalDb();
    const searchParams = useSearchParams();
    const projectId = searchParams.get('id');
    const benchmarkMode = searchParams.get('bench') === '1';

    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    // ── 视口状态持久化：pan/scale 变化时同步到 sessionStorage ──
    const scaleRef = useRef(scale);
    const panRef = useRef(pan);
    useEffect(() => { scaleRef.current = scale; }, [scale]);
    useEffect(() => { panRef.current = pan; }, [pan]);
    useEffect(() => {
        const pid = currentProjectIdRef.current;
        if (pid && isInitializedRef.current) {
            saveViewportState(pid, scale, pan);
        }
    }, [scale, pan]);
    const [workbenchSettings, setWorkbenchSettings] = useState<WorkbenchSettings>(() => getWorkbenchSettings());
    const [storageEstimate, setStorageEstimate] = useState<StorageEstimateInfo | null>(null);
    const [chunkPreheat, setChunkPreheat] = useState<ChunkPreheatState>({
        active: false,
        phase: 'idle',
        loadedChunks: 0,
        totalChunks: 0,
        loadedElements: 0,
        totalElements: 0,
    });
    const [showCommandPalette, setShowCommandPalette] = useState(false);
    const [showShortcutHelp, setShowShortcutHelp] = useState(false);
    const [shortcutFeedback, setShortcutFeedback] = useState<{ label: string; shortcut: string } | null>(null);
    const [pinnedChunkIds, setPinnedChunkIds] = useState<string[]>([]);
    const [chunkResidency, setChunkResidency] = useState<ChunkResidencyState>({
        phase: 'idle',
        residentChunkIds: [],
        unloadedChunkIds: [],
        residentElementCount: 0,
        unloadedElementCount: 0,
    });
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectId);
    const migrationPendingRef = useRef<string[]>([]); // IDs of elements migrated from base64 to ImageStore
    const isInitializedRef = useRef(false);
    const [isCanvasReadyForHistory, setIsCanvasReadyForHistory] = useState(false);
    const currentProjectIdRef = useRef<string | null>(projectId);
    const shortcutFeedbackTimerRef = useRef<number | null>(null);
    const {
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
        historyInitializedRef,
        runHistoryTransaction,
        undo,
        redo,
        spatialIndex,
        spatialIndexRef,
        spatialIndexNeedsRebuildRef,
        removeElementsByIds,
        handleElementChange,
        handleDelete,
        addElement,
        addElements,
        handleBatchElementChange,
    } = useCanvasDocumentState({
        isInitializedRef,
        isCanvasReadyForHistory,
        currentProjectIdRef,
        migrationPendingRef,
    });

    const {
        runtimeImageRenderSrcs,
        primeRuntimeImageRenderSrc,
    } = useRuntimeImageRenderSrcs(elements);

    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
    const [generatorSubmittingMap, setGeneratorSubmittingMap] = useState<Record<string, boolean>>({});
    const projectMediaItems = useProjectAssetCollection(mediaHistoryStoreConfig, currentProjectId);
    const projectReferenceItems = useProjectAssetCollection(referenceLibraryStoreConfig, currentProjectId);
    const pinnedChunkProjectIdRef = useRef<string | null>(projectId);
    const storageWarnedRef = useRef(false);

    const {
        canvasImages,
        chatExpanded,
        chatPanelMode,
        closeChat,
        closeHistory,
        closeLayers,
        closeMedia,
        closeReferences,
        isQueuePanelCollapsed,
        marks,
        openChat,
        selectedModel,
        setChatPanelMode,
        setSelectedModel,
        showChat,
        showHistory,
        showLayers,
        showMedia,
        showReferences,
        sideDockOffset,
        toggleChat,
        toggleChatExpanded,
        toggleHistory,
        toggleMedia,
        toggleLayers,
        toggleQueuePanelCollapsed,
        toggleReferences,
    } = useCanvasWorkbenchPanels({ elements });

    useEffect(() => {
        if (!currentProjectId || projectMediaItems.length === 0) {
            return;
        }

        const reconciledItems = projectMediaItems.map((item) => {
            if (item.taskId || !item.sourceElementId) {
                return item;
            }

            const sourceElement = elementsMapRef.current.get(item.sourceElementId);
            const recoveredTaskId = sourceElement?.sourceGenerationTaskId ?? sourceElement?.generatingTaskId;
            if (!recoveredTaskId) {
                return item;
            }

            return {
                ...item,
                taskId: recoveredTaskId,
            };
        });

        const hasChanges = reconciledItems.some((item, index) => item !== projectMediaItems[index]);
        if (!hasChanges) {
            return;
        }

        replaceProjectMediaHistory(currentProjectId, reconciledItems);
    }, [currentProjectId, elementsMapRef, elementsVersion, projectMediaItems]);

    const recordProjectMediaItem = useCallback((params: {
        kind: 'image' | 'video' | 'audio';
        content: string;
        taskId?: string;
        prompt?: string;
        sourceElement?: CanvasElement | null;
        sourceElementId?: string;
    }) => {
        const projectId = currentProjectIdRef.current;
        if (!projectId || !params.content) {
            return;
        }

        const source = params.sourceElement;
        appendProjectMediaHistory({
            projectId,
            kind: params.kind,
            content: params.content,
            taskId: params.taskId ?? source?.sourceGenerationTaskId ?? source?.generatingTaskId,
            prompt: params.prompt ?? source?.savedPrompt,
            model: source?.selectedModel,
            aspectRatio: source?.selectedAspectRatio,
            imageSize: params.kind === 'image' ? source?.selectedImageSize : undefined,
            duration: params.kind === 'video' ? source?.selectedDuration : undefined,
            sourceElementId: params.sourceElementId || source?.id,
            batchId: source?.generationBatchId,
            batchTitle: source?.generationBatchTitle,
        });
    }, []);

    const {
        announceCompletedResult,
        announcePassiveCompletedResult,
        clearToast,
        flashLayerHighlights,
        focusCanvasElement,
        highlightedLayerIds,
        highlightedResultId,
        showToast,
        toast,
    } = useCanvasFeedback({
        elements,
        scale,
        pan,
        setPan,
        setSelectedIds,
    });

    const {
        storyboardPlannerSourceElementId,
        setStoryboardPlannerSourceElementId,
        isStoryboardExportOpen,
        setIsStoryboardExportOpen,
        isStoryboardExportSubmitting,
        setIsStoryboardExportSubmitting,
        storyboardExportSubmitStatus,
        setStoryboardExportSubmitStatus,
        annotateImageTargetId,
        setAnnotateImageTargetId,
        isAnnotateImageSubmitting,
        setIsAnnotateImageSubmitting,
        annotateImageSubmitStatus,
        setAnnotateImageSubmitStatus,
        cropImageTargetId,
        setCropImageTargetId,
        isCropImageSubmitting,
        setIsCropImageSubmitting,
        cropImageSubmitStatus,
        setCropImageSubmitStatus,
        splitStoryboardTargetId,
        setSplitStoryboardTargetId,
        isSplitStoryboardSubmitting,
        setIsSplitStoryboardSubmitting,
        splitStoryboardSubmitStatus,
        setSplitStoryboardSubmitStatus,
        autoAdvanceStoryboardIssues,
        autoAdvanceStoryboardScope,
        setAutoAdvanceStoryboardScope,
        storyboardAuditFilter,
        setStoryboardAuditFilter,
        beginImageToolSubmission,
        endImageToolSubmission,
        ensureImageToolSource,
    } = useCanvasToolPanels({
        currentProjectId,
        showToast,
    });

    const {
        handleUseProjectReferenceImage,
        saveProjectReferenceFromElement,
        saveProjectReferenceFromSelection,
    } = useCanvasProjectReferenceActions({
        currentProjectIdRef,
        elementsMapRef,
        showToast,
    });

    const announceShortcut = useCallback((label: string, shortcut: string) => {
        if (shortcutFeedbackTimerRef.current) {
            window.clearTimeout(shortcutFeedbackTimerRef.current);
        }

        setShortcutFeedback({ label, shortcut });
        shortcutFeedbackTimerRef.current = window.setTimeout(() => {
            setShortcutFeedback(null);
            shortcutFeedbackTimerRef.current = null;
        }, 1800);
    }, []);

    useEffect(() => () => {
        if (shortcutFeedbackTimerRef.current) {
            window.clearTimeout(shortcutFeedbackTimerRef.current);
        }
    }, []);

    const cancelImageWorkerTask = useCallback((taskLabel: string) => {
        cancelActiveWorkerJobs();
        showToast(`已取消${taskLabel}`, 'info');
    }, [showToast]);

    const {
        canvasSelectMode,
        handleCancelCanvasSelect,
        handleCanvasSelectPick,
        handlePickFromCanvasForChat,
        handleRequestCanvasSelectImage,
        handleRequestCanvasSelectVideo,
        handleSendSelectionToChat,
    } = useCanvasSelectionBridge({
        elements,
        selectedIds,
        setSelectedIds,
        openChat,
        showToast,
    });

    const chunkStructureSignature = useMemo(() => buildCanvasChunkStructureSignature(elements), [elements]);
    const chunkSummary = useMemo(() => {
        const cached = chunkSummaryReferenceCache.get(chunkStructureSignature);
        if (cached) {
            return cached;
        }

        return rememberReference(chunkSummaryReferenceCache, chunkStructureSignature, buildCanvasChunkManifest(elements));
    }, [chunkStructureSignature, elements]);
    const chunkManifest: CanvasChunkManifestEntry[] = chunkSummary.manifest;
    const chunkStats: CanvasChunkStats = chunkSummary.stats;
    const hasRootChunk = useMemo(() => chunkManifest.some((chunk) => chunk.id === 'root'), [chunkManifest]);
    const chunkMetaById = useMemo(() => new Map(chunkManifest.map((chunk) => [chunk.id, chunk])), [chunkManifest]);
    const validChunkIdSet = useMemo(() => new Set(chunkManifest.map((chunk) => chunk.id)), [chunkManifest]);
    const elementById = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);
    const elementChunkIdById = useMemo(() => new Map(elements.map((element) => [element.id, resolveElementChunkId(element, elementById)])), [elementById, elements]);
    const buildChunkResidencyState = useCallback((residentChunkIds: string[], phase: ChunkResidencyState['phase'], labels?: {
        lastActivatedChunkLabel?: string;
        lastReleasedChunkLabel?: string;
    }): ChunkResidencyState => buildRuntimeChunkResidencyState({
        residentChunkIds,
        phase,
        chunkManifest,
        chunkMetaById,
        labels,
    }), [chunkManifest, chunkMetaById]);

    const validPinnedChunkIds = useMemo(
        () => pinnedChunkIds.filter((chunkId) => validChunkIdSet.has(chunkId)),
        [pinnedChunkIds, validChunkIdSet],
    );

    useEffect(() => {
        setPinnedChunkIds((prev) => {
            const nextLoaded = loadPinnedChunkIds(currentProjectId);

            if (pinnedChunkProjectIdRef.current === null && currentProjectId && prev.length > 0) {
                return Array.from(new Set([...nextLoaded, ...prev]));
            }

            return nextLoaded;
        });
        pinnedChunkProjectIdRef.current = currentProjectId;
    }, [currentProjectId]);

    useEffect(() => {
        persistPinnedChunkIds(currentProjectId, validPinnedChunkIds);
    }, [currentProjectId, validPinnedChunkIds]);

    const activeChunkSummary = useMemo<ActiveChunkSummary>(() => {
        const viewport = getViewportSize();
        return buildActiveChunkSummary({
            elements,
            chunkManifest,
            hasRootChunk,
            elementById,
            elementChunkIdById,
            selectedIds,
            highlightedLayerIds,
            highlightedResultId,
            pinnedChunkIds: validPinnedChunkIds,
            validChunkIdSet,
            pan,
            scale,
            viewportSize: viewport,
        });
    }, [chunkManifest, elementById, elementChunkIdById, elements, hasRootChunk, highlightedLayerIds, highlightedResultId, pan, scale, selectedIds, validChunkIdSet, validPinnedChunkIds]);
    const activeChunkIdsSignature = useMemo(() => activeChunkSummary.activeChunkIds.join('\u0001'), [activeChunkSummary.activeChunkIds]);
    const activeChunkIds = useMemo(() => {
        const cached = activeChunkIdsReferenceCache.get(activeChunkIdsSignature);
        if (cached) {
            return cached;
        }

        return rememberReference(activeChunkIdsReferenceCache, activeChunkIdsSignature, activeChunkSummary.activeChunkIds);
    }, [activeChunkIdsSignature, activeChunkSummary.activeChunkIds]);

    const chunkReleaseTimerRef = useRef<number | null>(null);
    useEffect(() => {
        if (chunkReleaseTimerRef.current !== null) {
            window.clearTimeout(chunkReleaseTimerRef.current);
            chunkReleaseTimerRef.current = null;
        }

        let cancelled = false;

        queueMicrotask(() => {
            if (cancelled) return;

            if (chunkManifest.length === 0) {
                setChunkResidency((prev) => {
                    const next = {
                        phase: 'idle',
                        residentChunkIds: [],
                        unloadedChunkIds: [],
                        residentElementCount: elements.length,
                        unloadedElementCount: 0,
                    } satisfies ChunkResidencyState;
                    return areChunkResidencyStatesEqual(prev, next) ? prev : next;
                });
                return;
            }

            const targetChunkIds = activeChunkIds;
            const targetSet = new Set(targetChunkIds);

            setChunkResidency((prev) => {
                const currentResident = prev.residentChunkIds.length > 0 ? prev.residentChunkIds : targetChunkIds;
                const residentSet = new Set(currentResident);
                const toHydrate = targetChunkIds.filter((chunkId) => !residentSet.has(chunkId));
                const toRelease = currentResident.filter((chunkId) => !targetSet.has(chunkId));

                const next = toHydrate.length === 0 && toRelease.length === 0
                    ? buildChunkResidencyState(currentResident, 'idle', {
                        lastActivatedChunkLabel: prev.lastActivatedChunkLabel,
                        lastReleasedChunkLabel: prev.lastReleasedChunkLabel,
                    })
                    : buildChunkResidencyState(Array.from(new Set([...currentResident, ...toHydrate])), toHydrate.length > 0 ? 'hydrating' : 'releasing', {
                        lastActivatedChunkLabel: toHydrate.length > 0 ? chunkMetaById.get(toHydrate[0])?.label || prev.lastActivatedChunkLabel : prev.lastActivatedChunkLabel,
                        lastReleasedChunkLabel: toRelease.length > 0 ? chunkMetaById.get(toRelease[0])?.label || prev.lastReleasedChunkLabel : prev.lastReleasedChunkLabel,
                    });

                return areChunkResidencyStatesEqual(prev, next) ? prev : next;
            });

            chunkReleaseTimerRef.current = window.setTimeout(() => {
                setChunkResidency((prev) => {
                    const currentResident = prev.residentChunkIds.length > 0 ? prev.residentChunkIds : targetChunkIds;
                    const releasedChunkIds = currentResident.filter((chunkId) => !targetSet.has(chunkId));
                    const keptChunkIds = currentResident.filter((chunkId) => targetSet.has(chunkId));
                    const next = buildChunkResidencyState(keptChunkIds, 'idle', {
                        lastActivatedChunkLabel: prev.lastActivatedChunkLabel,
                        lastReleasedChunkLabel: releasedChunkIds.length > 0 ? chunkMetaById.get(releasedChunkIds[0])?.label || prev.lastReleasedChunkLabel : prev.lastReleasedChunkLabel,
                    });
                    return areChunkResidencyStatesEqual(prev, next) ? prev : next;
                });
                chunkReleaseTimerRef.current = null;
            }, CHUNK_RELEASE_GRACE_MS);
        });

        return () => {
            cancelled = true;
            if (chunkReleaseTimerRef.current !== null) {
                window.clearTimeout(chunkReleaseTimerRef.current);
                chunkReleaseTimerRef.current = null;
            }
        };
    }, [activeChunkIds, buildChunkResidencyState, chunkManifest.length, chunkMetaById, elements.length]);

    const canvasRuntimeElements = useMemo(() => {
        return buildCanvasRuntimeElements(
            elements,
            chunkManifest.length,
            chunkResidency.residentChunkIds,
            activeChunkIds,
            elementChunkIdById,
        );
    }, [activeChunkIds, chunkManifest.length, chunkResidency.residentChunkIds, elementChunkIdById, elements]);

    const chunkPanelEntries = useMemo(() => {
        return buildChunkPanelEntries(
            chunkManifest,
            activeChunkIds,
            chunkResidency.residentChunkIds,
            validPinnedChunkIds,
        );
    }, [activeChunkIds, chunkManifest, chunkResidency.residentChunkIds, validPinnedChunkIds]);

    const handleTogglePinnedChunk = useCallback((chunkId: string) => {
        if (!validChunkIdSet.has(chunkId)) return;
        setPinnedChunkIds((prev) => prev.includes(chunkId) ? prev.filter((id) => id !== chunkId) : [...prev, chunkId]);
    }, [validChunkIdSet]);

    const handleLocateChunk = useCallback((chunkId: string) => {
        const targetChunk = chunkMetaById.get(chunkId);
        if (targetChunk?.topFrameId) {
            focusCanvasElement(targetChunk.topFrameId);
        }
    }, [chunkMetaById, focusCanvasElement]);

    const {
        renderMetrics,
        handleRenderMetricsChange,
        rightWorkbenchOffset,
        benchmarkPanelRightOffset,
        handleZoomIn,
        handleZoomOut,
        handleZoomTo,
        handleFitToScreen,
    } = useCanvasWorkbenchLayout({
        benchmarkMode,
        elements,
        setScale,
        setPan,
        showChat,
        chatPanelMode,
        chatExpanded,
        showLayers,
        showHistory,
        showMedia,
        sideDockOffset,
    });

    const handleGeneratorSubmittingChange = useCallback((elementId: string, submitting: boolean, liveParams?: { prompt?: string; model?: string; aspectRatio?: string; imageSize?: string; quality?: string; duration?: string; generateCount?: number }, completion?: { outcome: 'succeeded' | 'failed' | 'interrupted' }) => {
        setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, submitting));
        const pid = currentProjectIdRef.current;
        if (!pid) return;
        if (submitting) {
            // API 请求发起前，立即记录提交参数到 sessionStorage
            const el = elementsMapRef.current.get(elementId);
            if (el) {
                const actualPrompt = liveParams?.prompt || el.savedPrompt || '';
                const actualModel = liveParams?.model || el.selectedModel || '';
                const actualAspectRatio = liveParams?.aspectRatio || el.selectedAspectRatio || '21:9';
                const actualImageSize = liveParams?.imageSize || el.selectedImageSize || '';
                const actualQuality = liveParams?.quality || el.selectedImageQuality || 'auto';
                const actualDuration = liveParams?.duration || el.selectedDuration || '';
                const actualGenerateCount = liveParams?.generateCount || el.selectedGenerateCount || 1;

                // 立即将 Panel 当前的 prompt/model/aspectRatio 同步写入 element，
                // 避免 usePersistGeneratorValue 异步延迟导致 savedPrompt 是旧值。
                // 这样在 finalizeGeneratedImageElement 用 ...item 展开时，
                // 图片元素上的 savedPrompt 始终为实际生成所用的提示词。
                if (actualPrompt !== el.savedPrompt || actualModel !== el.selectedModel || actualAspectRatio !== el.selectedAspectRatio || actualImageSize !== (el.selectedImageSize || '') || actualQuality !== (el.selectedImageQuality || 'auto') || actualDuration !== (el.selectedDuration || '') || actualGenerateCount !== (el.selectedGenerateCount || 1)) {
                    const synced = {
                        ...el,
                        savedPrompt: actualPrompt,
                        selectedModel: actualModel,
                        selectedAspectRatio: actualAspectRatio,
                        selectedImageSize: actualImageSize || undefined,
                        selectedImageQuality: actualQuality,
                        selectedDuration: actualDuration || undefined,
                        selectedGenerateCount: actualGenerateCount,
                    };
                    elementsMapRef.current.set(elementId, synced);
                    dirtyTrackerRef.current.markModified(elementId);
                }

                persistSubmission(pid, elementId, {
                    prompt: actualPrompt,
                    model: actualModel,
                    aspectRatio: actualAspectRatio,
                    imageSize: liveParams?.imageSize || '4K',
                    quality: actualQuality,
                    generateCount: actualGenerateCount,
                    taskType: el.type === 'video-generator' || el.type === 'video' ? 'video' : 'image',
                    duration: liveParams?.duration,
                    timestamp: Date.now(),
                });
            }
        } else {
            // 提交阶段结束 — 如果 taskId 已设置（API 成功），persistGeneration 已在追踪
            // 对超时/网络中断这类“未拿到 taskId 的中断提交”，保留 submission，
            // 这样刷新页面后 canvas-session-runtime 仍可自动重提。
            if (completion?.outcome === 'interrupted') {
                return;
            }

            clearSubmission(pid, elementId);
        }
    }, [currentProjectIdRef, dirtyTrackerRef, elementsMapRef]);

    useEffect(() => {
        void requestPersistentStorage();
    }, []);

    useEffect(() => {
        return subscribeWorkbenchSettingsChange(() => {
            setWorkbenchSettings(getWorkbenchSettings());
        });
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.canvasTheme = workbenchSettings.canvasTheme;
        root.style.colorScheme = workbenchSettings.canvasTheme;

        return () => {
            delete root.dataset.canvasTheme;
            root.style.removeProperty('color-scheme');
        };
    }, [workbenchSettings.canvasTheme]);

    const refreshStorageEstimate = useCallback(async () => {
        const estimate = await getStorageEstimateInfo();
        setStorageEstimate(estimate);

        if (!estimate || !workbenchSettings.warnOnHighStorage) return;

        if (estimate.usageRatio >= STORAGE_CRITICAL_THRESHOLD && !storageWarnedRef.current) {
            storageWarnedRef.current = true;
            showToast(`本地缓存占用已接近上限：${formatBytes(estimate.usageBytes)} / ${formatBytes(estimate.quotaBytes)}`, 'error');
        } else if (estimate.usageRatio < STORAGE_WARN_THRESHOLD) {
            storageWarnedRef.current = false;
        }
    }, [showToast, workbenchSettings.warnOnHighStorage]);

    useEffect(() => {
        queueMicrotask(() => {
            void refreshStorageEstimate();
        });
        const timer = window.setInterval(() => {
            void refreshStorageEstimate();
        }, 30000);
        return () => window.clearInterval(timer);
    }, [refreshStorageEstimate]);

    const {
        benchmarkResults,
        handleClearBenchmarkResults,
        isBenchmarkRunning,
        runCanvasBenchmark,
    } = useCanvasBenchmarkActions({
        benchmarkMode,
        workbenchSettings,
        addElements,
        setElements,
        setSelectedIds,
        refreshStorageEstimate,
        showToast,
    });

    const persistGeneratedAssetToDisk = useCallback(async (
        content: string,
        kind: 'image' | 'video',
        source: string,
        prefetchedBlob?: Blob | null,
    ) => {
        if (!workbenchSettings.autoSaveGenerated) return;

        try {
            let blob: Blob | null = prefetchedBlob ?? null;

            if (!blob) {
                if (kind === 'image' && isImageRef(content)) {
                    blob = await getImageBlob(content);
                } else if (content.startsWith('data:') || content.startsWith('blob:')) {
                    blob = await dataUrlToBlob(content);
                } else if (content.startsWith('http://') || content.startsWith('https://')) {
                    const filename = `lovart-${source}-${kind}`;
                    blob = await fetchRemoteBlob(content, filename);
                }
            }

            if (!blob) return;

            const filename = makeGeneratedFilename(kind, source, blob);
            const savedToDirectory = await saveBlobToAutoSaveDirectory(blob, filename);
            if (!savedToDirectory) {
                triggerBrowserDownload(blob, filename);
            }
        } catch (error) {
            console.warn('[Workbench] Auto save generated asset failed:', error);
        }
    }, [workbenchSettings.autoSaveGenerated]);

    const normalizeGeneratedImageContent = useCallback(async (
        content: string,
        source: string,
        prefetchedBlob?: Blob | null,
    ): Promise<string> => {
        return localizeGeneratedImageContent(content, source, {
            prefetchedBlob,
            onStorageChanged: () => { void refreshStorageEstimate(); },
        });
    }, [refreshStorageEstimate]);

    const resolveImageDisplayMetrics = useCallback(async (
        content: string,
        source: string,
        options?: ResolveImageDisplayMetricsOptions,
        prefetchedBlob?: Blob | null,
    ): Promise<{ width: number; height: number; x?: number; y?: number; aspectRatio?: string } | null> => {
        return getImageDisplayMetrics(content, source, options, prefetchedBlob);
    }, []);

    const resolveAspectRatioFallbackMetrics = useCallback((
        aspectRatio: string | undefined,
        anchor?: {
            x: number;
            y: number;
            width: number;
            height: number;
        },
    ): { width: number; height: number; x?: number; y?: number; aspectRatio?: string } | null => {
        return getAspectRatioFallbackMetrics(aspectRatio, anchor);
    }, []);

    const {
        finalizeAiEditedImageElement,
        replaceGeneratorWithPendingImage,
        finalizeGeneratedImageElement,
        finalizePolledImageResult,
    } = useImageFinalizer({
        elementsMapRef,
        currentProjectIdRef,
        dirtyTrackerRef,
        setElements,
        workbenchSettings,
        normalizeGeneratedImageContent,
        resolveImageDisplayMetrics,
        resolveAspectRatioFallbackMetrics,
        persistGeneratedAssetToDisk,
        primeRuntimeImageRenderSrc,
        recordProjectMediaItem,
    });

    const handleToggleAutoSaveGenerated = useCallback(async () => {
        if (workbenchSettings.autoSaveGenerated) {
            const next = { ...workbenchSettings, autoSaveGenerated: false };
            setWorkbenchSettings(next);
            saveWorkbenchSettings(next);
            showToast('已关闭生成结果自动落盘', 'info');
            return;
        }

        if (hasDirectoryPickerSupport()) {
            try {
                const handle = await requestAutoSaveDirectoryHandle();
                if (!handle) {
                    showToast('当前浏览器不支持目录写入，将回退为普通下载', 'info');
                }
            } catch (error) {
                console.warn('[Workbench] Directory picker cancelled:', error);
                showToast('未选择自动保存目录', 'info');
                return;
            }
        }

        const next = { ...workbenchSettings, autoSaveGenerated: true };
        setWorkbenchSettings(next);
        saveWorkbenchSettings(next);
        showToast('已开启生成结果自动落盘', 'success');
    }, [showToast, workbenchSettings]);

    const mouseCanvasPosRef = useRef<{ x: number; y: number } | null>(null);

    const {
        syncImageStoreCleanup,
        normalizeLoadedImageElements,
    } = useCanvasImageMigration({
        scale,
        pan,
        workbenchSettings,
        refreshStorageEstimate,
        normalizeGeneratedImageContent,
        resolveImageDisplayMetrics,
    });

    const {
        title,
        handleTitleChange,
        saveStatus,
        isLoading,
        titleDirtyRef,
        clearScheduledSave,
        saveProject,
    } = useCanvasProjectPersistence({
        user,
        database,
        projectId,
        currentProjectId,
        setCurrentProjectId,
        currentProjectIdRef,
        isInitializedRef,
        migrationPendingRef,
        elementsMapRef,
        dirtyTrackerRef,
        historyInitializedRef,
        setElements,
        setScale,
        setPan,
        searchParams,
        setInitialPrompt,
        openChat,
        setChunkPreheat,
        syncImageStoreCleanup,
        normalizeLoadedImageElements,
        refreshStorageEstimate,
    });

    useEffect(() => {
        let cancelled = false;

        queueMicrotask(() => {
            if (!cancelled && isInitializedRef.current) {
                setIsCanvasReadyForHistory(true);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [currentProjectId, isLoading]);

    useEffect(() => {
        const resolveCanvasArea = () => document.querySelector('[data-testid="canvas-area"]');
        let isCanvasPointerSuspended = false;

        const suspendCanvasPointerEvents = () => {
            if (isCanvasPointerSuspended) {
                return;
            }

            const canvasArea = resolveCanvasArea();
            if (!(canvasArea instanceof HTMLElement)) {
                return;
            }

            canvasArea.style.pointerEvents = 'none';
            isCanvasPointerSuspended = true;
        };

        const restoreCanvasPointerEvents = () => {
            if (!isCanvasPointerSuspended) {
                return;
            }

            const canvasArea = resolveCanvasArea();
            if (canvasArea instanceof HTMLElement) {
                canvasArea.style.pointerEvents = '';
            }
            isCanvasPointerSuspended = false;
        };

        const handleDocumentMouseDown = (event: MouseEvent) => {
            if (!isEditableOverlayTarget(event.target)) {
                return;
            }

            suspendCanvasPointerEvents();
        };

        document.addEventListener('mousedown', handleDocumentMouseDown, true);
        window.addEventListener('mouseup', restoreCanvasPointerEvents, true);
        window.addEventListener('pointerup', restoreCanvasPointerEvents, true);
        window.addEventListener('blur', restoreCanvasPointerEvents);

        return () => {
            document.removeEventListener('mousedown', handleDocumentMouseDown, true);
            window.removeEventListener('mouseup', restoreCanvasPointerEvents, true);
            window.removeEventListener('pointerup', restoreCanvasPointerEvents, true);
            window.removeEventListener('blur', restoreCanvasPointerEvents);
            restoreCanvasPointerEvents();
        };
    }, []);

    // ── 会话运行时控制器：自动保存、卸载刷新、beforeunload、孤立生成恢复 ──
    useCanvasSessionRuntime({
        user,
        isLoading,
        isCanvasReady: isCanvasReadyForHistory,
        isDraggingElement,
        elementsCount: elements.length,
        elementsVersion,
        title,
        elementsMapRef,
        isInitializedRef,
        currentProjectIdRef,
        scaleRef,
        panRef,
        dirtyTrackerRef,
        titleDirtyRef,
        saveProject,
        clearScheduledSave,
        showToast,
        setGeneratorSubmittingMap,
        setElementsVersion,
        finalizeAiEditedImageElement,
        recordProjectMediaItem,
        normalizeGeneratedImageContent,
        resolveImageDisplayMetrics,
        persistGeneratedAssetToDisk,
    });

    const {
        failGenerationTask,
        generationQueueItems,
    } = useGenerationPollingController({
        elements,
        setElements,
        dirtyTrackerRef,
        currentProjectIdRef,
        generatorSubmittingMap,
        setGeneratorSubmittingMap,
        callbacks: {
            finalizePolledImageResult,
            persistGeneratedAssetToDisk,
            recordProjectMediaItem,
            announceCompletedResult: announcePassiveCompletedResult,
            showToast,
        },
    });

    // 同步空间索引：元素变化时重建索引（拖拽期间跳过，mouseUp 一次性提交后再重建）
    useEffect(() => {
        if (isDraggingElement) return;
        if (!spatialIndexNeedsRebuildRef.current) return;
        spatialIndexRef.current.load(canvasRuntimeElements);
        spatialIndexNeedsRebuildRef.current = false;
    }, [canvasRuntimeElements, isDraggingElement, spatialIndexNeedsRebuildRef, spatialIndexRef]);

    // Space key for temporary hand tool
    const prevToolRef = useRef<string | null>(null);
    useEffect(() => {
        const handleSpaceDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                if (activeTool !== 'hand') {
                    prevToolRef.current = activeTool;
                    setActiveTool('hand');
                }
            }
        };
        const handleSpaceUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (prevToolRef.current !== null) {
                    setActiveTool(prevToolRef.current);
                    prevToolRef.current = null;
                }
            }
        };
        window.addEventListener('keydown', handleSpaceDown);
        window.addEventListener('keyup', handleSpaceUp);
        return () => {
            window.removeEventListener('keydown', handleSpaceDown);
            window.removeEventListener('keyup', handleSpaceUp);
        };
    }, [activeTool, setActiveTool]);

    const openImageGeneratorRef = useRef<() => void>(() => {});

    // Track mouse position on canvas
    const handleCanvasMouseMove = useCallback((canvasX: number, canvasY: number) => {
        mouseCanvasPosRef.current = { x: canvasX, y: canvasY };
    }, []);

    // Helper: get placement position - use last mouse position, fallback to viewport center
    const getPlacementPosition = useCallback(() => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        return calculateCanvasCenter(mouseCanvasPosRef.current, pan, scale, vw, vh);
    }, [pan, scale]);

    const {
        collectSelectionWithFrameChildren,
        selectSingleElement,
        handleToggleElementsHidden,
        handleToggleElementsLocked,
        handleGroupSelection,
        handleUngroupSelection,
        handleMergeSelection,
        handleBringForward,
        handleSendBackward,
        handleBringToFront,
        handleSendToBack,
        handleReorderLayer,
        handleMoveLayerToParent,
    } = useCanvasActions({
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
    });

    const {
        canPaste,
        canvasClipboardPreferredRef,
        clipboardRef,
        handleCopySelection,
        handleCutSelection,
        handleDuplicateSelection,
        handlePasteAt,
        markCanvasClipboardPreferred,
    } = useCanvasClipboardActions({
        elements,
        addElements,
        collectSelectionWithFrameChildren,
        removeElementsByIds,
        runHistoryTransaction,
        setSelectedIds,
        showToast,
    });

    const handleDeleteLayerSelection = useCallback((ids: string[]) => {
        const uniqueIds = Array.from(new Set(ids));
        if (uniqueIds.length === 0) return;

        const idSet = new Set(uniqueIds);
        const frameIds = elements
            .filter(el => idSet.has(el.id) && el.type === 'frame')
            .map(el => el.id);

        if (frameIds.length > 0) {
            elements
                .filter(el => el.parentFrameId && frameIds.includes(el.parentFrameId))
                .forEach(el => {
                    if (!idSet.has(el.id)) {
                        handleElementChange(el.id, { parentFrameId: undefined });
                    }
                });
        }

        runHistoryTransaction({ label: '批量删除图层', source: 'layers-delete' }, () => {
            removeElementsByIds(uniqueIds);
            showToast(uniqueIds.length > 1 ? `已删除 ${uniqueIds.length} 个图层` : '已删除图层', 'success');
        });
    }, [elements, handleElementChange, removeElementsByIds, runHistoryTransaction, showToast]);

    const buildAutoGroupFrame = useCallback((items: CanvasElement[], frameName: string) => {
        return _buildAutoGroupFrame(items, frameName, uuidv4);
    }, []);

    const aiCanvasPlanContextSummary = useMemo(() => {
        return buildAiCanvasSelectionSummary(elements, selectedIds);
    }, [elements, selectedIds]);

    const focusNewElement = useCallback((elementId: string) => {
        setSelectedIds([elementId]);
        setActiveTool('select');
    }, [setActiveTool, setSelectedIds]);

    const addAndFocusElement = useCallback((element: CanvasElement) => {
        addElement(element);
        focusNewElement(element.id);
    }, [addElement, focusNewElement]);

    const addAndSelectElement = useCallback((element: CanvasElement) => {
        addElement(element);
        setSelectedIds([element.id]);
    }, [addElement, setSelectedIds]);

    const addElementsWithOptionalAutoGroup = useCallback((items: CanvasElement[], groupName: string) => {
        const group = buildAutoGroupFrame(items, groupName);
        if (group) {
            items.forEach((item) => {
                item.parentFrameId = group.frameId;
            });
            addElements([group.frame, ...items]);
            selectSingleElement(group.frameId);
            return;
        }

        if (items.length === 1) {
            addAndSelectElement(items[0]);
            return;
        }

        addElements(items);
        setSelectedIds(items.map((item) => item.id));
    }, [addAndSelectElement, addElements, buildAutoGroupFrame, selectSingleElement, setSelectedIds]);

    // buildCenteredElementBounds — imported from canvas-element-ops

    const buildBelowElementDisplayMetricsOptions = useCallback((element: CanvasElement, maxHeightPadding = 0) => {
        return createBelowElementDisplayMetricsOptions(element, maxHeightPadding);
    }, []);

    const buildImageElement = useCallback((attrs: Omit<CanvasElement, 'id' | 'type'>) => {
        return createImageElement(attrs, {
            uuidFn: uuidv4,
            defaultPresentation: getDefaultImagePresentation(workbenchSettings),
        });
    }, [workbenchSettings]);

    const buildBelowSourceImageResultElement = useCallback((params: {
        source: CanvasElement;
        metrics?: { x?: number; y?: number; width: number; height: number } | null;
        content: string;
        displayName?: string;
        extraAttrs?: Partial<CanvasElement>;
    }) => {
        return createBelowSourceImageResultElement(params, {
            uuidFn: uuidv4,
            defaultPresentation: getDefaultImagePresentation(workbenchSettings),
        });
    }, [workbenchSettings]);

    const buildVideoElement = useCallback((attrs: Omit<CanvasElement, 'id' | 'type'>) => {
        return createVideoElement(attrs, { uuidFn: uuidv4 });
    }, []);

    const buildGeneratorElement = useCallback((
        type: Extract<CanvasElement['type'], 'image-generator' | 'video-generator' | 'storyboard-planner'>,
        attrs: Omit<CanvasElement, 'id' | 'type'>,
    ) => {
        return createGeneratorElement(type, attrs, { uuidFn: uuidv4 });
    }, []);

    const handleApplyAiCanvasPlan = useCanvasAiPlanExecutor({
        selectedIdsRef,
        elementsMapRef,
        currentProjectIdRef,
        getPlacementPosition,
        buildGeneratorElement,
        addAndSelectElement,
        handleGroupSelection,
        runHistoryTransaction,
        saveProjectReferenceFromSelection,
    });

    const resolveCanvasContentBlob = useCallback(async (content: string, remoteFilename: string) => {
        return _resolveCanvasContentBlob(content, remoteFilename, { getImageBlob, dataUrlToBlob, fetchRemoteBlob });
    }, []);

    const {
        handleAddImage,
        handleAddVideo,
        transcodingStatus,
    } = useCanvasMediaImport({
        addElements,
        addAndFocusElement,
        buildVideoElement,
        canvasClipboardPreferredRef,
        clipboardRef,
        getPlacementPosition,
        handlePasteAt,
        refreshStorageEstimate,
        removeElementsByIds,
        setActiveTool,
        setElements,
        setSelectedIds,
        showToast,
        workbenchSettings,
    });

    const handleAddText = useCallback(() => {
        const center = getPlacementPosition();
        const newElement: CanvasElement = {
            id: uuidv4(),
            type: 'text',
            x: center.x - 50,
            y: center.y - 15,
            content: '双击编辑文本',
        };
        addAndFocusElement(newElement);
    }, [getPlacementPosition, addAndFocusElement]);

    const handleAddShape = useCallback((type: 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right') => {
        const center = getPlacementPosition();
        const newElement: CanvasElement = {
            id: uuidv4(),
            type: 'shape',
            shapeType: type,
            x: center.x - 75,
            y: center.y - 75,
            width: 150,
            height: 150,
            color: '#9CA3AF', // Default gray
        };
        addAndFocusElement(newElement);
    }, [getPlacementPosition, addAndFocusElement]);

    const handleOpenImageGenerator = useCallback(() => {
        const center = getPlacementPosition();
        const newElement = buildGeneratorElement('image-generator', buildCenteredElementBounds(center, 400, 400));
        addAndFocusElement(newElement);
    }, [getPlacementPosition, addAndFocusElement, buildGeneratorElement]);

    useEffect(() => {
        openImageGeneratorRef.current = handleOpenImageGenerator;
    }, [handleOpenImageGenerator]);

    useCanvasKeyboardShortcuts({
        elements,
        selectedIds,
        clipboardRef,
        markCanvasClipboardPreferred,
        openImageGeneratorRef,
        cloneCanvasElement,
        addElements,
        setSelectedIds,
        setActiveTool,
        handleAddText,
        handleElementChange,
        handleFitToScreen,
        handleZoomIn,
        handleZoomOut,
        handleZoomTo,
        removeElementsByIds,
        onOpenCommandPalette: () => setShowCommandPalette(true),
        onOpenShortcutHelp: () => setShowShortcutHelp(true),
        onShortcutTriggered: announceShortcut,
        redo,
        saveProject,
        undo,
    });

    const handleOpenVideoGenerator = useCallback(() => {
        const center = getPlacementPosition();
        const newElement = buildGeneratorElement('video-generator', buildCenteredElementBounds(center, 400, 300));
        addAndFocusElement(newElement);
    }, [getPlacementPosition, addAndFocusElement, buildGeneratorElement]);

    const handleOpenStoryboardPlanner = useCallback(() => {
        const center = getPlacementPosition();
        const newElement = buildGeneratorElement('storyboard-planner', buildCenteredElementBounds(center, 420, 320));
        addAndFocusElement(newElement);
    }, [addAndFocusElement, buildGeneratorElement, getPlacementPosition]);

    const {
        handleGenerateVideo,
        handleRecoverVideoTask,
        handleRecoverImageTask,
    } = useCanvasGenerationActions({
        selectedIds,
        elements,
        elementsMapRef,
        currentProjectIdRef,
        dirtyTrackerRef,
        setElements,
        setGeneratorSubmittingMap,
        getPlacementPosition,
        buildVideoElement,
        addAndSelectElement,
        persistGeneratedAssetToDisk,
        recordProjectMediaItem,
        failGenerationTask,
        announceCompletedResult,
        showToast,
        replaceGeneratorWithPendingImage,
        finalizeGeneratedImageElement,
    });

    const shortcutSections = CANVAS_SHORTCUT_SECTIONS;

    const commandActions = useCanvasCommandActions({
        activeTool,
        setActiveTool,
        saveProject,
        showLayers,
        showHistory,
        showMedia,
        showChat,
        toggleLayers,
        toggleHistory,
        toggleMedia,
        toggleChat,
        handleFitToScreen,
        handleZoomIn,
        handleZoomOut,
        historySummary,
        undo,
        redo,
        handleAddText,
        handleOpenImageGenerator,
        handleOpenVideoGenerator,
        handleOpenStoryboardPlanner,
    });

    const handleConnectFlow = useCanvasFlowConnection({
        elementsMapRef,
        dirtyTrackerRef,
        setElements,
        focusNewElement,
        buildGeneratorElement,
    });

    const resolveElementReferenceImages = useCallback(async (element: CanvasElement) => {
        return _resolveElementReferenceImages(element);
    }, []);

    const resolveElementFrameImages = useCallback(async (element: CanvasElement) => {
        return _resolveElementFrameImages(element);
    }, []);

    const {
        handleCreateStoryboardDraft,
        handleExportStoryboard,
        handleExportStoryboardSelection,
        handleGenerateStoryboardSelection,
        handleGenerateStoryboardVideoSelection,
        handleStoryboardAuditFilterChange,
        handleStoryboardExportItemsChange,
        handleStoryboardFieldsSaved,
        handleStoryboardPlanFromImage,
        submitStoryboardGeneratorElement,
        submitStoryboardVideoGeneratorElement,
    } = useCanvasStoryboardActions({
        elementsMapRef,
        dirtyTrackerRef,
        currentProjectIdRef,
        setElements,
        setSelectedIds,
        setGeneratorSubmittingMap,
        workbenchSettings,
        getPlacementPosition,
        buildImageElement,
        buildGeneratorElement,
        addElementsWithOptionalAutoGroup,
        resolveElementReferenceImages,
        resolveElementFrameImages,
        replaceGeneratorWithPendingImage,
        finalizeGeneratedImageElement,
        persistGeneratedAssetToDisk,
        recordProjectMediaItem,
        announcePassiveCompletedResult,
        normalizeGeneratedImageContent,
        resolveCanvasContentBlob,
        handleElementChange,
        focusCanvasElement,
        showToast,
        setStoryboardPlannerSourceElementId,
        setIsStoryboardExportOpen,
        setIsStoryboardExportSubmitting,
        setStoryboardExportSubmitStatus,
        setAnnotateImageTargetId,
        setCropImageTargetId,
        setSplitStoryboardTargetId,
        setStoryboardAuditFilter,
        autoAdvanceStoryboardIssues,
        autoAdvanceStoryboardScope,
        setAutoAdvanceStoryboardScope,
        showLayers,
        toggleLayers,
    });

    const handleResumeGenerationItem = useCallback((item: GenerationQueueItem) => {
        if (item.entityType === 'group' && item.resumeTargetIds && item.resumeTargetIds.length > 0) {
            showToast(`正在重试 ${item.resumeTargetIds.length} 个失败分镜任务`, 'info');
            void (async () => {
                const results = await Promise.allSettled(item.resumeTargetIds!.map((id) => {
                    const target = elementsMapRef.current.get(id);
                    if (target?.type === 'video-generator') {
                        return submitStoryboardVideoGeneratorElement(id);
                    }
                    return submitStoryboardGeneratorElement(id);
                }));
                const resumedCount = results.filter((result) => result.status === 'fulfilled' && result.value).length;
                if (resumedCount > 0) {
                    showToast(`已重新提交 ${resumedCount} 个分镜任务`, 'success');
                    return;
                }
                showToast('批量重试未成功，请检查失败项参数后再试', 'error');
            })();
            return;
        }

        const targetId = item.locateTargetId || item.id;
        const target = elementsMapRef.current.get(targetId);
        if (!target) {
            showToast('未找到对应生成器，无法继续编辑', 'error');
            return;
        }

        if (item.entityType !== 'group' && (target.type === 'image-generator' || target.type === 'video-generator' || target.type === 'image')) {
            setElements((prev) => applyElementGenerationPatch(prev, target.id, { generatingError: undefined }));
            dirtyTrackerRef.current.markModified(target.id);
        }

        focusCanvasElement(targetId);
        showToast('已定位到对应任务，可调整参数后继续处理', 'info');
    }, [dirtyTrackerRef, elementsMapRef, focusCanvasElement, setElements, showToast, submitStoryboardGeneratorElement, submitStoryboardVideoGeneratorElement]);

    const handleLocateGenerationQueueItem = useCallback((item: GenerationQueueItem) => {
        focusCanvasElement(item.locateTargetId || item.id);
    }, [focusCanvasElement]);

    // ========== ContextToolbar 功能处理函数 ==========

    // 复制元素
    const handleCopyElement = useCallback((element: CanvasElement) => {
        const newElement: CanvasElement = {
            ...element,
            id: uuidv4(),
            x: element.x + 30,
            y: element.y + 30,
        };
        addAndSelectElement(newElement);
        showToast('已复制元素', 'success');
    }, [addAndSelectElement, showToast]);

    // 下载元素
    const handleDownloadElement = useCallback(async (element: CanvasElement, format: ElementExportFormat = 'original') => {
        if (!element.content) {
            showToast('该元素没有可下载的内容', 'error');
            return;
        }

        const isImageElement = element.type === 'image';
        const exportFormat = isImageElement && format === 'original' ? 'png' : format;
        showToast('正在下载...', 'info');
        const ext = element.type === 'video'
            ? 'mp4'
            : exportFormat === 'jpg'
                ? 'jpg'
                : exportFormat === 'svg'
                    ? 'svg'
                    : 'png';
        const filename = `lovart-${element.type}-${Date.now()}.${ext}`;

        try {
            let blob = await resolveCanvasContentBlob(element.content, filename);

            if (!blob) {
                showToast(element.type === 'video' ? '无法获取视频数据' : '无法获取图片数据', 'error');
                return;
            }

            if (isImageElement) {
                if (exportFormat === 'png') {
                    blob = blob.type.includes('png') ? blob : await convertImageBlobToRasterBlob(blob, 'image/png');
                } else if (exportFormat === 'jpg') {
                    blob = await convertImageBlobToRasterBlob(blob, 'image/jpeg');
                } else if (exportFormat === 'svg') {
                    blob = await buildSvgExportBlob(blob);
                }
            }

            const saveMode = await saveBlobToLocalFile(blob, filename);
            if (saveMode === 'cancelled') {
                showToast('已取消保存', 'info');
                return;
            }
            showToast(saveMode === 'picker' ? '已保存到本地硬盘' : '下载成功', 'success');
        } catch (err) {
            console.error('Download failed:', err);
            if (element.type === 'video' || exportFormat === 'original') {
                const fallbackContent = isImageRef(element.content)
                    ? await getImageDataUrl(element.content) || element.content
                    : element.content;
                window.open(fallbackContent, '_blank');
                showToast('已在新标签页打开，请右键另存为', 'info');
                return;
            }

            showToast('导出失败，请稍后重试', 'error');
        }
    }, [resolveCanvasContentBlob, showToast]);

    const {
        handleAiEditElement,
        handleAnnotateImage,
        handleAnnotateImageRequest,
        handleCropImage,
        handleCropImageRequest,
        handleMockupElement,
        handleRecoverEditedImageTask,
        handleReplaceBackground,
        handleSplitStoryboard,
        handleSplitStoryboardRequest,
    } = useCanvasImageToolActions({
        elements,
        elementsMapRef,
        dirtyTrackerRef,
        currentProjectIdRef,
        scaleRef,
        panRef,
        setElements,
        setGeneratorSubmittingMap,
        workbenchSettings,
        resolveElementReferenceImages,
        finalizeAiEditedImageElement,
        failGenerationTask,
        announceCompletedResult,
        showToast,
        handleGeneratorSubmittingChange,
        resolveCanvasContentBlob,
        resolveImageDisplayMetrics,
        buildBelowElementDisplayMetricsOptions,
        buildBelowSourceImageResultElement,
        buildImageElement,
        addElementsWithOptionalAutoGroup,
        beginImageToolSubmission,
        endImageToolSubmission,
        ensureImageToolSource,
        setAnnotateImageTargetId,
        setIsAnnotateImageSubmitting,
        setAnnotateImageSubmitStatus,
        setCropImageTargetId,
        setIsCropImageSubmitting,
        setCropImageSubmitStatus,
        setSplitStoryboardTargetId,
        setIsSplitStoryboardSubmitting,
        setSplitStoryboardSubmitStatus,
    });

    const handleGenerateImage = useCallback(async (result: { imageUrl: string; taskId?: string | null }) => {
        // ImageGeneratorPanel now handles API calls and polling internally
        // This callback receives the final image URL. Show a placeholder immediately,
        // then localize/cache/measure in the background.
        const { imageUrl, taskId } = result;
        const normalizedTaskId = typeof taskId === 'string' && taskId.trim().length > 0
            ? taskId.trim()
            : undefined;
        // 使用 elementsMapRef 而非闭包中的 elements，避免并发生成时读取到过时的元素状态
        const map = elementsMapRef.current;
        const generatorElementId = selectedIds.find(id => {
            const el = map.get(id);
            return el?.type === 'image-generator';
        });
        const generatorElement = generatorElementId ? map.get(generatorElementId) : null;

        if (generatorElementId && generatorElement) {
            // 立即展示图片预览（cover 填充），让用户立刻看到生成结果位置
            replaceGeneratorWithPendingImage(generatorElementId, imageUrl, normalizedTaskId);
            announceCompletedResult(generatorElementId, '✅ 图片生成完成，已显示在生成器当前位置');
            // 后台异步校正尺寸
            void finalizeGeneratedImageElement(
                generatorElementId,
                imageUrl,
                'generate',
                {
                    x: generatorElement.x,
                    y: generatorElement.y,
                    width: generatorElement.width || 400,
                    height: generatorElement.height || 400,
                },
                normalizedTaskId,
            );
            return;
        }

        const center = getPlacementPosition();
        const newElement = buildImageElement({
            ...buildCenteredElementBounds(center, 400, 400),
            content: imageUrl,
            sourceGenerationTaskId: normalizedTaskId,
            sourceGenerationTaskType: normalizedTaskId ? 'image' : undefined,
        });
        addAndSelectElement(newElement);
        announceCompletedResult(newElement.id, '✅ 图片生成完成，已添加到画布');
        void finalizeGeneratedImageElement(
            newElement.id,
            imageUrl,
            'generate',
            {
                x: newElement.x,
                y: newElement.y,
                width: newElement.width || 400,
                height: newElement.height || 400,
            },
            normalizedTaskId,
        );
    }, [selectedIds, elementsMapRef, getPlacementPosition, announceCompletedResult, buildImageElement, finalizeGeneratedImageElement, replaceGeneratorWithPendingImage, addAndSelectElement]);

    const addGeneratedImageElementToCanvas = useCallback(async (
        element: CanvasElement,
        options: {
            selectAfterAdd?: boolean;
            recordMediaHistory?: boolean;
        } = {},
    ) => {
        const normalizedElement = { ...element } as CanvasElement;

        if (normalizedElement.type === 'image' && normalizedElement.content) {
            let batchBlob: Blob | null = null;
            if (normalizedElement.content.startsWith('http://') || normalizedElement.content.startsWith('https://')) {
                batchBlob = await fetchRemoteBlob(normalizedElement.content, 'lovart-batch-image');
                if (batchBlob) {
                    primeRuntimeImageRenderSrc(normalizedElement.id, batchBlob);
                }
            }

            normalizedElement.content = await normalizeGeneratedImageContent(normalizedElement.content, 'generate-batch', batchBlob);
            normalizedElement.imageFit = normalizedElement.imageFit || workbenchSettings.defaultImageFit;
            normalizedElement.imageSurface = normalizedElement.imageSurface || workbenchSettings.defaultImageSurface;
            const displayMetrics = await resolveImageDisplayMetrics(normalizedElement.content, 'generate-batch', {
                maxWidth: normalizedElement.width || 400,
                maxHeight: normalizedElement.height || 400,
                anchor: {
                    x: normalizedElement.x,
                    y: normalizedElement.y,
                    width: normalizedElement.width || 400,
                    height: normalizedElement.height || 400,
                },
            });
            if (displayMetrics) {
                normalizedElement.width = displayMetrics.width;
                normalizedElement.height = displayMetrics.height;
                normalizedElement.x = displayMetrics.x ?? normalizedElement.x;
                normalizedElement.y = displayMetrics.y ?? normalizedElement.y;
                normalizedElement.selectedAspectRatio = displayMetrics.aspectRatio ?? normalizedElement.selectedAspectRatio;
            }

            normalizedElement.flowReferenceImages = normalizedElement.savedReferenceImages || normalizedElement.flowReferenceImages;
            normalizedElement.referenceImageId = undefined;
            normalizedElement.savedReferenceImages = undefined;
            normalizedElement.savedReferenceImage = undefined;
        }

        addElement(normalizedElement);
        if (options.selectAfterAdd) {
            setSelectedIds([normalizedElement.id]);
        }

        if (options.recordMediaHistory && normalizedElement.type === 'image' && normalizedElement.content) {
            recordProjectMediaItem({
                kind: 'image',
                content: normalizedElement.content,
                taskId: normalizedElement.sourceGenerationTaskId,
                sourceElement: normalizedElement,
                sourceElementId: normalizedElement.id,
            });
        }

        return normalizedElement;
    }, [addElement, normalizeGeneratedImageContent, primeRuntimeImageRenderSrc, recordProjectMediaItem, resolveImageDisplayMetrics, setSelectedIds, workbenchSettings.defaultImageFit, workbenchSettings.defaultImageSurface]);

    const {
        handleClearProjectMediaHistory,
        handleClearProjectReferences,
        handleDeleteProjectReferenceItem,
        handleDeleteProjectReferenceItems,
        handleInsertProjectMediaItem,
        handleInsertProjectReferenceItem,
        handleInsertProjectReferenceItems,
        handleLocateProjectMediaSource,
        handleLocateProjectReferenceSource,
        saveProjectReferenceFromMediaItem,
    } = useCanvasProjectBackflowActions({
        currentProjectIdRef,
        normalizeGeneratedImageContent,
        getPlacementPosition,
        buildImageElement,
        buildVideoElement,
        addGeneratedImageElementToCanvas,
        addAndSelectElement,
        addElement,
        setSelectedIds,
        focusCanvasElement,
        showToast,
    });

    const handleAddGeneratedBatchImageElement = useCallback((element: {
        id: string;
        type: string;
        x: number;
        y: number;
        width: number;
        height: number;
        content?: string;
        generatingTaskId?: string;
        generatingTaskType?: string;
        generatingProgress?: number;
        savedPrompt?: string;
        selectedModel?: string;
        selectedAspectRatio?: string;
        selectedImageSize?: string;
        selectedImageQuality?: string;
        selectedGenerateCount?: number;
        generationResultIndex?: number;
        savedReferenceImages?: string;
        sourceGenerationTaskId?: string;
        sourceGenerationTaskType?: 'image' | 'video';
    }) => {
        void (async () => {
            await addGeneratedImageElementToCanvas({ ...element } as CanvasElement, {
                recordMediaHistory: true,
            });
        })();
    }, [addGeneratedImageElementToCanvas]);

    // ── Stable inline callbacks (extracted from JSX to preserve referential identity) ──
    const handleDragStart = useCallback(() => setIsDraggingElement(true), []);
    const handleDragEnd = useCallback(() => setIsDraggingElement(false), []);
    const handleDeleteMark = useCallback((id: string) => {
        removeElementsByIds([id]);
    }, [removeElementsByIds]);
    const handleClearAllMarks = useCallback(() => {
        removeElementsByIds(
            elements
                .filter(el => el.type === 'mark')
                .map(el => el.id),
        );
    }, [elements, removeElementsByIds]);

    const selectedGeneratorElement = useMemo(() => getSelectedGeneratorElement(elements, selectedIds, {
        isDraggingElement,
        canvasSelectMode,
    }), [canvasSelectMode, elements, isDraggingElement, selectedIds]);

    const selectedGeneratorPanelStyle = useMemo(() => {
        if (!selectedGeneratorElement) {
            return undefined;
        }

        return getGeneratorOverlayStyle(selectedGeneratorElement, scale, pan);
    }, [pan, scale, selectedGeneratorElement]);

    const generatorPanelCanvasImages = useMemo(
        () => buildGeneratorCanvasImages(canvasImages, elementById),
        [canvasImages, elementById],
    );

    const selectedCanvasImageIds = useMemo(
        () => buildSelectedCanvasImageIds(selectedIds, elementById),
        [elementById, selectedIds],
    );

    const storyboardPlannerSourceElement = useMemo(() => {
        if (!storyboardPlannerSourceElementId) {
            return null;
        }

        const element = elements.find((item) => item.id === storyboardPlannerSourceElementId);
        if (!element || element.type !== 'image' || !element.content) {
            return null;
        }

        return element;
    }, [elements, storyboardPlannerSourceElementId]);

    const storyboardPlannerPanelStyle = useMemo(() => {
        if (!storyboardPlannerSourceElement) {
            return undefined;
        }

        return getGeneratorOverlayStyle(storyboardPlannerSourceElement, scale, pan);
    }, [pan, scale, storyboardPlannerSourceElement]);

    const selectedAnnotateImageElement = useMemo(() => {
        if (
            !annotateImageTargetId ||
            selectedIds.length !== 1 ||
            selectedIds[0] !== annotateImageTargetId ||
            isDraggingElement ||
            canvasSelectMode
        ) {
            return null;
        }

        const target = elements.find((item) => item.id === annotateImageTargetId);
        return target?.type === 'image' ? target : null;
    }, [annotateImageTargetId, canvasSelectMode, elements, isDraggingElement, selectedIds]);

    const selectedAnnotateImagePanelStyle = useMemo(() => {
        return getElementPanelStyle(selectedAnnotateImageElement, scale, pan);
    }, [pan, scale, selectedAnnotateImageElement]);

    const selectedCropImageElement = useMemo(() => {
        if (
            !cropImageTargetId ||
            selectedIds.length !== 1 ||
            selectedIds[0] !== cropImageTargetId ||
            isDraggingElement ||
            canvasSelectMode
        ) {
            return null;
        }

        const target = elements.find((item) => item.id === cropImageTargetId);
        return target?.type === 'image' ? target : null;
    }, [canvasSelectMode, cropImageTargetId, elements, isDraggingElement, selectedIds]);

    const selectedCropImagePanelStyle = useMemo(() => {
        return getElementPanelStyle(selectedCropImageElement, scale, pan);
    }, [pan, scale, selectedCropImageElement]);

    const selectedStoryboardExportElements = useMemo(() => {
        return selectedIds
            .map((id) => elements.find((item) => item.id === id))
            .filter((item): item is CanvasElement => !!item && item.type === 'image' && !!item.content);
    }, [elements, selectedIds]);

    const selectedSplitStoryboardElement = useMemo(() => {
        if (
            !splitStoryboardTargetId ||
            selectedIds.length !== 1 ||
            selectedIds[0] !== splitStoryboardTargetId ||
            isDraggingElement ||
            canvasSelectMode
        ) {
            return null;
        }

        const target = elements.find((item) => item.id === splitStoryboardTargetId);
        return target?.type === 'image' ? target : null;
    }, [canvasSelectMode, elements, isDraggingElement, selectedIds, splitStoryboardTargetId]);

    const selectedSplitStoryboardPanelStyle = useMemo(() => {
        return getElementPanelStyle(selectedSplitStoryboardElement, scale, pan);
    }, [pan, scale, selectedSplitStoryboardElement]);

    const canvasAreaDomains: CanvasAreaDomains = {
        selection: {
            selectedIds,
            highlightedElementIds: highlightedLayerIds,
            onSelect: setSelectedIds,
            activeTool,
            onToolChange: setActiveTool,
        },
        view: {
            scale,
            pan,
            onPanChange: setPan,
            onScaleChange: setScale,
        },
        elementCRUD: {
            elements: canvasRuntimeElements,
            onElementChange: handleElementChange,
            onBatchElementChange: handleBatchElementChange,
            onDelete: handleDelete,
            onAddElement: addElement,
        },
        clipboard: {
            canPaste,
            onCopyElement: handleCopyElement,
            onCopySelection: handleCopySelection,
            onCutSelection: handleCutSelection,
            onPasteAt: handlePasteAt,
            onDuplicateSelection: handleDuplicateSelection,
        },
        layout: {
            onGroupSelection: handleGroupSelection,
            onUngroupSelection: handleUngroupSelection,
            onMergeSelection: handleMergeSelection,
            onBringForward: handleBringForward,
            onSendBackward: handleSendBackward,
            onBringToFront: handleBringToFront,
            onSendToBack: handleSendToBack,
            onToggleElementsHidden: handleToggleElementsHidden,
            onToggleElementsLocked: handleToggleElementsLocked,
            onDeleteSelection: removeElementsByIds,
        },
        generator: {
            onOpenImageGenerator: handleOpenImageGenerator,
            onOpenVideoGenerator: handleOpenVideoGenerator,
            onGenerateStoryboardSelection: handleGenerateStoryboardSelection,
            onGenerateStoryboardVideoSelection: handleGenerateStoryboardVideoSelection,
            onExportStoryboardSelection: handleExportStoryboardSelection,
            generatorSubmittingMap,
            highlightedResultId,
        },
        media: {
            projectReferenceImages: projectReferenceItems,
            onUseProjectReferenceImage: handleUseProjectReferenceImage,
            onSaveAsProjectReference: saveProjectReferenceFromElement,
            onSaveSelectionAsProjectReference: saveProjectReferenceFromSelection,
            onAddImage: handleAddImage,
            onAddVideo: handleAddVideo,
        },
        editingTools: {
            onAiEditElement: handleAiEditElement,
            onRecoverImageEditTask: handleRecoverEditedImageTask,
            onReplaceBackground: handleReplaceBackground,
            onMockupElement: handleMockupElement,
            onAnnotateImage: handleAnnotateImageRequest,
            onCropImage: handleCropImageRequest,
            onSplitStoryboard: handleSplitStoryboardRequest,
            onStoryboardPlanFromImage: handleStoryboardPlanFromImage,
        },
        export: {
            onDownloadElement: handleDownloadElement,
            onSendSelectionToChat: handleSendSelectionToChat,
        },
        canvasSelectMode: {
            canvasSelectMode,
            onCanvasSelectPick: handleCanvasSelectPick,
            onCancelCanvasSelect: handleCancelCanvasSelect,
        },
        storyboard: {
            onStoryboardSaved: handleStoryboardFieldsSaved,
            storyboardAutoAdvanceEnabled: autoAdvanceStoryboardIssues,
        },
        misc: {
            onDragStart: handleDragStart,
            onDragEnd: handleDragEnd,
            onConnectFlow: handleConnectFlow,
            onCanvasMouseMove: handleCanvasMouseMove,
            spatialIndex,
            resolvedImageSrcMap: runtimeImageRenderSrcs,
            onRenderMetricsChange: benchmarkMode ? handleRenderMetricsChange : undefined,
            minimapRightOffset: rightWorkbenchOffset,
            canvasTheme: workbenchSettings.canvasTheme,
        },
    };

    // 显示加载状态
    if (isLoading) {
        return (
            <div className="canvas-loading-shell flex h-screen w-full items-center justify-center">
                <div className="text-center">
                    <div className="canvas-loading-spinner mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4"></div>
                    <p className="canvas-loading-title font-medium">加载画布中...</p>
                    <p className="canvas-loading-caption mt-2 text-sm">正在从云端获取数据</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="canvas-page-shell relative h-screen w-full overflow-hidden"
            data-testid="canvas-page"
            data-project-id={currentProjectId || ''}
        >
            <CanvasHeader
                title={title}
                isLoading={isLoading}
                isSignedIn={!!user}
                saveStatus={saveStatus}
                elementCount={elements.length}
                selectionCount={selectedIds.length}
                historyCount={historySummary.patchCount}
                referenceCount={projectReferenceItems.length}
                showLayers={showLayers}
                showHistory={showHistory}
                showMedia={showMedia}
                showReferences={showReferences}
                showChat={showChat}
                autoSaveGenerated={workbenchSettings.autoSaveGenerated}
                onTitleChange={handleTitleChange}
                onToggleLayers={toggleLayers}
                onToggleHistory={toggleHistory}
                onToggleMedia={toggleMedia}
                onToggleReferences={toggleReferences}
                onToggleChat={toggleChat}
                onOpenCommandPalette={() => setShowCommandPalette(true)}
                onOpenShortcutHelp={() => setShowShortcutHelp(true)}
                onToggleAutoSaveGenerated={() => void handleToggleAutoSaveGenerated()}
            />

            <CanvasCommandPalette
                visible={showCommandPalette}
                actions={commandActions}
                onClose={() => setShowCommandPalette(false)}
            />

            <CanvasShortcutHelp
                visible={showShortcutHelp}
                sections={shortcutSections}
                onClose={() => setShowShortcutHelp(false)}
            />

            {/* AI Designer Panel */}
            {showChat && (
                <div className={`absolute z-40 animate-in duration-300 ${
                    chatPanelMode === 'bottom'
                        ? `left-4 right-4 bottom-4 h-[350px] slide-in-from-bottom-4`
                        : `right-4 top-20 bottom-4 slide-in-from-right-4 ${
                            chatExpanded ? 'w-[700px]' : 'w-[400px]'
                        }`
                } transition-all`}>
                    <AiDesignerPanel
                        onClose={closeChat}
                        initialPrompt={initialPrompt}
                        selectedModel={selectedModel}
                        onModelChange={setSelectedModel}
                        isExpanded={chatExpanded}
                        onExpandToggle={toggleChatExpanded}
                        panelMode={chatPanelMode}
                        onPanelModeChange={setChatPanelMode}
                        marks={marks}
                        onDeleteMark={handleDeleteMark}
                        onClearAllMarks={handleClearAllMarks}
                        canvasImages={canvasImages}
                        onPickFromCanvas={handlePickFromCanvasForChat}
                        canvasPlanContextSummary={aiCanvasPlanContextSummary}
                        onApplyCanvasPlan={handleApplyAiCanvasPlan}
                    />
                </div>
            )}

            <CanvasSideDockPanels
                showLayers={showLayers}
                showHistory={showHistory}
                showMedia={showMedia}
                showReferences={showReferences}
                sideDockOffset={sideDockOffset}
                layersProps={{
                    elements,
                    selectedIds,
                    highlightedIds: highlightedLayerIds,
                    storyboardAuditFilter,
                    storyboardNavigationScope: autoAdvanceStoryboardScope,
                    storyboardAutoAdvanceEnabled: autoAdvanceStoryboardIssues,
                    onStoryboardAuditFilterChange: handleStoryboardAuditFilterChange,
                    onSelect: setSelectedIds,
                    onLocate: focusCanvasElement,
                    onRenameElement: handleElementChange,
                    onToggleHidden: handleToggleElementsHidden,
                    onToggleLocked: handleToggleElementsLocked,
                    onBringForward: handleBringForward,
                    onSendBackward: handleSendBackward,
                    onBringToFront: handleBringToFront,
                    onSendToBack: handleSendToBack,
                    onReorderLayer: handleReorderLayer,
                    onMoveLayerToParent: handleMoveLayerToParent,
                    onDeleteSelection: handleDeleteLayerSelection,
                    historySummary,
                    historyTimeline,
                    onClose: closeLayers,
                }}
                historyProps={{
                    summary: historySummary,
                    timeline: historyTimeline,
                    chunks: chunkPanelEntries,
                    residency: {
                        phase: chunkResidency.phase,
                        residentChunkCount: chunkResidency.residentChunkIds.length,
                        residentElementCount: chunkResidency.residentElementCount,
                        unloadedChunkCount: chunkResidency.unloadedChunkIds.length,
                        unloadedElementCount: chunkResidency.unloadedElementCount,
                        lastActivatedChunkLabel: chunkResidency.lastActivatedChunkLabel,
                        lastReleasedChunkLabel: chunkResidency.lastReleasedChunkLabel,
                    },
                    onTogglePinnedChunk: handleTogglePinnedChunk,
                    onLocateChunk: handleLocateChunk,
                    onClose: closeHistory,
                }}
                mediaProps={{
                    items: projectMediaItems,
                    referenceImages: projectReferenceItems.map((item) => item.image),
                    onClose: closeMedia,
                    onClearAll: handleClearProjectMediaHistory,
                    onSaveAsReference: saveProjectReferenceFromMediaItem,
                    onLocateSource: handleLocateProjectMediaSource,
                    onInsertItem: handleInsertProjectMediaItem,
                }}
                referenceProps={{
                    items: projectReferenceItems,
                    onClose: closeReferences,
                    onClearAll: handleClearProjectReferences,
                    onDeleteItem: handleDeleteProjectReferenceItem,
                    onDeleteItems: handleDeleteProjectReferenceItems,
                    onLocateSource: handleLocateProjectReferenceSource,
                    onInsertItem: handleInsertProjectReferenceItem,
                    onInsertItems: handleInsertProjectReferenceItems,
                }}
            />

            {benchmarkMode && (
                <CanvasBenchmarkPanel
                    rightOffset={benchmarkPanelRightOffset}
                    isBenchmarkRunning={isBenchmarkRunning}
                    renderMetrics={renderMetrics}
                    chunkStats={chunkStats}
                    chunkManifestLength={chunkManifest.length}
                    activeChunkSummary={activeChunkSummary}
                    pinnedChunkCount={pinnedChunkIds.length}
                    chunkResidency={chunkResidency}
                    chunkPreheat={chunkPreheat}
                    historySummary={historySummary}
                    historyTimeline={historyTimeline}
                    storageEstimate={storageEstimate}
                    benchmarkResults={benchmarkResults}
                    onClearResults={handleClearBenchmarkResults}
                    onRunBenchmark={(count, mode) => void runCanvasBenchmark(count, mode)}
                />
            )}

            <GenerationQueuePanel
                items={generationQueueItems}
                collapsed={isQueuePanelCollapsed}
                onToggleCollapsed={toggleQueuePanelCollapsed}
                onLocateItem={handleLocateGenerationQueueItem}
                onResumeItem={handleResumeGenerationItem}
            />

            {/* Main Editor Area */}
            <div className="absolute inset-0">
                <CanvasArea {...canvasAreaDomains} />
                <CanvasFloatingToolPanels
                    toolbarProps={{
                        activeTool,
                        onToolChange: setActiveTool,
                        onAddImage: handleAddImage,
                        onAddVideo: handleAddVideo,
                        onAddText: handleAddText,
                        onAddShape: handleAddShape,
                        onOpenImageGenerator: handleOpenImageGenerator,
                        onOpenVideoGenerator: handleOpenVideoGenerator,
                        onOpenStoryboardPlanner: handleOpenStoryboardPlanner,
                    }}
                    selectedGeneratorElement={selectedGeneratorElement}
                    selectedGeneratorPanelStyle={selectedGeneratorPanelStyle}
                    storyboardPlannerSourceElement={storyboardPlannerSourceElement}
                    storyboardPlannerPanelStyle={storyboardPlannerPanelStyle}
                    selectedModel={selectedModel}
                    projectReferenceItems={projectReferenceItems}
                    generatorPanelCanvasImages={generatorPanelCanvasImages}
                    selectedCanvasImageIds={selectedCanvasImageIds}
                    canvasElements={elements}
                    generatorSubmittingMap={generatorSubmittingMap}
                    projectMediaItems={projectMediaItems}
                    onUseProjectReferenceImage={handleUseProjectReferenceImage}
                    onRequestCanvasSelectImage={handleRequestCanvasSelectImage}
                    onRequestCanvasSelectVideo={handleRequestCanvasSelectVideo}
                    onElementChange={handleElementChange}
                    onGeneratorSubmittingChange={handleGeneratorSubmittingChange}
                    onCreateStoryboardDraft={handleCreateStoryboardDraft}
                    onGenerateImage={handleGenerateImage}
                    onRecoverImageTask={handleRecoverImageTask}
                    onAddGeneratedBatchImageElement={handleAddGeneratedBatchImageElement}
                    onGenerateVideo={handleGenerateVideo}
                    onRecoverVideoTask={handleRecoverVideoTask}
                    onRecordProjectMediaItem={recordProjectMediaItem}
                    onClearSelection={() => setSelectedIds([])}
                    onCloseStoryboardPlannerSource={() => setStoryboardPlannerSourceElementId(null)}
                    storyboardExportProps={{
                        isOpen: isStoryboardExportOpen,
                        selectedElements: selectedStoryboardExportElements,
                        isSubmitting: isStoryboardExportSubmitting,
                        submitStatusText: storyboardExportSubmitStatus,
                        onApplyToCanvas: handleStoryboardExportItemsChange,
                        onLocateItem: focusCanvasElement,
                        onCancelSubmit: () => cancelImageWorkerTask('分镜表导出'),
                        onClose: () => setIsStoryboardExportOpen(false),
                        onSubmit: (options, orderedItems) => void handleExportStoryboard(options, orderedItems),
                    }}
                    selectedAnnotateImageElement={selectedAnnotateImageElement}
                    selectedAnnotateImagePanelStyle={selectedAnnotateImagePanelStyle}
                    isAnnotateImageSubmitting={isAnnotateImageSubmitting}
                    annotateImageSubmitStatus={annotateImageSubmitStatus}
                    onCloseAnnotateImage={() => setAnnotateImageTargetId(null)}
                    onAnnotateImage={handleAnnotateImage}
                    selectedCropImageElement={selectedCropImageElement}
                    selectedCropImagePanelStyle={selectedCropImagePanelStyle}
                    isCropImageSubmitting={isCropImageSubmitting}
                    cropImageSubmitStatus={cropImageSubmitStatus}
                    onCloseCropImage={() => setCropImageTargetId(null)}
                    onCropImage={handleCropImage}
                    selectedSplitStoryboardElement={selectedSplitStoryboardElement}
                    selectedSplitStoryboardPanelStyle={selectedSplitStoryboardPanelStyle}
                    isSplitStoryboardSubmitting={isSplitStoryboardSubmitting}
                    splitStoryboardSubmitStatus={splitStoryboardSubmitStatus}
                    onCloseSplitStoryboard={() => setSplitStoryboardTargetId(null)}
                    onSplitStoryboard={handleSplitStoryboard}
                    onCancelImageWorkerTask={cancelImageWorkerTask}
                    zoomProps={{
                        scale,
                        onZoomIn: handleZoomIn,
                        onZoomOut: handleZoomOut,
                        onZoomTo: handleZoomTo,
                        onFitToScreen: handleFitToScreen,
                    }}
                />
            </div>

            <CanvasFeedbackOverlays
                shortcutFeedback={shortcutFeedback}
                transcodingStatus={transcodingStatus}
                toast={toast}
                onClearToast={clearToast}
            />
        </div>
    );
}

export default function LovartCanvas() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">加载画布中...</p>
                </div>
            </div>
        }>
            <LovartCanvasContent />
        </Suspense>
    );
}

function buildCanvasChunkStructureSignature(elements: CanvasElement[]) {
    return elements
        .map((element) => [
            element.id,
            element.type ?? '',
            element.parentFrameId ?? '',
            element.frameName ?? '',
            element.groupFrame ? '1' : '0',
        ].join('\u0001'))
        .join('\u0002');
}

const CHUNK_REFERENCE_CACHE_LIMIT = 80;
const chunkSummaryReferenceCache = new Map<string, { manifest: CanvasChunkManifestEntry[]; stats: CanvasChunkStats }>();
const activeChunkIdsReferenceCache = new Map<string, string[]>();

function rememberReference<TKey, TValue>(cache: Map<TKey, TValue>, key: TKey, value: TValue) {
    if (!cache.has(key) && cache.size >= CHUNK_REFERENCE_CACHE_LIMIT) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
            cache.delete(oldestKey);
        }
    }

    cache.set(key, value);
    return value;
}