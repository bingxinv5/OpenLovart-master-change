"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { useUser } from '@/lib/mock-clerk';
import { debugLog } from '@/lib/debug-log';
import { useSearchParams } from 'next/navigation';
import { FloatingToolbar } from '@/components/lovart/FloatingToolbar';
import { CanvasArea } from '@/components/lovart/CanvasArea';
import { AnnotateImagePanel } from '@/components/lovart/AnnotateImagePanel';
import { CropImagePanel } from '@/components/lovart/CropImagePanel';
import { ImageGeneratorPanel } from '@/components/lovart/ImageGeneratorPanel';
import { VideoGeneratorPanel } from '@/components/lovart/VideoGeneratorPanel';
import { SplitStoryboardPanel } from '@/components/lovart/SplitStoryboardPanel';
import { StoryboardExportPanel } from '@/components/lovart/StoryboardExportPanel';
import { StoryboardPlannerPanel } from '@/components/lovart/StoryboardPlannerPanel';
import { AiDesignerPanel } from '@/components/lovart/AiDesignerPanel';
import { CanvasCommandPalette, type CanvasCommandAction } from '@/components/lovart/CanvasCommandPalette';
import { CanvasHistorySidebar } from '@/components/lovart/CanvasHistorySidebar';
import { CanvasShortcutHelp, type CanvasShortcutSection } from '@/components/lovart/CanvasShortcutHelp';
import { LayersPanel } from '@/components/lovart/LayersPanel';
import { ProjectMediaPanel } from '@/components/lovart/ProjectMediaPanel';
import { ProjectReferencePanel } from '@/components/lovart/ProjectReferencePanel';
import { GenerationQueuePanel, type GenerationQueueItem } from '@/components/lovart/GenerationQueuePanel';
import { hasCurrentCanvasLegacyMigration, markCanvasLegacyMigrationApplied, type CanvasElement } from '@/components/lovart/canvas-types';
import { useLocalDb } from '@/hooks/useLocalDb';
import { elementStore, isImageRef, getImageBlob, getImageDataUrl, cleanupUnusedImages } from '@/lib/editor-kernel';
import { useCanvasFeedback } from './canvas-feedback';
import { CanvasBenchmarkPanel } from './CanvasBenchmarkPanel';
import { CanvasHeader } from './CanvasHeader';
import { ZoomControl } from './ZoomControl';
import { buildAiCanvasSelectionSummary, parseAiCanvasPlanActions } from './ai-canvas-plan';
import { buildCanvasAreaDomains } from './buildCanvasAreaDomains';
import { areChunkResidencyStatesEqual } from './canvas-compare-utils';
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
import { persistSubmission, clearSubmission } from './generation-persistence';
import { saveViewportState } from './viewport-persistence';
import {
    buildCanvasChunkManifest,
    type CanvasChunkManifestEntry,
    type CanvasChunkStats,
} from './project-storage';
import { collectRetainedLocalImageRefs } from '@/lib/local-image-ref-usage';
import { DEFAULT_WORKBENCH_SETTINGS, getWorkbenchSettings, hasDirectoryPickerSupport, requestAutoSaveDirectoryHandle, requestPersistentStorage, saveBlobToAutoSaveDirectory, saveWorkbenchSettings, subscribeWorkbenchSettingsChange, type StorageEstimateInfo, type WorkbenchSettings, getStorageEstimateInfo } from '@/lib/workbench-settings';
import { v4 as uuidv4 } from 'uuid';
import {
    BACKGROUND_IMAGE_FIX_CONCURRENCY,
    BACKGROUND_IMAGE_FIX_BATCH_SIZE,
    STORAGE_WARN_THRESHOLD,
    STORAGE_CRITICAL_THRESHOLD,
    CHUNK_RELEASE_GRACE_MS,
    loadPinnedChunkIds,
    persistPinnedChunkIds,
    resolveElementChunkId,
    mapWithConcurrency,
    triggerBrowserDownload,
    saveBlobToLocalFile,
    dataUrlToBlob,
    formatBytes,
    convertImageBlobToRasterBlob,
    buildSvgExportBlob,
    makeGeneratedFilename,
    collectImageRefsFromElements,
    getDefaultImagePresentation,
    getViewportBounds,
    getElementViewportPriority,
    cloneCanvasElement,
    sanitizeFilenameStem,
    getElementBaseName,
    type ChunkPreheatState,
    type ActiveChunkSummary,
    type ChunkResidencyState,
    type ElementExportFormat,
} from './canvas-page-utils';
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
import { appendProjectMediaHistory, readProjectMediaHistory, replaceProjectMediaHistory, subscribeProjectMediaHistory, type ProjectMediaHistoryItem } from '@/lib/project-media-history';
import { readProjectReferenceLibrary, subscribeProjectReferenceLibrary, type ProjectReferenceImageItem } from '@/lib/project-reference-library';

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
    const [workbenchSettings, setWorkbenchSettings] = useState<WorkbenchSettings>(DEFAULT_WORKBENCH_SETTINGS);
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
        historyChangedIdsRef,
        historyManagerRef,
        historyTransactionRef,
        runHistoryTransaction,
        beginHistoryTransaction,
        commitHistoryTransaction,
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
    const [projectMediaItems, setProjectMediaItems] = useState<ProjectMediaHistoryItem[]>([]);
    const [projectReferenceItems, setProjectReferenceItems] = useState<ProjectReferenceImageItem[]>([]);
    const clipboardRef = useRef<CanvasElement[]>([]); // internal clipboard for Ctrl+C/V
    const canvasClipboardPreferredRef = useRef(false);
    const pinnedChunkProjectIdRef = useRef<string | null>(projectId);
    const storageWarnedRef = useRef(false);

    const markCanvasClipboardPreferred = useCallback(() => {
        canvasClipboardPreferredRef.current = true;
    }, []);

    useEffect(() => {
        const handleWindowBlur = () => {
            canvasClipboardPreferredRef.current = false;
        };

        window.addEventListener('blur', handleWindowBlur);
        return () => window.removeEventListener('blur', handleWindowBlur);
    }, []);

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
        setProjectMediaItems(readProjectMediaHistory(currentProjectId));
        return subscribeProjectMediaHistory(currentProjectId, () => {
            setProjectMediaItems(readProjectMediaHistory(currentProjectId));
        });
    }, [currentProjectId]);

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
    }, [currentProjectId, elementsVersion, projectMediaItems]);

    useEffect(() => {
        setProjectReferenceItems(readProjectReferenceLibrary(currentProjectId));
        return subscribeProjectReferenceLibrary(currentProjectId, () => {
            setProjectReferenceItems(readProjectReferenceLibrary(currentProjectId));
        });
    }, [currentProjectId]);

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
        setAutoAdvanceStoryboardIssues,
        autoAdvanceStoryboardScope,
        setAutoAdvanceStoryboardScope,
        storyboardAuditFilter,
        setStoryboardAuditFilter,
        storyboardOverviewCollapsed,
        setStoryboardOverviewCollapsed,
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

    // cloneCanvasElement — now imported from canvas-page-utils
    const chunkSummary = useMemo(() => buildCanvasChunkManifest(elements), [elements]);
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

    useEffect(() => {
        setPinnedChunkIds((prev) => prev.filter((chunkId) => validChunkIdSet.has(chunkId)));
    }, [validChunkIdSet]);

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
        persistPinnedChunkIds(currentProjectId, pinnedChunkIds);
    }, [currentProjectId, pinnedChunkIds]);

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
            pinnedChunkIds,
            validChunkIdSet,
            pan,
            scale,
            viewportSize: viewport,
        });
    }, [chunkManifest, elementById, elementChunkIdById, elements, hasRootChunk, highlightedLayerIds, highlightedResultId, pan, pinnedChunkIds, scale, selectedIds, validChunkIdSet]);

    const chunkReleaseTimerRef = useRef<number | null>(null);
    useEffect(() => {
        if (chunkReleaseTimerRef.current !== null) {
            window.clearTimeout(chunkReleaseTimerRef.current);
            chunkReleaseTimerRef.current = null;
        }

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

        const targetChunkIds = activeChunkSummary.activeChunkIds;
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

        return () => {
            if (chunkReleaseTimerRef.current !== null) {
                window.clearTimeout(chunkReleaseTimerRef.current);
                chunkReleaseTimerRef.current = null;
            }
        };
    }, [activeChunkSummary.activeChunkIds, buildChunkResidencyState, chunkManifest.length, chunkMetaById, elements.length]);

    const canvasRuntimeElements = useMemo(() => {
        return buildCanvasRuntimeElements(
            elements,
            chunkManifest.length,
            chunkResidency.residentChunkIds,
            activeChunkSummary.activeChunkIds,
            elementChunkIdById,
        );
    }, [activeChunkSummary.activeChunkIds, chunkManifest.length, chunkResidency.residentChunkIds, elementChunkIdById, elements]);

    const chunkPanelEntries = useMemo(() => {
        return buildChunkPanelEntries(
            chunkManifest,
            activeChunkSummary.activeChunkIds,
            chunkResidency.residentChunkIds,
            pinnedChunkIds,
        );
    }, [activeChunkSummary.activeChunkIds, chunkManifest, chunkResidency.residentChunkIds, pinnedChunkIds]);

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
    }, []);

    useEffect(() => {
        setWorkbenchSettings(getWorkbenchSettings());
        void requestPersistentStorage();
    }, []);

    useEffect(() => {
        return subscribeWorkbenchSettingsChange(() => {
            setWorkbenchSettings(getWorkbenchSettings());
        });
    }, []);

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
        void refreshStorageEstimate();
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

    const syncImageStoreCleanup = useCallback(async (currentElements: CanvasElement[]) => {
        try {
            const persistedRefs = await elementStore.collectAllImageRefs();
            const liveRefs = new Set<string>([
                ...persistedRefs,
                ...collectImageRefsFromElements(currentElements),
                ...collectRetainedLocalImageRefs(),
            ]);
            const removedCount = await cleanupUnusedImages(liveRefs);
            if (removedCount > 0) {
                debugLog(`[ImageStore] Cleaned ${removedCount} orphaned images`);
            }
            await refreshStorageEstimate();
        } catch (error) {
            console.warn('[ImageStore] Cleanup skipped:', error);
        }
    }, [refreshStorageEstimate]);

    const normalizeLoadedImageElements = useCallback(async (
        loadedElements: CanvasElement[],
        options?: {
            onProgress?: (elements: CanvasElement[], normalizedIds: string[]) => void;
        },
    ) => {
        const normalizedIds: string[] = [];

        const viewport = getViewportBounds(scale, pan);
        const prioritizedElements = loadedElements
            .map((element, index) => ({
                element,
                index,
                priority: element.type === 'image' ? getElementViewportPriority(element, viewport) : Number.MAX_SAFE_INTEGER,
            }))
            .sort((a, b) => a.priority - b.priority);

        const normalizedElements = [...loadedElements];

        for (let start = 0; start < prioritizedElements.length; start += BACKGROUND_IMAGE_FIX_BATCH_SIZE) {
            const batch = prioritizedElements.slice(start, start + BACKGROUND_IMAGE_FIX_BATCH_SIZE);
            const batchNormalizedIds: string[] = [];

            const batchResults = await mapWithConcurrency(batch, BACKGROUND_IMAGE_FIX_CONCURRENCY, async ({ element, index }) => {
            if (element.type !== 'image' || !element.content) {
                return { index, element, changed: false };
            }

            const originalContent = element.content;
            const hasCurrentLegacyMigration = hasCurrentCanvasLegacyMigration(element);
            let loadBlob: Blob | null = null;
            const isRemoteUrl = originalContent.startsWith('http://') || originalContent.startsWith('https://');
            if (isRemoteUrl) {
                loadBlob = await fetchRemoteBlob(originalContent, 'lovart-load-image');
            }
            const localizedContent = isRemoteUrl
                ? await normalizeGeneratedImageContent(originalContent, 'load-localize', loadBlob)
                : originalContent;

            const nextElement: CanvasElement = {
                ...element,
                content: localizedContent,
                imageFit: element.imageFit || workbenchSettings.defaultImageFit,
                imageSurface: element.imageSurface || workbenchSettings.defaultImageSurface,
            };

            const isLegacyPresentation = !hasCurrentLegacyMigration && (!element.imageFit || !element.imageSurface);
            const shouldMeasure = isLegacyPresentation;
            const hasLocalizedContent = localizedContent !== originalContent;

            if (!shouldMeasure) {
                const changed = hasLocalizedContent || nextElement.imageFit !== element.imageFit || nextElement.imageSurface !== element.imageSurface;
                if (changed) {
                    normalizedIds.push(element.id);
                    batchNormalizedIds.push(element.id);
                }
                return { index, element: changed ? markCanvasLegacyMigrationApplied(nextElement) : nextElement, changed };
            }

            const metrics = await resolveImageDisplayMetrics(localizedContent, 'load-legacy', {
                maxWidth: element.width || 400,
                maxHeight: element.height || 400,
                anchor: {
                    x: element.x,
                    y: element.y,
                    width: element.width || 400,
                    height: element.height || 400,
                },
            }, loadBlob);

            if (!metrics) {
                const changed = hasLocalizedContent || nextElement.imageFit !== element.imageFit || nextElement.imageSurface !== element.imageSurface;
                if (changed) {
                    normalizedIds.push(element.id);
                    batchNormalizedIds.push(element.id);
                }
                return { index, element: changed ? markCanvasLegacyMigrationApplied(nextElement) : nextElement, changed };
            }

            const hasVisualChange =
                nextElement.width !== metrics.width ||
                nextElement.height !== metrics.height ||
                nextElement.x !== metrics.x ||
                nextElement.y !== metrics.y ||
                hasLocalizedContent ||
                nextElement.imageFit !== element.imageFit ||
                nextElement.imageSurface !== element.imageSurface;

            if (hasVisualChange) {
                normalizedIds.push(element.id);
                batchNormalizedIds.push(element.id);
            }

            const normalizedElement: CanvasElement = {
                    ...nextElement,
                    width: metrics.width,
                    height: metrics.height,
                    x: metrics.x ?? nextElement.x,
                    y: metrics.y ?? nextElement.y,
                };

            return {
                index,
                changed: hasVisualChange,
                element: hasVisualChange ? markCanvasLegacyMigrationApplied(normalizedElement) : normalizedElement,
            };
            });

            for (const result of batchResults) {
                normalizedElements[result.index] = result.element;
            }

            if (batchNormalizedIds.length > 0) {
                options?.onProgress?.([...normalizedElements], batchNormalizedIds);
            }

            if (start + BACKGROUND_IMAGE_FIX_BATCH_SIZE < prioritizedElements.length) {
                await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
            }
        }

        return {
            elements: normalizedElements,
            normalizedIds,
        };
    }, [normalizeGeneratedImageContent, pan, resolveImageDisplayMetrics, scale, workbenchSettings.defaultImageFit, workbenchSettings.defaultImageSurface]);

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
        if (isInitializedRef.current) {
            setIsCanvasReadyForHistory(true);
        }
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
    }, [canvasRuntimeElements, isDraggingElement]);

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
    }, [activeTool]);

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

    type DuplicateSelectionResult = {
        copies: CanvasElement[];
        sourceToCopyId: Record<string, string>;
    };

    const duplicateElementsByIds = useCallback((ids: string[], anchor?: { x: number; y: number }): DuplicateSelectionResult => {
        const sourceElements = elements.filter(el => ids.includes(el.id));
        if (sourceElements.length === 0) {
            return {
                copies: [],
                sourceToCopyId: {},
            };
        }

        const minX = Math.min(...sourceElements.map(el => el.x));
        const minY = Math.min(...sourceElements.map(el => el.y));
        const targetX = anchor?.x ?? minX + 30;
        const targetY = anchor?.y ?? minY + 30;
        const offsetX = targetX - minX;
        const offsetY = targetY - minY;
        const sourceToCopyId: Record<string, string> = {};

        const copies = sourceElements.map(el => ({
            ...cloneCanvasElement(el),
            id: (() => {
                const nextId = uuidv4();
                sourceToCopyId[el.id] = nextId;
                return nextId;
            })(),
            x: el.x + offsetX,
            y: el.y + offsetY,
        }));

        addElements(copies);
        setSelectedIds(copies.map(copy => copy.id));
        return {
            copies,
            sourceToCopyId,
        };
    }, [addElements, elements]);

    const handleCopySelection = useCallback((ids: string[]) => {
        const expandedIds = collectSelectionWithFrameChildren(ids);
        clipboardRef.current = elements
            .filter(el => expandedIds.includes(el.id))
            .map(cloneCanvasElement);
        markCanvasClipboardPreferred();
        showToast(`已复制 ${expandedIds.length} 个元素`, 'success');
    }, [collectSelectionWithFrameChildren, elements, markCanvasClipboardPreferred, showToast]);

    const handleCutSelection = useCallback((ids: string[]) => {
        const expandedIds = collectSelectionWithFrameChildren(ids);
        clipboardRef.current = elements
            .filter(el => expandedIds.includes(el.id))
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
            return;
        }

        const minX = Math.min(...clipboardRef.current.map(el => el.x));
        const minY = Math.min(...clipboardRef.current.map(el => el.y));
        const offsetX = position.x - minX;
        const offsetY = position.y - minY;

        const copies = clipboardRef.current.map(el => ({
            ...cloneCanvasElement(el),
            id: uuidv4(),
            x: el.x + offsetX,
            y: el.y + offsetY,
        }));

        runHistoryTransaction({ label: '粘贴元素', source: 'clipboard-paste' }, () => {
            addElements(copies);
            setSelectedIds(copies.map(copy => copy.id));
            clipboardRef.current = copies.map(cloneCanvasElement);
            markCanvasClipboardPreferred();
            showToast(`已粘贴 ${copies.length} 个元素`, 'success');
            return { selectionAfter: copies.map(copy => copy.id) };
        });
    }, [addElements, markCanvasClipboardPreferred, runHistoryTransaction, showToast]);

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
            return { selectionAfter: duplicateResult.copies.map(copy => copy.id) };
        });

        return duplicateResult;
    }, [duplicateElementsByIds, runHistoryTransaction, showToast]);

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

    // sanitizeToolName, sanitizeFilenameStem, getElementBaseName, buildToolResultNames,
    // resolveToolResultNaming — now imported from canvas-page-utils

    const focusNewElement = useCallback((elementId: string) => {
        setSelectedIds([elementId]);
        setActiveTool('select');
    }, []);

    const addAndFocusElement = useCallback((element: CanvasElement) => {
        addElement(element);
        focusNewElement(element.id);
    }, [addElement, focusNewElement]);

    const addAndSelectElement = useCallback((element: CanvasElement) => {
        addElement(element);
        setSelectedIds([element.id]);
    }, [addElement]);

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
    }, [addAndSelectElement, addElements, buildAutoGroupFrame, selectSingleElement]);

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

    const handleApplyAiCanvasPlan = useCallback(async (rawPlan: unknown) => {
        const actions = parseAiCanvasPlanActions(rawPlan);
        if (actions.length === 0) {
            return { summary: '未检测到可执行的画布动作。' };
        }

        const initialSelectedIds = [...selectedIdsRef.current];
        const initialSelectedElements = initialSelectedIds
            .map((id) => elementsMapRef.current.get(id))
            .filter((element): element is CanvasElement => !!element);
        const selectionImageContents = Array.from(new Set(
            initialSelectedElements
                .filter((element) => element.type === 'image' && !!element.content)
                .map((element) => element.content as string),
        ));
        const groupableSelectionCount = initialSelectedElements.filter((element) => element.type !== 'connector').length;

        const basePlacement = (() => {
            if (initialSelectedElements.length === 0) {
                return getPlacementPosition();
            }

            const minX = Math.min(...initialSelectedElements.map((element) => element.x));
            const maxX = Math.max(...initialSelectedElements.map((element) => element.x + (element.width || 0)));
            const maxY = Math.max(...initialSelectedElements.map((element) => element.y + (element.height || 0)));
            return {
                x: Math.round((minX + maxX) / 2),
                y: Math.round(maxY + 120),
            };
        })();

        let placementOffsetIndex = 0;
        const nextPlacementCenter = () => {
            const offsetIndex = placementOffsetIndex;
            placementOffsetIndex += 1;
            return {
                x: basePlacement.x + offsetIndex * 32,
                y: basePlacement.y + offsetIndex * 40,
            };
        };

        const executed: string[] = [];
        const skipped: string[] = [];

        for (const action of actions) {
            switch (action.type) {
                case 'create-image-generator': {
                    const center = nextPlacementCenter();
                    const imageGenerator = buildGeneratorElement('image-generator', {
                        ...buildCenteredElementBounds(center, 400, 400),
                        displayName: action.title,
                        savedPrompt: action.prompt,
                        savedReferenceImages: action.useSelectionAsReferences && selectionImageContents.length > 0
                            ? JSON.stringify(selectionImageContents)
                            : undefined,
                    });

                    runHistoryTransaction({ label: 'AI 创建图像生成器', source: 'ai-canvas-plan' }, () => {
                        addAndSelectElement(imageGenerator);
                        return { selectionAfter: [imageGenerator.id] };
                    });

                    executed.push(action.useSelectionAsReferences && selectionImageContents.length > 0
                        ? '创建图像生成器并绑定当前选中图片'
                        : '创建图像生成器');
                    break;
                }
                case 'create-video-generator': {
                    const center = nextPlacementCenter();
                    const selectedFrameImages = action.useSelectionAsReferences && selectionImageContents.length > 0
                        ? JSON.stringify(selectionImageContents.slice(0, 2))
                        : undefined;
                    const videoGenerator = buildGeneratorElement('video-generator', {
                        ...buildCenteredElementBounds(center, 400, 300),
                        displayName: action.title,
                        savedPrompt: action.prompt,
                        savedFrameImages: selectedFrameImages,
                    });

                    runHistoryTransaction({ label: 'AI 创建视频生成器', source: 'ai-canvas-plan' }, () => {
                        addAndSelectElement(videoGenerator);
                        return { selectionAfter: [videoGenerator.id] };
                    });

                    executed.push(selectedFrameImages
                        ? '创建视频生成器并绑定当前选中图片'
                        : '创建视频生成器');
                    break;
                }
                case 'create-text-note': {
                    const center = nextPlacementCenter();
                    const textNote: CanvasElement = {
                        id: uuidv4(),
                        type: 'text',
                        x: center.x - 120,
                        y: center.y - 24,
                        content: action.text,
                    };

                    runHistoryTransaction({ label: 'AI 创建文本说明', source: 'ai-canvas-plan' }, () => {
                        addAndSelectElement(textNote);
                        return { selectionAfter: [textNote.id] };
                    });

                    executed.push('创建文本说明');
                    break;
                }
                case 'frame-selection': {
                    if (groupableSelectionCount < 2) {
                        skipped.push('当前选区不足两个元素，无法创建编组');
                        break;
                    }

                    handleGroupSelection(initialSelectedIds);
                    executed.push('将当前选区编组为画板');
                    break;
                }
                case 'save-selection-as-reference': {
                    if (!currentProjectIdRef.current) {
                        skipped.push('当前项目尚未保存，无法写入项目参考库');
                        break;
                    }

                    if (selectionImageContents.length === 0) {
                        skipped.push('当前选区没有可加入参考库的图片');
                        break;
                    }

                    saveProjectReferenceFromSelection(initialSelectedIds);
                    executed.push('将当前选中图片加入项目参考库');
                    break;
                }
            }
        }

        if (executed.length === 0 && skipped.length === 0) {
            return { summary: '未执行任何画布动作。' };
        }

        const summaryParts: string[] = [];
        if (executed.length > 0) {
            summaryParts.push(`已执行 ${executed.length} 项画布操作：${executed.join('、')}。`);
        }
        if (skipped.length > 0) {
            summaryParts.push(`未执行：${skipped.join('；')}。`);
        }

        return { summary: summaryParts.join('\n') };
    }, [addAndSelectElement, buildGeneratorElement, getPlacementPosition, handleGroupSelection, runHistoryTransaction, saveProjectReferenceFromSelection]);

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
    openImageGeneratorRef.current = handleOpenImageGenerator;

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

    const shortcutSections = useMemo<CanvasShortcutSection[]>(() => [
        {
            title: '工作台',
            items: [
                { keys: 'Ctrl+K', label: '打开命令面板' },
                { keys: '?', label: '打开快捷键总览' },
                { keys: 'Ctrl+S', label: '保存项目' },
                { keys: 'Shift+1', label: '适应屏幕' },
            ],
        },
        {
            title: '工具',
            items: [
                { keys: 'V', label: '选择工具' },
                { keys: 'H', label: '拖动画布' },
                { keys: 'M', label: '标记工具' },
                { keys: 'F', label: '智能画板' },
                { keys: 'B', label: '自由绘制' },
                { keys: 'T', label: '插入文本' },
                { keys: 'A', label: '图像生成器' },
            ],
        },
        {
            title: '编辑',
            items: [
                { keys: 'Ctrl+Z', label: '撤销' },
                { keys: 'Ctrl+Shift+Z', label: '重做' },
                { keys: 'Ctrl+D', label: '复制所选元素' },
                { keys: 'Ctrl+C / Ctrl+V', label: '复制与粘贴' },
                { keys: 'Delete', label: '删除所选元素' },
            ],
        },
        {
            title: '视图',
            items: [
                { keys: 'Ctrl++', label: '放大' },
                { keys: 'Ctrl+-', label: '缩小' },
                { keys: 'Ctrl+0', label: '重置缩放' },
                { keys: 'Ctrl+A', label: '全选画布元素' },
            ],
        },
    ], []);

    const commandActions = useMemo<CanvasCommandAction[]>(() => [
        {
            id: 'save-project',
            label: '保存当前项目',
            description: '立即将标题、元素和本地缓存状态落盘。',
            shortcut: 'Ctrl+S',
            section: '工作台',
            keywords: ['保存', 'save', 'project'],
            perform: () => { void saveProject(); },
        },
        {
            id: 'open-layers',
            label: showLayers ? '关闭图层面板' : '打开图层面板',
            description: '查看图层结构、批量改名和分镜字段。',
            section: '面板',
            keywords: ['图层', 'layers', '侧栏'],
            active: showLayers,
            perform: toggleLayers,
        },
        {
            id: 'open-history',
            label: showHistory ? '关闭历史侧栏' : '打开历史侧栏',
            description: '查看撤销时间线、运行态分块和固定激活区。',
            section: '面板',
            keywords: ['历史', 'undo', 'redo'],
            active: showHistory,
            perform: toggleHistory,
        },
        {
            id: 'open-media',
            label: showMedia ? '关闭媒体历史' : '打开媒体历史',
            description: '查看当前项目沉淀的图片与视频结果，并快速回流到画布。',
            section: '面板',
            keywords: ['media', 'history', 'library', '媒体', '素材'],
            active: showMedia,
            perform: toggleMedia,
        },
        {
            id: 'open-chat',
            label: showChat ? '关闭 AI 工作台' : '打开 AI 工作台',
            description: '在侧栏或底部与 AI 设计助手联动。',
            section: '面板',
            keywords: ['chat', 'ai', 'sparkles', '对话'],
            active: showChat,
            perform: toggleChat,
        },
        {
            id: 'fit-to-screen',
            label: '适应屏幕',
            description: '根据当前画布内容重置视图，回到舒适查看区。',
            shortcut: 'Shift+1',
            section: '视图',
            keywords: ['fit', 'screen', '适应'],
            perform: handleFitToScreen,
        },
        {
            id: 'zoom-in',
            label: '放大画布',
            description: '提升当前视图缩放比例。',
            shortcut: 'Ctrl++',
            section: '视图',
            keywords: ['zoom', '放大'],
            perform: handleZoomIn,
        },
        {
            id: 'zoom-out',
            label: '缩小画布',
            description: '降低当前视图缩放比例。',
            shortcut: 'Ctrl+-',
            section: '视图',
            keywords: ['zoom', '缩小'],
            perform: handleZoomOut,
        },
        {
            id: 'undo',
            label: '撤销上一步',
            description: historySummary.canUndo ? `最近动作：${historySummary.lastAction}` : '当前没有可撤销记录。',
            shortcut: 'Ctrl+Z',
            section: '编辑',
            keywords: ['undo', '撤销'],
            active: historySummary.canUndo,
            perform: undo,
        },
        {
            id: 'redo',
            label: '重做下一步',
            description: historySummary.canRedo ? '恢复刚刚撤销的动作。' : '当前已经是最新状态。',
            shortcut: 'Ctrl+Shift+Z',
            section: '编辑',
            keywords: ['redo', '重做'],
            active: historySummary.canRedo,
            perform: redo,
        },
        {
            id: 'set-select-tool',
            label: '切换到选择工具',
            description: '恢复常规选取与拖拽编辑。',
            shortcut: 'V',
            section: '工具',
            keywords: ['select', '选择'],
            active: activeTool === 'select',
            perform: () => setActiveTool('select'),
        },
        {
            id: 'set-hand-tool',
            label: '切换到拖动工具',
            description: '快速平移大画布。',
            shortcut: 'H',
            section: '工具',
            keywords: ['hand', 'pan', '拖动'],
            active: activeTool === 'hand',
            perform: () => setActiveTool('hand'),
        },
        {
            id: 'set-mark-tool',
            label: '切换到标记工具',
            description: '在画布上快速布点和标记。',
            shortcut: 'M',
            section: '工具',
            keywords: ['mark', '标记'],
            active: activeTool === 'mark',
            perform: () => setActiveTool('mark'),
        },
        {
            id: 'set-frame-tool',
            label: '切换到智能画板工具',
            description: '创建或布局新的画板容器。',
            shortcut: 'F',
            section: '工具',
            keywords: ['frame', '画板'],
            active: activeTool === 'frame',
            perform: () => setActiveTool('frame'),
        },
        {
            id: 'set-draw-tool',
            label: '切换到画笔工具',
            description: '进入自由绘制模式。',
            shortcut: 'B',
            section: '工具',
            keywords: ['draw', '画笔'],
            active: activeTool === 'draw',
            perform: () => setActiveTool('draw'),
        },
        {
            id: 'add-text',
            label: '插入文本',
            description: '在当前视图中心附近添加一个文本元素。',
            shortcut: 'T',
            section: '内容',
            keywords: ['text', '文本'],
            perform: handleAddText,
        },
        {
            id: 'open-image-generator',
            label: '打开图像生成器',
            description: '在画布中心生成一个新的图片生成器面板。',
            shortcut: 'A',
            section: '生成',
            keywords: ['image generator', '生成器', '图片'],
            perform: handleOpenImageGenerator,
        },
        {
            id: 'open-video-generator',
            label: '打开视频生成器',
            description: '在画布中心生成一个新的视频生成器面板。',
            section: '生成',
            keywords: ['video generator', '视频'],
            perform: handleOpenVideoGenerator,
        },
        {
            id: 'open-storyboard-planner',
            label: '打开分镜规划器',
            description: '用多参考图生成结构化分镜草稿，并导入画布。',
            section: '生成',
            keywords: ['storyboard', 'planner', '分镜', '规划'],
            perform: handleOpenStoryboardPlanner,
        },
    ], [
        activeTool,
        handleAddText,
        handleFitToScreen,
        handleOpenImageGenerator,
        handleOpenStoryboardPlanner,
        handleOpenVideoGenerator,
        handleZoomIn,
        handleZoomOut,
        historySummary.canRedo,
        historySummary.canUndo,
        historySummary.lastAction,
        redo,
        saveProject,
        showChat,
        showHistory,
        showLayers,
        showMedia,
        toggleChat,
        toggleHistory,
        toggleMedia,
        toggleLayers,
        undo,
    ]);

    const handleConnectFlow = useCallback((sourceElement: CanvasElement) => {
        const persistedSourceElement = elementsMapRef.current.get(sourceElement.id);
        const latestSourceElement = persistedSourceElement
            ? { ...persistedSourceElement, ...sourceElement }
            : sourceElement;
        if (!latestSourceElement.content) return;

        const spacing = 120;
        const groupId = uuidv4();
        const connectorId = uuidv4();
        const generatorId = uuidv4();
        const hasLinkedFlowConnector = latestSourceElement.linkedElements?.some((linkedId) => elementsMapRef.current.get(linkedId)?.type === 'connector') ?? false;
        const shouldInheritSavedReferences = !(latestSourceElement.type === 'image' && (latestSourceElement.referenceImageId || hasLinkedFlowConnector));

        const appendSerializedReferenceImages = (target: string[], serialized?: string) => {
            if (!serialized?.trim()) {
                return;
            }

            try {
                const parsed = JSON.parse(serialized);
                if (!Array.isArray(parsed)) {
                    return;
                }

                parsed.forEach((item) => {
                    if (typeof item === 'string' && item.trim() && !target.includes(item)) {
                        target.push(item);
                    }
                });
            } catch {
                // Ignore malformed legacy reference payloads.
            }
        };

        const inheritedReferenceImages = (() => {
            const nextImages = [latestSourceElement.content];
            if (latestSourceElement.type === 'image' && latestSourceElement.flowReferenceImages?.trim()) {
                appendSerializedReferenceImages(nextImages, latestSourceElement.flowReferenceImages);
            } else if (shouldInheritSavedReferences && latestSourceElement.savedReferenceImages?.trim()) {
                appendSerializedReferenceImages(nextImages, latestSourceElement.savedReferenceImages);
            }

            return nextImages.length > 0 ? JSON.stringify(nextImages) : undefined;
        })();

        // Create image generator element
        const generatorElement: CanvasElement = {
            ...buildGeneratorElement('image-generator', {
                x: latestSourceElement.x + (latestSourceElement.width || 400) + spacing,
                y: latestSourceElement.y,
                width: latestSourceElement.width || 400,
                height: latestSourceElement.height || 400,
                referenceImageId: latestSourceElement.id,
                savedPrompt: latestSourceElement.savedPrompt || '',
                savedReferenceImages: inheritedReferenceImages,
                groupId: groupId,
                linkedElements: [latestSourceElement.id, connectorId],
            }),
            id: generatorId,
        };

        // Create dashed connector line
        const connectorElement: CanvasElement = {
            id: connectorId,
            type: 'connector',
            x: 0,
            y: 0,
            connectorFrom: latestSourceElement.id,
            connectorTo: generatorId,
            connectorStyle: 'dashed',
            color: '#6B7280',
            strokeWidth: 2,
            groupId: groupId,
        };

        // Update source element with group info AND add new elements in one go
        setElements(prev => {
            const updatedPrev = prev.map(el => {
                if (el.id === sourceElement.id) {
                    return {
                        ...el,
                        groupId: groupId,
                        linkedElements: [connectorId, generatorId],
                    };
                }
                return el;
            });
            return [...updatedPrev, connectorElement, generatorElement];
        });
        dirtyTrackerRef.current.markModified(latestSourceElement.id);
        dirtyTrackerRef.current.markAdded(connectorId);
        dirtyTrackerRef.current.markAdded(generatorId);

        focusNewElement(generatorId);
    }, [setElements, focusNewElement, buildGeneratorElement]);

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
    }, [focusCanvasElement, setElements, showToast, submitStoryboardGeneratorElement, submitStoryboardVideoGeneratorElement]);

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
    }, [selectedIds, getPlacementPosition, announceCompletedResult, buildImageElement, finalizeGeneratedImageElement, replaceGeneratorWithPendingImage, addAndSelectElement]);

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
        () => buildGeneratorCanvasImages(canvasImages, elementsMapRef.current),
        [canvasImages],
    );

    const selectedCanvasImageIds = useMemo(
        () => buildSelectedCanvasImageIds(selectedIds, elementsMapRef.current),
        [selectedIds],
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

    const canvasAreaDomains = buildCanvasAreaDomains({
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
            canPaste: clipboardRef.current.length > 0,
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
            spatialIndex: spatialIndexRef.current,
            resolvedImageSrcMap: runtimeImageRenderSrcs,
            onRenderMetricsChange: benchmarkMode ? handleRenderMetricsChange : undefined,
            minimapRightOffset: rightWorkbenchOffset,
        },
    });

    // 显示加载状态
    if (isLoading) {
        return (
            <div className="h-screen w-full bg-[#f8f8fa] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">加载画布中...</p>
                    <p className="text-slate-400 text-sm mt-2">正在从云端获取数据</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="h-screen w-full bg-[#f8f8fa] relative overflow-hidden"
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

            {showLayers && (
                <div
                    className="absolute top-20 bottom-4 z-30 animate-in slide-in-from-right-4 duration-300"
                    style={{ right: `${sideDockOffset}px` }}
                >
                    <LayersPanel
                        elements={elements}
                        selectedIds={selectedIds}
                        highlightedIds={highlightedLayerIds}
                        storyboardAuditFilter={storyboardAuditFilter}
                        storyboardNavigationScope={autoAdvanceStoryboardScope}
                        storyboardAutoAdvanceEnabled={autoAdvanceStoryboardIssues}
                        onStoryboardAuditFilterChange={handleStoryboardAuditFilterChange}
                        onSelect={setSelectedIds}
                        onLocate={focusCanvasElement}
                        onRenameElement={handleElementChange}
                        onToggleHidden={handleToggleElementsHidden}
                        onToggleLocked={handleToggleElementsLocked}
                        onBringForward={handleBringForward}
                        onSendBackward={handleSendBackward}
                        onBringToFront={handleBringToFront}
                        onSendToBack={handleSendToBack}
                        onReorderLayer={handleReorderLayer}
                        onMoveLayerToParent={handleMoveLayerToParent}
                        onDeleteSelection={handleDeleteLayerSelection}
                        historySummary={historySummary}
                        historyTimeline={historyTimeline}
                        onClose={closeLayers}
                    />
                </div>
            )}

            {showHistory && (
                <div
                    className="absolute top-20 bottom-4 z-30 animate-in slide-in-from-right-4 duration-300"
                    style={{ right: `${sideDockOffset + (showLayers ? 328 : 0)}px` }}
                >
                    <CanvasHistorySidebar
                        summary={historySummary}
                        timeline={historyTimeline}
                        chunks={chunkPanelEntries}
                        residency={{
                            phase: chunkResidency.phase,
                            residentChunkCount: chunkResidency.residentChunkIds.length,
                            residentElementCount: chunkResidency.residentElementCount,
                            unloadedChunkCount: chunkResidency.unloadedChunkIds.length,
                            unloadedElementCount: chunkResidency.unloadedElementCount,
                            lastActivatedChunkLabel: chunkResidency.lastActivatedChunkLabel,
                            lastReleasedChunkLabel: chunkResidency.lastReleasedChunkLabel,
                        }}
                        onTogglePinnedChunk={handleTogglePinnedChunk}
                        onLocateChunk={handleLocateChunk}
                        onClose={closeHistory}
                    />
                </div>
            )}

            {showMedia && (
                <div
                    className="absolute top-20 bottom-4 z-30 animate-in slide-in-from-right-4 duration-300"
                    style={{ right: `${sideDockOffset + (showLayers ? 328 : 0) + (showHistory ? 328 : 0)}px` }}
                >
                    <ProjectMediaPanel
                        items={projectMediaItems}
                        referenceImages={projectReferenceItems.map((item) => item.image)}
                        onClose={closeMedia}
                        onClearAll={handleClearProjectMediaHistory}
                        onSaveAsReference={saveProjectReferenceFromMediaItem}
                        onLocateSource={handleLocateProjectMediaSource}
                        onInsertItem={handleInsertProjectMediaItem}
                    />
                </div>
            )}

            {showReferences && (
                <div
                    className="absolute top-20 bottom-4 z-30 animate-in slide-in-from-right-4 duration-300"
                    style={{ right: `${sideDockOffset + (showLayers ? 328 : 0) + (showHistory ? 328 : 0) + (showMedia ? 328 : 0)}px` }}
                >
                    <ProjectReferencePanel
                        items={projectReferenceItems}
                        onClose={closeReferences}
                        onClearAll={handleClearProjectReferences}
                        onDeleteItem={handleDeleteProjectReferenceItem}
                        onDeleteItems={handleDeleteProjectReferenceItems}
                        onLocateSource={handleLocateProjectReferenceSource}
                        onInsertItem={handleInsertProjectReferenceItem}
                        onInsertItems={handleInsertProjectReferenceItems}
                    />
                </div>
            )}

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
                <FloatingToolbar
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    onAddImage={handleAddImage}
                    onAddVideo={handleAddVideo}
                    onAddText={handleAddText}
                    onAddShape={handleAddShape}
                    onOpenImageGenerator={handleOpenImageGenerator}
                    onOpenVideoGenerator={handleOpenVideoGenerator}
                    onOpenStoryboardPlanner={handleOpenStoryboardPlanner}
                />

                {selectedGeneratorElement?.type === 'storyboard-planner' && selectedGeneratorPanelStyle && (
                    <StoryboardPlannerPanel
                        key={selectedGeneratorElement.id}
                        elementId={selectedGeneratorElement.id}
                        style={selectedGeneratorPanelStyle}
                        selectedModel={selectedModel}
                        projectReferenceImages={projectReferenceItems}
                        onUseProjectReferenceImage={handleUseProjectReferenceImage}
                        canvasImages={generatorPanelCanvasImages}
                        selectedCanvasImageIds={selectedCanvasImageIds}
                        onRequestCanvasSelect={handleRequestCanvasSelectImage}
                        onElementChange={handleElementChange}
                        onSubmittingChange={handleGeneratorSubmittingChange}
                        onClose={() => setSelectedIds([])}
                        onCreateDraft={handleCreateStoryboardDraft}
                    />
                )}

                {storyboardPlannerSourceElement && storyboardPlannerPanelStyle && (
                    <StoryboardPlannerPanel
                        key={`image-storyboard-${storyboardPlannerSourceElement.id}`}
                        elementId={storyboardPlannerSourceElement.id}
                        style={storyboardPlannerPanelStyle}
                        selectedModel={selectedModel}
                        projectReferenceImages={projectReferenceItems}
                        onUseProjectReferenceImage={handleUseProjectReferenceImage}
                        canvasImages={generatorPanelCanvasImages}
                        selectedCanvasImageIds={[storyboardPlannerSourceElement.id]}
                        onRequestCanvasSelect={() => handleRequestCanvasSelectImage(storyboardPlannerSourceElement.id)}
                        // 普通图片模式只借用分镜面板能力，不把任务状态同步回原图，避免轮询结果反写覆盖源图。
                        onClose={() => setStoryboardPlannerSourceElementId(null)}
                        onCreateDraft={handleCreateStoryboardDraft}
                    />
                )}

                {/* Image Generator Panel */}
                {selectedGeneratorElement?.type === 'image-generator' && selectedGeneratorPanelStyle && (
                    <ImageGeneratorPanel
                        key={selectedGeneratorElement.id}
                        elementId={selectedGeneratorElement.id}
                        onGenerate={handleGenerateImage}
                        onRecoverTask={handleRecoverImageTask}
                        isGenerating={!!generatorSubmittingMap[selectedGeneratorElement.id]}
                        projectReferenceImages={projectReferenceItems}
                        onUseProjectReferenceImage={handleUseProjectReferenceImage}
                        canvasElements={elements}
                        onElementChange={handleElementChange}
                        onSubmittingChange={handleGeneratorSubmittingChange}
                        onAddElement={handleAddGeneratedBatchImageElement}
                        onRequestCanvasSelect={handleRequestCanvasSelectImage}
                        style={selectedGeneratorPanelStyle}
                    />
                )}

                {/* Video Generator Panel */}
                {selectedGeneratorElement?.type === 'video-generator' && selectedGeneratorPanelStyle && (
                    <VideoGeneratorPanel
                        key={selectedGeneratorElement.id}
                        elementId={selectedGeneratorElement.id}
                        onGenerate={handleGenerateVideo}
                        onRecoverTask={handleRecoverVideoTask}
                        isGenerating={!!generatorSubmittingMap[selectedGeneratorElement.id]}
                        projectReferenceImages={projectReferenceItems}
                        onUseProjectReferenceImage={handleUseProjectReferenceImage}
                        projectMediaItems={projectMediaItems}
                        onRecordProjectMediaItem={recordProjectMediaItem}
                        canvasElements={elements}
                        onElementChange={handleElementChange}
                        onSubmittingChange={handleGeneratorSubmittingChange}
                        onRequestCanvasSelect={handleRequestCanvasSelectVideo}
                        style={selectedGeneratorPanelStyle}
                    />
                )}

                {isStoryboardExportOpen && selectedStoryboardExportElements.length >= 2 && (
                    <StoryboardExportPanel
                        selectedCount={selectedStoryboardExportElements.length}
                        defaultFileName={sanitizeFilenameStem(
                            `${getElementBaseName(selectedStoryboardExportElements[0])} 分镜表 ${selectedStoryboardExportElements.length}张`,
                            'lovart-storyboard',
                        )}
                        items={selectedStoryboardExportElements.map((item) => ({
                            id: item.id,
                            content: item.content || '',
                            displayName: item.displayName || '',
                            prompt: item.savedPrompt || '',
                            annotationTitle: item.annotationTitle || '',
                            annotationNote: item.annotationNote || '',
                            storyboardShotCode: item.storyboardShotCode || '',
                            storyboardSceneType: item.storyboardSceneType || '',
                            storyboardCameraMove: item.storyboardCameraMove || '',
                            storyboardDuration: item.storyboardDuration || '',
                            storyboardNote: item.storyboardNote || '',
                        }))}
                        isSubmitting={isStoryboardExportSubmitting}
                        submitStatusText={storyboardExportSubmitStatus}
                        onApplyToCanvas={handleStoryboardExportItemsChange}
                        onLocateItem={focusCanvasElement}
                        onCancelSubmit={() => cancelImageWorkerTask('分镜表导出')}
                        onClose={() => setIsStoryboardExportOpen(false)}
                        onSubmit={(options, orderedItems) => void handleExportStoryboard(options, orderedItems)}
                    />
                )}

                {selectedAnnotateImageElement && selectedAnnotateImagePanelStyle && (
                    <AnnotateImagePanel
                        key={selectedAnnotateImageElement.id}
                        element={selectedAnnotateImageElement}
                        style={selectedAnnotateImagePanelStyle}
                        isSubmitting={isAnnotateImageSubmitting}
                        submitStatusText={annotateImageSubmitStatus}
                        onCancelSubmit={() => cancelImageWorkerTask('标注任务')}
                        onClose={() => setAnnotateImageTargetId(null)}
                        onSubmit={(options) => void handleAnnotateImage(selectedAnnotateImageElement, options)}
                    />
                )}

                {selectedCropImageElement && selectedCropImagePanelStyle && (
                    <CropImagePanel
                        key={selectedCropImageElement.id}
                        element={selectedCropImageElement}
                        style={selectedCropImagePanelStyle}
                        isSubmitting={isCropImageSubmitting}
                        submitStatusText={cropImageSubmitStatus}
                        onCancelSubmit={() => cancelImageWorkerTask('裁剪任务')}
                        onClose={() => setCropImageTargetId(null)}
                        onSubmit={(options) => void handleCropImage(selectedCropImageElement, options)}
                    />
                )}

                {selectedSplitStoryboardElement && selectedSplitStoryboardPanelStyle && (
                    <SplitStoryboardPanel
                        key={selectedSplitStoryboardElement.id}
                        element={selectedSplitStoryboardElement}
                        style={selectedSplitStoryboardPanelStyle}
                        isSubmitting={isSplitStoryboardSubmitting}
                        submitStatusText={splitStoryboardSubmitStatus}
                        onCancelSubmit={() => cancelImageWorkerTask('分镜切割任务')}
                        onClose={() => setSplitStoryboardTargetId(null)}
                        onSubmit={(options) => void handleSplitStoryboard(selectedSplitStoryboardElement, options)}
                    />
                )}

                {/* Zoom Controls */}
                <ZoomControl
                    scale={scale}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onZoomTo={handleZoomTo}
                    onFitToScreen={handleFitToScreen}
                />
            </div>

            {/* Shortcut Feedback */}
            {shortcutFeedback && (
                <div className="shortcut-feedback-enter pointer-events-none fixed top-16 right-4 z-[250] flex items-center gap-2 rounded-xl bg-slate-900/90 px-3 py-2 shadow-lg shadow-slate-900/10 backdrop-blur-sm xl:top-14">
                    <span className="text-[12px] font-medium text-slate-300">{shortcutFeedback.label}</span>
                    <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">{shortcutFeedback.shortcut}</kbd>
                </div>
            )}

            {/* Transcoding Status Toast */}
            {transcodingStatus && (
                <div className="canvas-toast-enter pointer-events-none fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2.5 rounded-xl bg-slate-900/90 px-4 py-2.5 shadow-lg shadow-slate-900/10 backdrop-blur-sm">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/20 border-t-white" />
                    <span className="text-[13px] font-medium text-white">{transcodingStatus}</span>
                </div>
            )}

            {/* General Toast Notification */}
            {toast && (
                <div className={`canvas-toast-enter fixed top-16 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-sm xl:top-14 ${
                    toast.type === 'error' ? 'bg-rose-600/90 text-white shadow-rose-600/10' :
                    toast.type === 'success' ? 'bg-emerald-600/90 text-white shadow-emerald-600/10' :
                    'bg-slate-900/90 text-white shadow-slate-900/10'
                }`}>
                    {toast.type === 'success' && <Check size={14} className="text-emerald-200" />}
                    {toast.type === 'error' && <AlertTriangle size={14} className="text-rose-200" />}
                    <span className="text-[13px] font-medium">{toast.message}</span>
                    <button onClick={clearToast} className="ml-1 flex h-5 w-5 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white">
                        <span className="text-xs leading-none">✕</span>
                    </button>
                </div>
            )}
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