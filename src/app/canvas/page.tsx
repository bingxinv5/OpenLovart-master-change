"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { ChevronLeft, Plus, Minus, Sparkles, Cloud, CloudOff, HardDrive, AlertTriangle, Gauge, Trash, Check } from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/lib/mock-clerk';
import { useSearchParams } from 'next/navigation';
import { FloatingToolbar } from '@/components/lovart/FloatingToolbar';
import { CanvasArea, type CanvasRenderMetrics } from '@/components/lovart/CanvasArea';
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
import { CanvasWorkbenchSwitcher } from '@/components/lovart/CanvasWorkbenchSwitcher';
import { LayersPanel } from '@/components/lovart/LayersPanel';
import { ProjectMediaPanel } from '@/components/lovart/ProjectMediaPanel';
import { ProjectReferencePanel } from '@/components/lovart/ProjectReferencePanel';
import { ApiSettingsButton } from '@/components/lovart/ApiSettingsDialog';
import { GenerationQueuePanel, type GenerationQueueItem } from '@/components/lovart/GenerationQueuePanel';
import { classifyGenerationError, isRecoverableGenerationSubmissionError, withSubmissionRecoveryHint } from '@/components/lovart/generator-error-utils';
import { runImageGenerationFlow } from '@/components/lovart/image-generation-flow';
import { runVideoGenerationFlow } from '@/components/lovart/video-generation-flow';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { type StoryboardPlanResponse } from '@/lib/ai-client';
import {
    createGenerationIdlePatch,
    createGenerationTaskPatch,
} from '@/lib/generation-task-state';
import { useLocalDb } from '@/hooks/useLocalDb';
import { HistoryManager, DirtyTracker, SpatialIndex, elementStore, type HistoryTimelineEntry, type PatchMetadata, ensureImageRef, migrateElementsToImageStore, isImageRef, getImageBlob, getImageBlobUrl, getImageDataUrl, saveImage, saveImageBlob, cleanupUnusedImages } from '@/lib/editor-kernel';
import { useCanvasFeedback } from './canvas-feedback';
import { getViewportSize } from './canvas-focus';
import { getGeneratorOverlayStyle, getSelectedGeneratorElement } from './canvas-generator-overlay';
import { applyElementGenerationPatch, applyGenerationFailure, applyVideoGenerationSuccess, setElementGenerationTask, updateGeneratorSubmittingMap } from './canvas-generation';
import { useCanvasKeyboardShortcuts } from './canvas-keyboard-shortcuts';
import { useCanvasSelectionBridge } from './canvas-selection-bridge';
import { useCanvasWorkbenchPanels } from './canvas-workbench-panels';
import { loadCanvasSession } from './canvas-session-loader';
import { useCanvasSessionRuntime } from './canvas-session-runtime';
import { useGenerationPollingController } from './canvas-generation-controller';
import { pollGenerationTask } from './generation-polling';
import { persistGeneration, removeGeneration, syncGenerationsFromElements, persistSubmission, clearSubmission, loadPendingSubmissions } from './generation-persistence';
import { saveViewportState, loadViewportState } from './viewport-persistence';
import {
    buildCanvasChunkManifest,
    createCanvasProject,
    saveExistingCanvasProject,
    type CanvasChunkManifestEntry,
    type CanvasChunkStats,
} from './project-storage';
import { clearCanvasBenchmarkResults, generateBenchmarkSeeds, getCanvasBenchmarkResults, saveCanvasBenchmarkResult, type CanvasBenchmarkResult } from '@/lib/canvas-benchmark';
import { DEFAULT_WORKBENCH_SETTINGS, getWorkbenchSettings, hasDirectoryPickerSupport, requestAutoSaveDirectoryHandle, requestPersistentStorage, saveBlobToAutoSaveDirectory, saveWorkbenchSettings, subscribeWorkbenchSettingsChange, type StorageEstimateInfo, type WorkbenchSettings, getStorageEstimateInfo } from '@/lib/workbench-settings';
import { v4 as uuidv4 } from 'uuid';
import {
    MAX_CANVAS_IMAGE_SIZE,
    IMAGE_IMPORT_CONCURRENCY,
    BACKGROUND_IMAGE_FIX_CONCURRENCY,
    BACKGROUND_IMAGE_FIX_BATCH_SIZE,
    STORAGE_INFO_THRESHOLD,
    STORAGE_WARN_THRESHOLD,
    STORAGE_CRITICAL_THRESHOLD,
    CHUNK_PREHEAT_THRESHOLD,
    CHUNK_RELEASE_GRACE_MS,
    truncateStoryboardText,
    buildStoryboardPlaceholderDataUrl,
    escapeXml,
    getStoryboardAuditState,
    hasStoryboardGenerationSeed,
    sortStoryboardElements,
    buildPinnedChunkStorageKey,
    loadPinnedChunkIds,
    persistPinnedChunkIds,
    loadStoryboardOverviewPrefs,
    persistStoryboardOverviewPrefs,
    mapStoryboardFilterToScope,
    resolveElementChunkId,
    getCanvasDisplaySize,
    readImageDimensions,
    fitImageToBounds,
    fitAspectRatioLabelToBounds,
    inferImageAspectRatioLabel,
    deriveProjectThumbnail,
    mapWithConcurrency,
    triggerBrowserDownload,
    saveBlobToLocalFile,
    dataUrlToBlob,
    formatBytes,
    inferExtension,
    blobToDataUrl,
    convertImageBlobToRasterBlob,
    buildSvgExportBlob,
    makeGeneratedFilename,
    collectImageRefsFromElements,
    getStorageBadgeClass,
    getDefaultImagePresentation,
    getViewportBounds,
    getElementViewportPriority,
    rectsIntersect,
    getRectIntersectionArea,
    getSplitLayoutBounds,
    scoreSplitLayoutCandidate,
    chooseSplitLayoutOrigin,
    cloneCanvasElement,
    sanitizeToolName,
    sanitizeFilenameStem,
    getElementBaseName,
    buildToolResultNames,
    resolveToolResultNaming,
    type ChunkPreheatState,
    type HistorySummary,
    type ActiveChunkSummary,
    type ChunkResidencyState,
    type StoryboardNavigationScope,
    type StoryboardAuditFilter,
    type StoryboardOverviewPrefs,
    type ElementExportFormat,
} from './canvas-page-utils';
import { fetchRemoteBlob } from '@/lib/blob-utils';
import {
    buildCenteredElementBounds,
    calculateCanvasCenter,
    buildAutoGroupFrame as _buildAutoGroupFrame,
    isValidImageElement,
    resolveElementReferenceImages as _resolveElementReferenceImages,
    resolveElementFrameImages as _resolveElementFrameImages,
    resolveCanvasContentBlob as _resolveCanvasContentBlob,
} from './canvas-element-ops';
import { useCanvasActions } from './canvas-actions';
import { annotateImageBlob, type AnnotateImageOptions } from '@/lib/image-annotate';
import { cropImageBlob, type CropImageOptions } from '@/lib/image-crop';
import { buildStoryboardExportBlob, type StoryboardExportOptions } from '@/lib/storyboard-export';
import { splitImageBlobIntoFrames, type StoryboardSplitFrame, type StoryboardSplitOptions } from '@/lib/storyboard-split';
import { upscaleImageBlob, type UpscaleModelId } from '@/lib/upscale-api';
import { cancelActiveWorkerJobs, isWorkerCancelledError } from '@/lib/image-worker-bridge';
import { appendProjectMediaHistory, clearProjectMediaHistory, readProjectMediaHistory, subscribeProjectMediaHistory, type ProjectMediaHistoryItem } from '@/lib/project-media-history';
import { clearProjectReferenceLibrary, readProjectReferenceLibrary, removeProjectReferenceImage, saveProjectReferenceImage, subscribeProjectReferenceLibrary, touchProjectReferenceImage, type ProjectReferenceImageItem } from '@/lib/project-reference-library';

function areCanvasRenderMetricsEqual(left: CanvasRenderMetrics | null, right: CanvasRenderMetrics) {
    return !!left
        && left.visibleCount === right.visibleCount
        && left.totalCount === right.totalCount
        && left.culledCount === right.culledCount
        && left.virtualizedCount === right.virtualizedCount
        && left.deferredCount === right.deferredCount
        && left.maxVisibleElements === right.maxVisibleElements
        && left.viewportMargin === right.viewportMargin
        && left.partitionCount === right.partitionCount
        && left.partitionTileSize === right.partitionTileSize;
}

    const GENERATED_IMAGE_RENDER_SRC_TTL_MS = 15_000;

function ZoomControl({ scale, onZoomIn, onZoomOut, onZoomTo, onFitToScreen }: {
    scale: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomTo: (v: number) => void;
    onFitToScreen: () => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const presets = [
        { label: '放大', shortcut: '⌘ +', action: onZoomIn },
        { label: '缩小', shortcut: '⌘ -', action: onZoomOut },
        { label: '适合屏幕', shortcut: '⇧ 1', action: () => { onFitToScreen(); setOpen(false); } },
        { type: 'divider' as const },
        { label: '缩放至50%', action: () => { onZoomTo(0.5); setOpen(false); } },
        { label: '缩放至100%', shortcut: '⌘ 0', action: () => { onZoomTo(1); setOpen(false); } },
        { label: '缩放至200%', action: () => { onZoomTo(2); setOpen(false); } },
    ];

    return (
        <div ref={ref} className="absolute bottom-4 left-4 z-50">
            {open && (
                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 min-w-[200px] animate-in slide-in-from-bottom-2 duration-150">
                    {presets.map((item, i) =>
                        'type' in item && item.type === 'divider' ? (
                            <div key={i} className="h-px bg-gray-100 my-1" />
                        ) : (
                            <button
                                key={i}
                                onClick={item.action}
                                className="flex items-center justify-between w-full px-3 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors"
                            >
                                <span>{item.label}</span>
                                {'shortcut' in item && item.shortcut && (
                                    <span className="text-xs text-gray-400 ml-4">{item.shortcut}</span>
                                )}
                            </button>
                        )
                    )}
                </div>
            )}
            <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-100 p-1">
                <button onClick={onZoomOut} className="p-1.5 hover:bg-gray-50 rounded text-gray-500" title="缩小 (Ctrl+-)">
                    <Minus size={16} />
                </button>
                <button
                    onClick={() => setOpen(prev => !prev)}
                    className="px-2 text-xs font-medium text-gray-600 min-w-[3rem] text-center hover:bg-gray-50 rounded py-1"
                    title="缩放选项"
                >
                    {Math.round(scale * 100)}%
                </button>
                <button onClick={onZoomIn} className="p-1.5 hover:bg-gray-50 rounded text-gray-500" title="放大 (Ctrl++)">
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
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
    const [benchmarkResults, setBenchmarkResults] = useState<CanvasBenchmarkResult[]>([]);
    const [isBenchmarkRunning, setIsBenchmarkRunning] = useState(false);
    const [renderMetrics, setRenderMetrics] = useState<CanvasRenderMetrics | null>(null);
    const [chunkPreheat, setChunkPreheat] = useState<ChunkPreheatState>({
        active: false,
        phase: 'idle',
        loadedChunks: 0,
        totalChunks: 0,
        loadedElements: 0,
        totalElements: 0,
    });
    const [historySummary, setHistorySummary] = useState<HistorySummary>({
        lastAction: '初始状态',
        patchCount: 0,
        currentIndex: -1,
        canUndo: false,
        canRedo: false,
    });
    const [historyTimeline, setHistoryTimeline] = useState<HistoryTimelineEntry[]>([]);
    const [showCommandPalette, setShowCommandPalette] = useState(false);
    const [showShortcutHelp, setShowShortcutHelp] = useState(false);
    const [storyboardPlannerSourceElementId, setStoryboardPlannerSourceElementId] = useState<string | null>(null);
    const [shortcutFeedback, setShortcutFeedback] = useState<{ label: string; shortcut: string } | null>(null);
    const [pinnedChunkIds, setPinnedChunkIds] = useState<string[]>([]);
    const [chunkResidency, setChunkResidency] = useState<ChunkResidencyState>({
        phase: 'idle',
        residentChunkIds: [],
        unloadedChunkIds: [],
        residentElementCount: 0,
        unloadedElementCount: 0,
    });
    const runtimeImageRenderSrcsRef = useRef<Map<string, string>>(new Map());
    const runtimeImageRenderSrcTimersRef = useRef<Map<string, number>>(new Map());
    const [runtimeImageRenderSrcs, setRuntimeImageRenderSrcs] = useState<Record<string, string>>({});

    const handleRenderMetricsChange = useCallback((nextMetrics: CanvasRenderMetrics) => {
        if (!benchmarkMode) {
            return;
        }

        setRenderMetrics((previous) => areCanvasRenderMetricsEqual(previous, nextMetrics) ? previous : nextMetrics);
    }, [benchmarkMode]);

    useEffect(() => {
        if (!benchmarkMode) {
            setRenderMetrics(null);
        }
    }, [benchmarkMode]);

    // ── Normalized Map state: O(1) element access instead of O(n) array traversal ──
    const elementsMapRef = useRef<Map<string, CanvasElement>>(new Map());
    const [elementsVersion, setElementsVersion] = useState(0);
    const shortcutFeedbackTimerRef = useRef<number | null>(null);
    /** Derived array — rebuild on each render after version bump */
    const elements = useMemo(() => {
        void elementsVersion;
        return Array.from(elementsMapRef.current.values());
    }, [elementsVersion]);
    /** Compatible setElements — supports all existing (prev => ...) patterns; hot paths use direct Map mutation */
    const setElements = useCallback((updater: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) => {
        const map = elementsMapRef.current;
        const prevArr = Array.from(map.values());
        const newArr = typeof updater === 'function' ? updater(prevArr) : updater;
        map.clear();
        for (const el of newArr) map.set(el.id, el);
        const changedIds = new Set<string>();
        for (const el of prevArr) changedIds.add(el.id);
        for (const el of newArr) changedIds.add(el.id);
        if (historyTransactionRef.current) {
            historyChangedIdsRef.current = changedIds;
            historyManagerRef.current.touchTransactionIds(changedIds);
            historyNeedsFullRecordRef.current = false;
        } else {
            historyNeedsFullRecordRef.current = true;
            historyChangedIdsRef.current.clear();
        }
        spatialIndexNeedsRebuildRef.current = true;
        setElementsVersion(v => v + 1);
    }, []);

    const releaseRuntimeImageRenderSrc = useCallback((elementId: string) => {
        const existingTimer = runtimeImageRenderSrcTimersRef.current.get(elementId);
        if (existingTimer !== undefined) {
            window.clearTimeout(existingTimer);
            runtimeImageRenderSrcTimersRef.current.delete(elementId);
        }

        const currentUrl = runtimeImageRenderSrcsRef.current.get(elementId);
        if (currentUrl) {
            runtimeImageRenderSrcsRef.current.delete(elementId);
            try {
                URL.revokeObjectURL(currentUrl);
            } catch {
                // Ignore stale object URL cleanup failures.
            }
        }

        setRuntimeImageRenderSrcs((previous) => {
            if (!(elementId in previous)) {
                return previous;
            }

            const next = { ...previous };
            delete next[elementId];
            return next;
        });
    }, []);

    const primeRuntimeImageRenderSrc = useCallback((elementId: string, blob: Blob | null) => {
        if (typeof window === 'undefined' || !blob) {
            return;
        }

        const nextUrl = URL.createObjectURL(blob);
        const previousTimer = runtimeImageRenderSrcTimersRef.current.get(elementId);
        if (previousTimer !== undefined) {
            window.clearTimeout(previousTimer);
        }

        const previousUrl = runtimeImageRenderSrcsRef.current.get(elementId);
        runtimeImageRenderSrcsRef.current.set(elementId, nextUrl);
        setRuntimeImageRenderSrcs((previous) => ({
            ...previous,
            [elementId]: nextUrl,
        }));

        if (previousUrl && previousUrl !== nextUrl) {
            try {
                URL.revokeObjectURL(previousUrl);
            } catch {
                // Ignore stale object URL cleanup failures.
            }
        }

        const cleanupTimer = window.setTimeout(() => {
            releaseRuntimeImageRenderSrc(elementId);
        }, GENERATED_IMAGE_RENDER_SRC_TTL_MS);
        runtimeImageRenderSrcTimersRef.current.set(elementId, cleanupTimer);
    }, [releaseRuntimeImageRenderSrc]);

    useEffect(() => {
        const activeIds = new Set(elements.map((element) => element.id));
        runtimeImageRenderSrcsRef.current.forEach((_, elementId) => {
            if (!activeIds.has(elementId)) {
                releaseRuntimeImageRenderSrc(elementId);
            }
        });
    }, [elements, releaseRuntimeImageRenderSrc]);

    useEffect(() => () => {
        runtimeImageRenderSrcTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        runtimeImageRenderSrcTimersRef.current.clear();
        runtimeImageRenderSrcsRef.current.forEach((url) => {
            try {
                URL.revokeObjectURL(url);
            } catch {
                // Ignore stale object URL cleanup failures.
            }
        });
        runtimeImageRenderSrcsRef.current.clear();
    }, []);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const selectedIdsRef = useRef<string[]>([]);
    useEffect(() => {
        selectedIdsRef.current = selectedIds;
    }, [selectedIds]);
    const [activeTool, setActiveTool] = useState('select'); // 'select', 'hand', 'mark', 'shape', 'text', 'draw'
    const [title, setTitle] = useState('未命名');
    const [isGenerating] = useState(false);
    const [isStoryboardExportOpen, setIsStoryboardExportOpen] = useState(false);
    const [isStoryboardExportSubmitting, setIsStoryboardExportSubmitting] = useState(false);
    const [storyboardExportSubmitStatus, setStoryboardExportSubmitStatus] = useState('');
    const [annotateImageTargetId, setAnnotateImageTargetId] = useState<string | null>(null);
    const [isAnnotateImageSubmitting, setIsAnnotateImageSubmitting] = useState(false);
    const [annotateImageSubmitStatus, setAnnotateImageSubmitStatus] = useState('');
    const [cropImageTargetId, setCropImageTargetId] = useState<string | null>(null);
    const [isCropImageSubmitting, setIsCropImageSubmitting] = useState(false);
    const [cropImageSubmitStatus, setCropImageSubmitStatus] = useState('');
    const [splitStoryboardTargetId, setSplitStoryboardTargetId] = useState<string | null>(null);
    const [isSplitStoryboardSubmitting, setIsSplitStoryboardSubmitting] = useState(false);
    const [splitStoryboardSubmitStatus, setSplitStoryboardSubmitStatus] = useState('');
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const [autoAdvanceStoryboardIssues, setAutoAdvanceStoryboardIssues] = useState(false);
    const [autoAdvanceStoryboardScope, setAutoAdvanceStoryboardScope] = useState<StoryboardNavigationScope>('issues');
    const [storyboardAuditFilter, setStoryboardAuditFilter] = useState<StoryboardAuditFilter>('all');
    const [storyboardOverviewCollapsed, setStoryboardOverviewCollapsed] = useState(false);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectId);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');
    const [isLoading, setIsLoading] = useState(true);
    const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
    const [transcodingStatus, setTranscodingStatus] = useState<string | null>(null);
    const [generatorSubmittingMap, setGeneratorSubmittingMap] = useState<Record<string, boolean>>({});
    const [projectMediaItems, setProjectMediaItems] = useState<ProjectMediaHistoryItem[]>([]);
    const [projectReferenceItems, setProjectReferenceItems] = useState<ProjectReferenceImageItem[]>([]);
    const clipboardRef = useRef<CanvasElement[]>([]); // internal clipboard for Ctrl+C/V
    const migrationPendingRef = useRef<string[]>([]); // IDs of elements migrated from base64 to ImageStore
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isInitializedRef = useRef(false);
    const currentProjectIdRef = useRef<string | null>(projectId);
    const pinnedChunkProjectIdRef = useRef<string | null>(projectId);
    const existingThumbnailRef = useRef<string | null>(null); // tracks user-set custom cover
    const storageWarnedRef = useRef(false);
    const titleDirtyRef = useRef(false);
    const lastSavedTitleRef = useRef(title);

    const clearScheduledSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
    }, []);

    const handleTitleChange = useCallback((nextTitle: string) => {
        setTitle(nextTitle);

        if (!isInitializedRef.current) {
            lastSavedTitleRef.current = nextTitle;
            titleDirtyRef.current = false;
            return;
        }

        const isDirty = nextTitle !== lastSavedTitleRef.current;
        titleDirtyRef.current = isDirty;

        if (isDirty) {
            setSaveStatus('saving');
        } else if (!dirtyTrackerRef.current.isDirty) {
            setSaveStatus('saved');
        }
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
        setProjectReferenceItems(readProjectReferenceLibrary(currentProjectId));
        return subscribeProjectReferenceLibrary(currentProjectId, () => {
            setProjectReferenceItems(readProjectReferenceLibrary(currentProjectId));
        });
    }, [currentProjectId]);

    const recordProjectMediaItem = useCallback((params: {
        kind: 'image' | 'video' | 'audio';
        content: string;
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

    const saveProjectReferenceFromMediaItem = useCallback((item: ProjectMediaHistoryItem) => {
        const projectId = currentProjectIdRef.current;
        if (!projectId || item.kind !== 'image') {
            return;
        }

        saveProjectReferenceImage({
            projectId,
            image: item.content,
            label: item.prompt,
            prompt: item.prompt,
            sourceMediaId: item.id,
            sourceElementId: item.sourceElementId,
        });
        showToast('已加入项目参考库', 'success');
    }, [showToast]);

    const saveProjectReferenceFromElement = useCallback((element: CanvasElement) => {
        const projectId = currentProjectIdRef.current;
        if (!projectId || element.type !== 'image' || !element.content) {
            return;
        }

        saveProjectReferenceImage({
            projectId,
            image: element.content,
            label: element.displayName || element.savedPrompt,
            prompt: element.savedPrompt,
            sourceElementId: element.id,
        });
        showToast('当前图片已加入项目参考库', 'success');
    }, [showToast]);

    const saveProjectReferenceFromSelection = useCallback((ids: string[]) => {
        const projectId = currentProjectIdRef.current;
        if (!projectId) {
            return;
        }

        const existingImages = new Set(
            readProjectReferenceLibrary(projectId).map((item) => item.image),
        );
        let processed = 0;
        let added = 0;

        ids.forEach((id) => {
            const element = elementsMapRef.current.get(id);
            if (!element || element.type !== 'image' || !element.content) {
                return;
            }

            processed += 1;
            if (!existingImages.has(element.content)) {
                added += 1;
                existingImages.add(element.content);
            }

            saveProjectReferenceImage({
                projectId,
                image: element.content,
                label: element.displayName || element.savedPrompt,
                prompt: element.savedPrompt,
                sourceElementId: element.id,
            });
        });

        if (processed === 0) {
            showToast('所选内容里没有可加入参考库的图片', 'info');
            return;
        }

        showToast(
            added === processed
                ? `已批量加入 ${processed} 张项目参考图`
                : `已处理 ${processed} 张图片，新增 ${added} 张到项目参考库`,
            'success',
        );
    }, [showToast]);

    const handleUseProjectReferenceImage = useCallback((id: string) => {
        const projectId = currentProjectIdRef.current;
        if (!projectId) {
            return;
        }
        touchProjectReferenceImage(projectId, id);
    }, []);

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
    }): ChunkResidencyState => {
        const residentSet = new Set(residentChunkIds);
        const orderedResidentChunkIds = chunkManifest
            .map((chunk) => chunk.id)
            .filter((chunkId) => residentSet.has(chunkId));
        const orderedResidentSet = new Set(orderedResidentChunkIds);
        const unloadedChunkIds = chunkManifest
            .map((chunk) => chunk.id)
            .filter((chunkId) => !orderedResidentSet.has(chunkId));

        const countElements = (chunkIds: string[]) => chunkIds.reduce((sum, chunkId) => sum + (chunkMetaById.get(chunkId)?.elementCount || 0), 0);

        return {
            phase,
            residentChunkIds: orderedResidentChunkIds,
            unloadedChunkIds,
            residentElementCount: countElements(orderedResidentChunkIds),
            unloadedElementCount: countElements(unloadedChunkIds),
            lastActivatedChunkLabel: labels?.lastActivatedChunkLabel,
            lastReleasedChunkLabel: labels?.lastReleasedChunkLabel,
        };
    }, [chunkManifest, chunkMetaById]);

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
        if (elements.length === 0 || chunkManifest.length === 0) {
            return {
                activeChunkIds: [],
                releasedChunkIds: [],
                activeElements: elements,
            };
        }

        const activeChunkIds = new Set<string>(hasRootChunk ? ['root'] : []);
        const viewport = getViewportSize();
        const activationMargin = Math.max(240, 360 / Math.max(scale, 0.2));
        const vpLeft = (-pan.x / scale) - activationMargin;
        const vpTop = (-pan.y / scale) - activationMargin;
        const vpRight = (viewport.width - pan.x) / scale + activationMargin;
        const vpBottom = (viewport.height - pan.y) / scale + activationMargin;

        for (const chunk of chunkManifest) {
            if (!chunk.topFrameId) {
                continue;
            }
            const frame = elementById.get(chunk.topFrameId);
            if (!frame) {
                continue;
            }
            const frameRight = frame.x + (frame.width || 0);
            const frameBottom = frame.y + (frame.height || 0);
            const intersectsViewport = frameRight >= vpLeft
                && frame.x <= vpRight
                && frameBottom >= vpTop
                && frame.y <= vpBottom;
            if (intersectsViewport) {
                activeChunkIds.add(chunk.id);
            }
        }

        for (const elementId of [...selectedIds, ...highlightedLayerIds, ...(highlightedResultId ? [highlightedResultId] : [])]) {
            const chunkId = elementChunkIdById.get(elementId);
            if (chunkId) {
                activeChunkIds.add(chunkId);
            }
        }

        pinnedChunkIds.forEach((chunkId) => {
            if (validChunkIdSet.has(chunkId)) {
                activeChunkIds.add(chunkId);
            }
        });

        const activeElements = elements.filter((element) => activeChunkIds.has(elementChunkIdById.get(element.id) || 'root'));
        const releasedChunkIds = chunkManifest
            .map((chunk) => chunk.id)
            .filter((chunkId) => !activeChunkIds.has(chunkId));

        return {
            activeChunkIds: Array.from(activeChunkIds),
            releasedChunkIds,
            activeElements,
        };
    }, [chunkManifest, elementById, elementChunkIdById, elements, hasRootChunk, highlightedLayerIds, highlightedResultId, pan.x, pan.y, pinnedChunkIds, scale, selectedIds, validChunkIdSet]);

    const chunkReleaseTimerRef = useRef<number | null>(null);
    useEffect(() => {
        if (chunkReleaseTimerRef.current !== null) {
            window.clearTimeout(chunkReleaseTimerRef.current);
            chunkReleaseTimerRef.current = null;
        }

        if (chunkManifest.length === 0) {
            setChunkResidency({
                phase: 'idle',
                residentChunkIds: [],
                unloadedChunkIds: [],
                residentElementCount: elements.length,
                unloadedElementCount: 0,
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

            if (toHydrate.length === 0 && toRelease.length === 0) {
                return buildChunkResidencyState(currentResident, 'idle', {
                    lastActivatedChunkLabel: prev.lastActivatedChunkLabel,
                    lastReleasedChunkLabel: prev.lastReleasedChunkLabel,
                });
            }

            const nextResident = Array.from(new Set([...currentResident, ...toHydrate]));
            return buildChunkResidencyState(nextResident, toHydrate.length > 0 ? 'hydrating' : 'releasing', {
                lastActivatedChunkLabel: toHydrate.length > 0 ? chunkMetaById.get(toHydrate[0])?.label || prev.lastActivatedChunkLabel : prev.lastActivatedChunkLabel,
                lastReleasedChunkLabel: toRelease.length > 0 ? chunkMetaById.get(toRelease[0])?.label || prev.lastReleasedChunkLabel : prev.lastReleasedChunkLabel,
            });
        });

        chunkReleaseTimerRef.current = window.setTimeout(() => {
            setChunkResidency((prev) => {
                const currentResident = prev.residentChunkIds.length > 0 ? prev.residentChunkIds : targetChunkIds;
                const releasedChunkIds = currentResident.filter((chunkId) => !targetSet.has(chunkId));
                const keptChunkIds = currentResident.filter((chunkId) => targetSet.has(chunkId));
                return buildChunkResidencyState(keptChunkIds, 'idle', {
                    lastActivatedChunkLabel: prev.lastActivatedChunkLabel,
                    lastReleasedChunkLabel: releasedChunkIds.length > 0 ? chunkMetaById.get(releasedChunkIds[0])?.label || prev.lastReleasedChunkLabel : prev.lastReleasedChunkLabel,
                });
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
        if (elements.length === 0 || chunkManifest.length === 0) {
            return elements;
        }

        const residentChunkIds = chunkResidency.residentChunkIds.length > 0
            ? new Set(chunkResidency.residentChunkIds)
            : new Set(activeChunkSummary.activeChunkIds);

        return elements.filter((element) => residentChunkIds.has(elementChunkIdById.get(element.id) || 'root'));
    }, [activeChunkSummary.activeChunkIds, chunkManifest.length, chunkResidency.residentChunkIds, elementChunkIdById, elements]);

    const chunkPanelEntries = useMemo(() => {
        const activeSet = new Set(activeChunkSummary.activeChunkIds);
        const residentSet = new Set(chunkResidency.residentChunkIds.length > 0 ? chunkResidency.residentChunkIds : activeChunkSummary.activeChunkIds);
        const pinnedSet = new Set(pinnedChunkIds);

        return chunkManifest
            .map((chunk) => ({
                ...chunk,
                isActive: activeSet.has(chunk.id),
                isPinned: pinnedSet.has(chunk.id),
                isResident: residentSet.has(chunk.id),
            }))
            .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || Number(b.isActive) - Number(a.isActive) || b.elementCount - a.elementCount);
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

    const sideChatWidth = showChat && chatPanelMode === 'side'
        ? (chatExpanded ? 720 : 420)
        : 0;
    const rightDockPanelWidth = (showLayers ? 328 : 0) + (showHistory ? 328 : 0) + (showMedia ? 348 : 0);
    const rightWorkbenchOffset = showLayers || showHistory || showMedia
        ? sideDockOffset + rightDockPanelWidth
        : sideChatWidth;
    const benchmarkPanelRightOffset = rightWorkbenchOffset + 16;

    const handleGeneratorSubmittingChange = useCallback((elementId: string, submitting: boolean, liveParams?: { prompt?: string; model?: string; aspectRatio?: string; imageSize?: string; duration?: string; generateCount?: number }, completion?: { outcome: 'succeeded' | 'failed' | 'interrupted' }) => {
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
                const actualDuration = liveParams?.duration || el.selectedDuration || '';
                const actualGenerateCount = liveParams?.generateCount || el.selectedGenerateCount || 1;

                // 立即将 Panel 当前的 prompt/model/aspectRatio 同步写入 element，
                // 避免 usePersistGeneratorValue 异步延迟导致 savedPrompt 是旧值。
                // 这样在 finalizeGeneratedImageElement 用 ...item 展开时，
                // 图片元素上的 savedPrompt 始终为实际生成所用的提示词。
                if (actualPrompt !== el.savedPrompt || actualModel !== el.selectedModel || actualAspectRatio !== el.selectedAspectRatio || actualImageSize !== (el.selectedImageSize || '') || actualDuration !== (el.selectedDuration || '') || actualGenerateCount !== (el.selectedGenerateCount || 1)) {
                    const synced = {
                        ...el,
                        savedPrompt: actualPrompt,
                        selectedModel: actualModel,
                        selectedAspectRatio: actualAspectRatio,
                        selectedImageSize: actualImageSize || undefined,
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
        if (benchmarkMode) {
            setBenchmarkResults(getCanvasBenchmarkResults());
        }
    }, [benchmarkMode]);

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
        if (!content) return content;
        if (isImageRef(content)) return content;

        try {
            if (content.startsWith('data:')) {
                const ref = await ensureImageRef(content);
                void refreshStorageEstimate();
                return ref;
            }

            if (content.startsWith('blob:')) {
                const blob = await fetch(content).then((response) => response.blob());
                const ref = await saveImageBlob(blob);
                if (ref) {
                    void refreshStorageEstimate();
                    return ref;
                }
                return content;
            }

            if (content.startsWith('http://') || content.startsWith('https://')) {
                const blob = prefetchedBlob ?? await fetchRemoteBlob(content, `lovart-${source}-image`);
                if (blob) {
                    const ref = await saveImageBlob(blob);
                    if (ref) {
                        void refreshStorageEstimate();
                        return ref;
                    }
                }
            }
        } catch (error) {
            console.warn('[Workbench] Failed to localize generated image:', error);
        }

        return ensureImageRef(content);
    }, [refreshStorageEstimate]);

    const resolveImageDisplayMetrics = useCallback(async (
        content: string,
        source: string,
        options?: {
            maxWidth?: number;
            maxHeight?: number;
            anchor?: {
                x: number;
                y: number;
                width: number;
                height: number;
            };
        },
        prefetchedBlob?: Blob | null,
    ): Promise<{ width: number; height: number; x?: number; y?: number; aspectRatio?: string } | null> => {
        const computeFitted = (natural: { width: number; height: number }) => {
            const actualAspectRatio = inferImageAspectRatioLabel(natural.width, natural.height);
            const fitted = options?.maxWidth && options?.maxHeight
                ? fitImageToBounds(natural.width, natural.height, options.maxWidth, options.maxHeight)
                : getCanvasDisplaySize(natural.width, natural.height);

            if (!options?.anchor) {
                return {
                    ...fitted,
                    aspectRatio: actualAspectRatio,
                };
            }

            return {
                ...fitted,
                aspectRatio: actualAspectRatio,
                x: Math.round(options.anchor.x + (options.anchor.width - fitted.width) / 2),
                y: Math.round(options.anchor.y + (options.anchor.height - fitted.height) / 2),
            };
        };

        try {
            let blob: Blob | null = prefetchedBlob ?? null;

            if (!blob) {
                if (isImageRef(content)) {
                    blob = await getImageBlob(content);
                } else if (content.startsWith('data:') || content.startsWith('blob:')) {
                    blob = await dataUrlToBlob(content);
                } else if (content.startsWith('http://') || content.startsWith('https://')) {
                    const filename = `lovart-${source}-image-metrics`;
                    blob = await fetchRemoteBlob(content, filename);
                }
            }

            if (blob) {
                const natural = await readImageDimensions(blob);
                return computeFitted(natural);
            }

            // Blob 加载失败 → 通过 DOM Image 元素兜底测量尺寸
            let imgSrc: string | null = null;
            if (isImageRef(content)) {
                // 尝试获取 blob URL
                imgSrc = await getImageBlobUrl(content);
            } else if (content) {
                imgSrc = content;
            }

            if (imgSrc) {
                const natural = await new Promise<{ width: number; height: number }>((resolve, reject) => {
                    const img = new window.Image();
                    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                    img.onerror = () => reject(new Error('Image load failed'));
                    img.src = imgSrc;
                });
                return computeFitted(natural);
            }

            return null;
        } catch (error) {
            console.warn('[Workbench] Failed to resolve image display metrics:', error);
            return null;
        }
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
        if (!anchor) {
            return null;
        }

        const fitted = fitAspectRatioLabelToBounds(
            aspectRatio,
            Math.max(1, anchor.width),
            Math.max(1, anchor.height),
        );

        if (!fitted) {
            return null;
        }

        return {
            ...fitted,
            x: Math.round(anchor.x + (anchor.width - fitted.width) / 2),
            y: Math.round(anchor.y + (anchor.height - fitted.height) / 2),
        };
    }, []);

    const finalizeAiEditedImageElement = useCallback(async (
        elementId: string,
        resultUrl: string,
        source: string,
        anchor?: {
            x: number;
            y: number;
            width: number;
            height: number;
        },
    ) => {
        let prefetchedBlob: Blob | null = null;
        if (resultUrl.startsWith('http://') || resultUrl.startsWith('https://')) {
            prefetchedBlob = await fetchRemoteBlob(resultUrl, `lovart-${source}-image`);
            if (prefetchedBlob) {
                primeRuntimeImageRenderSrc(elementId, prefetchedBlob);
            }
        }

        const finalContent = await normalizeGeneratedImageContent(resultUrl, source, prefetchedBlob);
        let imageMetrics = await resolveImageDisplayMetrics(finalContent, source, anchor ? {
            maxWidth: anchor.width,
            maxHeight: anchor.height,
            anchor,
        } : undefined, prefetchedBlob);

        if (!imageMetrics && finalContent !== resultUrl) {
            imageMetrics = await resolveImageDisplayMetrics(resultUrl, source, anchor ? {
                maxWidth: anchor.width,
                maxHeight: anchor.height,
                anchor,
            } : undefined, prefetchedBlob);
        }

        void persistGeneratedAssetToDisk(finalContent, 'image', source, prefetchedBlob);
        setElements(prev => prev.map((item) => {
            if (item.id !== elementId) {
                return item;
            }

            return {
                ...item,
                type: 'image',
                content: finalContent,
                selectedAspectRatio: imageMetrics?.aspectRatio ?? item.selectedAspectRatio,
                imageFit: item.imageFit || workbenchSettings.defaultImageFit,
                imageSurface: item.imageSurface || workbenchSettings.defaultImageSurface,
                width: imageMetrics?.width ?? item.width,
                height: imageMetrics?.height ?? item.height,
                x: imageMetrics?.x ?? item.x,
                y: imageMetrics?.y ?? item.y,
                ...createGenerationIdlePatch(),
            };
        }));
        dirtyTrackerRef.current.markModified(elementId);

        const pid = currentProjectIdRef.current;
        if (pid) {
            removeGeneration(pid, elementId);
        }
    }, [normalizeGeneratedImageContent, persistGeneratedAssetToDisk, primeRuntimeImageRenderSrc, resolveImageDisplayMetrics, setElements, workbenchSettings.defaultImageFit, workbenchSettings.defaultImageSurface]);

    const replaceGeneratorWithPendingImage = useCallback((
        elementId: string,
        imageUrl: string,
    ) => {
        setElements(prev => prev.map((item) => {
            if (item.id !== elementId) {
                return item;
            }

            const previewMetrics = resolveAspectRatioFallbackMetrics(
                item.selectedAspectRatio,
                {
                    x: item.x,
                    y: item.y,
                    width: item.width || 400,
                    height: item.height || 400,
                },
            );

            return {
                ...item,
                type: 'image',
                content: imageUrl,
                flowReferenceImages: item.savedReferenceImages || item.flowReferenceImages,
                referenceImageId: undefined,
                savedReferenceImages: undefined,
                savedReferenceImage: undefined,
                // 使用 cover 填充立即展示图片，避免尺寸未校正时的留白问题。
                // finalizeGeneratedImageElement 会在后续校正为实际尺寸 + 用户设定的 imageFit。
                imageFit: 'cover',
                imageSurface: item.imageSurface || workbenchSettings.defaultImageSurface,
                width: previewMetrics?.width ?? item.width,
                height: previewMetrics?.height ?? item.height,
                x: previewMetrics?.x ?? item.x,
                y: previewMetrics?.y ?? item.y,
                ...createGenerationIdlePatch(),
            };
        }));
        dirtyTrackerRef.current.markModified(elementId);
        // 生成完成，清理 sessionStorage
        const pid = currentProjectIdRef.current;
        if (pid) removeGeneration(pid, elementId);
    }, [resolveAspectRatioFallbackMetrics, setElements, workbenchSettings.defaultImageSurface]);

    const finalizeGeneratedImageElement = useCallback(async (
        elementId: string,
        resultUrl: string,
        source: string,
        anchor?: {
            x: number;
            y: number;
            width: number;
            height: number;
        },
    ) => {
        const previousElement = elementsMapRef.current.get(elementId) || null;
        // ── 优化：只下载一次，blob 贯穿整个流程 ──────────────
        let prefetchedBlob: Blob | null = null;
        if (resultUrl.startsWith('http://') || resultUrl.startsWith('https://')) {
            prefetchedBlob = await fetchRemoteBlob(resultUrl, `lovart-${source}-image`);
            if (prefetchedBlob) {
                primeRuntimeImageRenderSrc(elementId, prefetchedBlob);
            }
        }

        const finalContent = await normalizeGeneratedImageContent(resultUrl, source, prefetchedBlob);

        // normalize 成功后 blob 已存入 IndexedDB，从 DB 读比重新下载快几个数量级
        let imageMetrics = await resolveImageDisplayMetrics(finalContent, source, anchor ? {
            maxWidth: anchor.width,
            maxHeight: anchor.height,
            anchor,
        } : undefined, prefetchedBlob);

        // fallback: 如果归一化后的 imgref 无法读取尺寸，尝试用原始 URL 再测量一次
        if (!imageMetrics && finalContent !== resultUrl) {
            imageMetrics = await resolveImageDisplayMetrics(resultUrl, source, anchor ? {
                maxWidth: anchor.width,
                maxHeight: anchor.height,
                anchor,
            } : undefined, prefetchedBlob);
        }

        const fallbackMetrics = !imageMetrics
            ? resolveAspectRatioFallbackMetrics(previousElement?.selectedAspectRatio, anchor)
            : null;
        const effectiveMetrics = imageMetrics ?? fallbackMetrics;

        void persistGeneratedAssetToDisk(finalContent, 'image', source, prefetchedBlob);
        setElements(prev => prev.map((item) => {
            if (item.id !== elementId) {
                return item;
            }

            return {
                ...item,
                type: 'image',
                content: finalContent,
                flowReferenceImages: previousElement?.flowReferenceImages || previousElement?.savedReferenceImages,
                referenceImageId: undefined,
                savedReferenceImages: undefined,
                savedReferenceImage: undefined,
                selectedAspectRatio: effectiveMetrics?.aspectRatio ?? item.selectedAspectRatio,
                // 始终使用用户设定的 imageFit，覆盖中间态的 'cover'
                imageFit: workbenchSettings.defaultImageFit,
                imageSurface: item.imageSurface || workbenchSettings.defaultImageSurface,
                width: effectiveMetrics?.width ?? item.width,
                height: effectiveMetrics?.height ?? item.height,
                x: effectiveMetrics?.x ?? item.x,
                y: effectiveMetrics?.y ?? item.y,
                ...createGenerationIdlePatch(),
            };
        }));
        dirtyTrackerRef.current.markModified(elementId);
        // 清理 sessionStorage 中的生成记录
        const pid = currentProjectIdRef.current;
        if (pid) removeGeneration(pid, elementId);
        recordProjectMediaItem({
            kind: 'image',
            content: finalContent,
            sourceElement: previousElement,
            sourceElementId: elementId,
        });
    }, [normalizeGeneratedImageContent, persistGeneratedAssetToDisk, primeRuntimeImageRenderSrc, recordProjectMediaItem, resolveAspectRatioFallbackMetrics, resolveImageDisplayMetrics, setElements, workbenchSettings.defaultImageFit, workbenchSettings.defaultImageSurface]);

    const finalizePolledImageResult = useCallback(async (
        element: CanvasElement,
        resultUrl: string,
    ) => {
        if (element.type === 'image') {
            await finalizeAiEditedImageElement(
                element.id,
                resultUrl,
                'poll-ai-edit',
                {
                    x: element.x,
                    y: element.y,
                    width: element.width || 400,
                    height: element.height || 400,
                },
            );
            return;
        }

        // 立即展示图片预览（cover 填充，不会留白），让用户立刻看到生成结果位置
        replaceGeneratorWithPendingImage(element.id, resultUrl);

        // 后台异步归一化图片并校正尺寸
        await finalizeGeneratedImageElement(
            element.id,
            resultUrl,
            'poll',
            {
                x: element.x,
                y: element.y,
                width: element.width || 400,
                height: element.height || 400,
            },
        );
    }, [finalizeAiEditedImageElement, finalizeGeneratedImageElement, replaceGeneratorWithPendingImage]);

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

    const handleClearBenchmarkResults = useCallback(() => {
        clearCanvasBenchmarkResults();
        setBenchmarkResults([]);
        showToast('已清空压力测试记录', 'info');
    }, [showToast]);

    const handleZoomIn = useCallback(() => setScale(prev => Math.min(prev * 1.15, 8)), []);
    const handleZoomOut = useCallback(() => setScale(prev => Math.max(prev * 0.85, 0.05)), []);
    const handleZoomTo = useCallback((value: number) => setScale(Math.min(8, Math.max(0.05, value))), []);
    const handleFitToScreen = useCallback(() => {
        if (elements.length === 0) { setScale(1); setPan({ x: 0, y: 0 }); return; }
        const xs = elements.map(el => el.x);
        const ys = elements.map(el => el.y);
        const xe = elements.map(el => el.x + (el.width || 300));
        const ye = elements.map(el => el.y + (el.height || 300));
        const minX = Math.min(...xs), minY = Math.min(...ys);
        const maxX = Math.max(...xe), maxY = Math.max(...ye);
        const cw = maxX - minX, ch = maxY - minY;
        const vw = window.innerWidth - 120, vh = window.innerHeight - 120;
        const s = Math.min(vw / cw, vh / ch, 2);
        setScale(s);
        setPan({ x: (vw - cw * s) / 2 - minX * s + 60, y: (vh - ch * s) / 2 - minY * s + 60 });
    }, [elements]);

    const isSavingRef = useRef(false);
    const needsSaveRef = useRef(false);
    const mouseCanvasPosRef = useRef<{ x: number; y: number } | null>(null);

    const syncImageStoreCleanup = useCallback(async (currentElements: CanvasElement[]) => {
        try {
            const persistedRefs = await elementStore.collectAllImageRefs();
            const liveRefs = new Set<string>([
                ...persistedRefs,
                ...collectImageRefsFromElements(currentElements),
            ]);
            const removedCount = await cleanupUnusedImages(liveRefs);
            if (removedCount > 0) {
                console.log(`[ImageStore] Cleaned ${removedCount} orphaned images`);
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

            const isLegacyPresentation = !element.imageFit || !element.imageSurface;
            const shouldMeasure = isLegacyPresentation;
            const hasLocalizedContent = localizedContent !== originalContent;

            if (!shouldMeasure) {
                const changed = hasLocalizedContent || nextElement.imageFit !== element.imageFit || nextElement.imageSurface !== element.imageSurface;
                if (changed) {
                    normalizedIds.push(element.id);
                    batchNormalizedIds.push(element.id);
                }
                return { index, element: nextElement, changed };
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
                return { index, element: nextElement, changed };
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

            return {
                index,
                changed: hasVisualChange,
                element: {
                    ...nextElement,
                    width: metrics.width,
                    height: metrics.height,
                    x: metrics.x ?? nextElement.x,
                    y: metrics.y ?? nextElement.y,
                },
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

    // Save project to local database (增量保存)
    const saveProject = useCallback(async () => {
        if (!user) {
            console.log('Save skipped: No user logged in');
            setSaveStatus('offline');
            return;
        }

        if (!database) {
            console.log('Save skipped: local database client not initialized yet');
            return;
        }

        // Prevent concurrent saves
        if (isSavingRef.current) {
            needsSaveRef.current = true;
            return;
        }

        isSavingRef.current = true;
        const activeProjectId = currentProjectIdRef.current;
        const currentElements = Array.from(elementsMapRef.current.values());
        console.log('Starting save...', { userId: user.id, projectId: activeProjectId, elementsCount: currentElements.length });

        try {
            setSaveStatus('saving');
            const saveRevision = dirtyTrackerRef.current.revision;
            const savedElementIds = currentElements.map(el => el.id);
            const derivedThumbnail = await deriveProjectThumbnail(currentElements, uuidv4);
            const nextChunkSummary = buildCanvasChunkManifest(currentElements);
            // Only use derived thumbnail if project has no existing custom cover
            const thumbnail = existingThumbnailRef.current ? undefined : derivedThumbnail;

            // If we have a project ID, update it; otherwise create a new one
            if (activeProjectId) {
                // ─── 增量保存：只操作变更的元素 ───
                const changes = dirtyTrackerRef.current.getChanges();
                const elementMap = new Map(currentElements.map(el => [el.id, el]));
                const addedElements = changes.addedIds
                    .map(id => elementMap.get(id))
                    .filter((element): element is CanvasElement => !!element);
                const modifiedElements = changes.modifiedIds
                    .map(id => elementMap.get(id))
                    .filter((element): element is CanvasElement => !!element);

                const totalChanges = changes.addedIds.length + changes.modifiedIds.length + changes.removedIds.length;
                console.log(`Incremental save: ${changes.addedIds.length} added, ${changes.modifiedIds.length} modified, ${changes.removedIds.length} removed (total: ${totalChanges})`);

                await saveExistingCanvasProject({
                    database,
                    projectId: activeProjectId,
                    title,
                    thumbnail,
                    elementCount: currentElements.length,
                    addedElements,
                    modifiedElements,
                    removedIds: changes.removedIds,
                    chunkManifest: nextChunkSummary.manifest,
                    chunkStats: nextChunkSummary.stats,
                });

                // 仅在保存期间没有新的编辑/删除时，才清空当前脏状态
                if (!dirtyTrackerRef.current.markSavedIfUnchanged(saveRevision, savedElementIds)) {
                    needsSaveRef.current = true;
                }

            } else {
                // Create new project — 全量插入（首次保存）
                const newProjectId = uuidv4();
                const uniqueElements = Array.from(new Map(currentElements.map(item => [item.id, item])).values());

                await createCanvasProject({
                    database,
                    projectId: newProjectId,
                    title,
                    thumbnail,
                    elementCount: uniqueElements.length,
                    elements: uniqueElements,
                    chunkManifest: nextChunkSummary.manifest,
                    chunkStats: nextChunkSummary.stats,
                });

                currentProjectIdRef.current = newProjectId;
                setCurrentProjectId(newProjectId);
                const nextSearchParams = new URLSearchParams(searchParams.toString());
                nextSearchParams.set('id', newProjectId);
                window.history.pushState({}, '', `/canvas?${nextSearchParams.toString()}`);

                // 首次保存后，仅在无并发变更时才重置 tracker
                if (!dirtyTrackerRef.current.markSavedIfUnchanged(saveRevision, savedElementIds)) {
                    needsSaveRef.current = true;
                }
            }

            lastSavedTitleRef.current = title;
            titleDirtyRef.current = false;

            console.log('Save successful!');
            void syncImageStoreCleanup(currentElements);
            void refreshStorageEstimate();
            setSaveStatus('saved');
        } catch (error: unknown) {
            console.warn('Save project issue:', error instanceof Error ? error.message : error);
            setSaveStatus('offline');
        } finally {
            isSavingRef.current = false;
            // If changes happened while saving, trigger another save
            if (needsSaveRef.current) {
                needsSaveRef.current = false;
                saveProject();
            }
        }
    }, [user, database, title, searchParams, syncImageStoreCleanup, refreshStorageEstimate]);

    useEffect(() => {
        currentProjectIdRef.current = currentProjectId;
    }, [currentProjectId]);

    useEffect(() => {
        const prefs = loadStoryboardOverviewPrefs(currentProjectId);
        if (!prefs) {
            setStoryboardOverviewCollapsed(false);
            setAutoAdvanceStoryboardIssues(false);
            setAutoAdvanceStoryboardScope('issues');
            setStoryboardAuditFilter('all');
            return;
        }

        setStoryboardOverviewCollapsed(prefs.collapsed);
        setAutoAdvanceStoryboardIssues(prefs.autoAdvanceEnabled);
        setAutoAdvanceStoryboardScope(prefs.autoAdvanceScope);
        setStoryboardAuditFilter(prefs.auditFilter);
    }, [currentProjectId]);

    useEffect(() => {
        persistStoryboardOverviewPrefs(currentProjectId, {
            collapsed: storyboardOverviewCollapsed,
            autoAdvanceEnabled: autoAdvanceStoryboardIssues,
            autoAdvanceScope: autoAdvanceStoryboardScope,
            auditFilter: storyboardAuditFilter,
        });
    }, [autoAdvanceStoryboardIssues, autoAdvanceStoryboardScope, currentProjectId, storyboardAuditFilter, storyboardOverviewCollapsed]);

    // Load project from local database
    const loadProject = useCallback(async (id: string) => {
        if (!user) {
            console.log('Load skipped: No user logged in');
            setIsLoading(false);
            return;
        }

        if (!database) {
            console.log('Load skipped: local database client not initialized yet');
            return;
        }

        try {
            setIsLoading(true);
            setChunkPreheat({
                active: false,
                phase: 'idle',
                loadedChunks: 0,
                totalChunks: 0,
                loadedElements: 0,
                totalElements: 0,
            });
            console.log('Loading project:', id);

            const snapshot = await loadCanvasSession({
                database,
                projectId: id,
                onChunkProgress: ({ chunk, loadedChunkCount, totalChunks, loadedElementCount, totalElementCount }) => {
                    setChunkPreheat({
                        active: true,
                        phase: loadedChunkCount < totalChunks ? 'preheating' : 'idle',
                        loadedChunks: loadedChunkCount,
                        totalChunks,
                        loadedElements: loadedElementCount,
                        totalElements: totalElementCount,
                        currentChunkLabel: chunk.label,
                    });
                },
            });

            if (!snapshot) {
                console.log('Project not found in database, treating as new project');
                setIsLoading(false);
                isInitializedRef.current = true;
                return;
            }

            // Apply header
            setTitle(snapshot.header.title);
            lastSavedTitleRef.current = snapshot.header.title;
            titleDirtyRef.current = false;
            existingThumbnailRef.current = snapshot.header.thumbnail;

            const uniqueElements = snapshot.elements;
            console.log('Canvas elements loaded:', uniqueElements.length);

            if (uniqueElements.length > 0) {
                // ── 从 sessionStorage 恢复未完成的生成任务 ──
                const pendingGens = snapshot.pendingGenerations;
                const pendingKeys = Object.keys(pendingGens);
                let restoredElements = uniqueElements;
                if (pendingKeys.length > 0) {
                    console.log(`[GenPersist] Restoring ${pendingKeys.length} pending generation tasks from sessionStorage`);
                    restoredElements = uniqueElements.map(el => {
                        const pending = pendingGens[el.id];
                        if (pending && !el.generatingTaskId) {
                            return {
                                ...el,
                                generatingTaskId: pending.taskId,
                                generatingTaskType: pending.taskType,
                                generatingProgress: pending.progress,
                            };
                        }
                        return el;
                    });
                    // 标记恢复的元素后续需要持久化到 DB
                    migrationPendingRef.current = Array.from(new Set([
                        ...migrationPendingRef.current,
                        ...pendingKeys.filter(eid => restoredElements.some(el => el.id === eid && el.generatingTaskId)),
                    ]));
                }

                // ── 将 base64 图片迁移到 ImageStore（首次加载时一次性完成）──
                const { elements: migratedElements, migratedCount } =
                    await migrateElementsToImageStore(restoredElements);
                setElements(migratedElements);

                // 标记迁移的元素 ID，后续初始化 dirty tracker 后持久化
                if (migratedCount > 0) {
                    migrationPendingRef.current = Array.from(new Set([
                        ...migrationPendingRef.current,
                        ...migratedElements
                            .filter((element) => element.type === 'image' && isImageRef(element.content))
                            .map((element) => element.id),
                    ]));
                    if (migratedCount > 0) {
                        console.log(`[Migration] ${migratedCount} images migrated, will persist on next save`);
                    }
                }

                void syncImageStoreCleanup(migratedElements);

                void (async () => {
                    const { elements: normalizedElements, normalizedIds } =
                        await normalizeLoadedImageElements(migratedElements, {
                            onProgress: (partialElements, partialIds) => {
                                migrationPendingRef.current = Array.from(new Set([
                                    ...migrationPendingRef.current,
                                    ...partialIds,
                                ]));

                                if (historyInitializedRef.current) {
                                    for (const id of partialIds) {
                                        dirtyTrackerRef.current.markModified(id);
                                    }
                                }

                                setElements(partialElements);
                            },
                        });

                    if (normalizedIds.length > 0) {
                        migrationPendingRef.current = Array.from(new Set([
                            ...migrationPendingRef.current,
                            ...normalizedIds,
                        ]));
                        if (historyInitializedRef.current) {
                            for (const id of normalizedIds) {
                                dirtyTrackerRef.current.markModified(id);
                            }
                        }
                        setElements(normalizedElements);
                        console.log(`[Workbench] Corrected ${normalizedIds.length} legacy image placements on load`);
                    }

                    void syncImageStoreCleanup(normalizedElements);
                })();
            } else {
                console.log('No canvas elements found for this project');
                setElements([]);
                void syncImageStoreCleanup([]);
            }
        } catch (error: unknown) {
            console.error('Failed to load project:', error);
        } finally {
            setChunkPreheat((prev) => ({
                ...prev,
                phase: 'idle',
                active: prev.totalChunks > 0 && prev.loadedChunks < prev.totalChunks,
            }));
            // ── 恢复上次的视口位置（pan/scale）──
            const savedViewport = loadViewportState(id);
            if (savedViewport) {
                setScale(savedViewport.scale);
                setPan({ x: savedViewport.panX, y: savedViewport.panY });
                console.log(`[Viewport] Restored: scale=${savedViewport.scale.toFixed(2)}, pan=(${Math.round(savedViewport.panX)}, ${Math.round(savedViewport.panY)})`);
            }
            setIsLoading(false);
        }
    }, [user, database, syncImageStoreCleanup, normalizeLoadedImageElements, setElements]);

    // Load project on mount if ID is provided
    const hasLoadedRef = useRef(false);
    useEffect(() => {
        if (projectId && user && database && !hasLoadedRef.current) {
            hasLoadedRef.current = true;
            loadProject(projectId);
        } else if (!projectId) {
            setIsLoading(false);
            // Mark as initialized for new projects
            isInitializedRef.current = true;
            // Check if there's a name in URL for new projects
            const nameParam = searchParams.get('name');
            if (nameParam) {
                setTitle(nameParam);
                lastSavedTitleRef.current = nameParam;
            } else {
                lastSavedTitleRef.current = '未命名';
            }
            titleDirtyRef.current = false;
        }

        // Check if there's a prompt in URL
        const prompt = searchParams.get('prompt');
        if (prompt) {
            setInitialPrompt(prompt);
            openChat();
        }
    }, [projectId, user, database, loadProject, openChat, searchParams]);

    // Mark as initialized after loading completes
    useEffect(() => {
        if (!isLoading && !isInitializedRef.current && hasLoadedRef.current) {
            // Only mark as initialized after a successful load
            console.log('Marking as initialized after load complete');
            isInitializedRef.current = true;
        }
    }, [isLoading]);

    // ──── 差分 Undo/Redo（替代全量 JSON 深拷贝）────────────────
    const historyManagerRef = useRef<HistoryManager>(new HistoryManager({ maxPatches: 100 }));
    const dirtyTrackerRef = useRef<DirtyTracker>(new DirtyTracker());
    const historyInitializedRef = useRef(false);
    const historyChangedIdsRef = useRef<Set<string>>(new Set());
    const historyNeedsFullRecordRef = useRef(true);
    const historyTransactionRef = useRef<PatchMetadata | null>(null);

    // ──── R-Tree 空间索引 — O(log n) 视口裁剪 / 吸附检测 ────────
    const spatialIndexRef = useRef<SpatialIndex>(new SpatialIndex());
    const spatialIndexNeedsRebuildRef = useRef(true);

    // ── 会话运行时控制器：自动保存、卸载刷新、beforeunload、孤立生成恢复 ──
    useCanvasSessionRuntime({
        user,
        isLoading,
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

    // 初始化 HistoryManager & DirtyTracker（在数据加载完成后）
    useEffect(() => {
        if (!isInitializedRef.current) return;
        if (historyInitializedRef.current) return;
        historyInitializedRef.current = true;
        historyManagerRef.current.initialize(elements);
        dirtyTrackerRef.current.initialize(elements.map(el => el.id));
        historyChangedIdsRef.current.clear();
        historyNeedsFullRecordRef.current = false;
        updateHistorySummary('初始状态');

        // 如果有迁移待持久化的元素，标记为 modified 以便下次保存写入 refs
        if (migrationPendingRef.current.length > 0) {
            for (const id of migrationPendingRef.current) {
                dirtyTrackerRef.current.markModified(id);
            }
            migrationPendingRef.current = [];
        }
    }, [elements, setElements, updateHistorySummary]);

    // Record history on element changes (debounced)
    const historyTimerRef = useRef<NodeJS.Timeout | null>(null);
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

        // 清理已删除元素的生成任务记录
        const pid = currentProjectIdRef.current;
        if (pid) {
            for (const id of uniqueIds) {
                removeGeneration(pid, id);
                clearSubmission(pid, id);
            }
        }

        setElementsVersion(v => v + 1);
        setSelectedIds(prev => prev.filter(selectedId => !idSet.has(selectedId)));
    }, []);

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

    // ── O(1) element operations via direct Map mutation ──────────────────

    const handleElementChange = useCallback((id: string, newAttrs: Partial<CanvasElement>) => {
        const map = elementsMapRef.current;
        const el = map.get(id);
        if (el) {
            const changedEntries = Object.entries(newAttrs).filter(([key, value]) => !Object.is(el[key as keyof CanvasElement], value));
            if (changedEntries.length === 0) {
                return;
            }

            const updated = {
                ...el,
                ...Object.fromEntries(changedEntries),
            };
            map.set(id, updated);
            historyChangedIdsRef.current.add(id);
            historyManagerRef.current.touchTransactionIds([id]);
            spatialIndexRef.current.update(updated);
            setElementsVersion(v => v + 1);

            // 生成任务变更时同步写入 sessionStorage
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
    }, []);

    const handleDelete = useCallback((id: string) => {
        removeElementsByIds([id]);
    }, [removeElementsByIds]);

    /** 添加单个元素（带脏追踪）— O(1) */
    const addElement = useCallback((element: CanvasElement) => {
        elementsMapRef.current.set(element.id, element);
        historyChangedIdsRef.current.add(element.id);
        historyManagerRef.current.touchTransactionIds([element.id]);
        spatialIndexRef.current.insert(element);
        setElementsVersion(v => v + 1);
        dirtyTrackerRef.current.markAdded(element.id);
        // 如果新元素带有生成任务，同步写入 sessionStorage
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
    }, []);

    /** 添加多个元素（带脏追踪）— O(k) */
    const addElements = useCallback((newElements: CanvasElement[]) => {
        const map = elementsMapRef.current;
        for (const el of newElements) {
            map.set(el.id, el);
            historyChangedIdsRef.current.add(el.id);
        }
        historyManagerRef.current.touchTransactionIds(newElements.map(el => el.id));
        spatialIndexRef.current.batchUpdate(newElements);
        setElementsVersion(v => v + 1);
        for (const el of newElements) {
            dirtyTrackerRef.current.markAdded(el.id);
        }
    }, []);

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

    const duplicateElementsByIds = useCallback((ids: string[], anchor?: { x: number; y: number }) => {
        const sourceElements = elements.filter(el => ids.includes(el.id));
        if (sourceElements.length === 0) return [];

        const minX = Math.min(...sourceElements.map(el => el.x));
        const minY = Math.min(...sourceElements.map(el => el.y));
        const targetX = anchor?.x ?? minX + 30;
        const targetY = anchor?.y ?? minY + 30;
        const offsetX = targetX - minX;
        const offsetY = targetY - minY;

        const copies = sourceElements.map(el => ({
            ...cloneCanvasElement(el),
            id: uuidv4(),
            x: el.x + offsetX,
            y: el.y + offsetY,
        }));

        addElements(copies);
        setSelectedIds(copies.map(copy => copy.id));
        return copies;
    }, [addElements, cloneCanvasElement, elements]);

    const handleCopySelection = useCallback((ids: string[]) => {
        const expandedIds = collectSelectionWithFrameChildren(ids);
        clipboardRef.current = elements
            .filter(el => expandedIds.includes(el.id))
            .map(cloneCanvasElement);
        showToast(`已复制 ${expandedIds.length} 个元素`, 'success');
    }, [cloneCanvasElement, collectSelectionWithFrameChildren, elements, showToast]);

    const handleCutSelection = useCallback((ids: string[]) => {
        const expandedIds = collectSelectionWithFrameChildren(ids);
        clipboardRef.current = elements
            .filter(el => expandedIds.includes(el.id))
            .map(cloneCanvasElement);
        runHistoryTransaction({ label: '剪切元素', source: 'clipboard-cut' }, () => {
            removeElementsByIds(expandedIds);
            showToast(`已剪切 ${expandedIds.length} 个元素`, 'success');
            return { selectionAfter: [] };
        });
    }, [cloneCanvasElement, collectSelectionWithFrameChildren, elements, removeElementsByIds, runHistoryTransaction, showToast]);

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
            showToast(`已粘贴 ${copies.length} 个元素`, 'success');
            return { selectionAfter: copies.map(copy => copy.id) };
        });
    }, [addElements, cloneCanvasElement, runHistoryTransaction, showToast]);

    const handleDuplicateSelection = useCallback((ids: string[], anchor?: { x: number; y: number }) => {
        runHistoryTransaction({ label: '复制副本', source: 'selection-duplicate' }, () => {
            const copies = duplicateElementsByIds(ids, anchor);
            if (copies.length > 0) {
                showToast(`已创建 ${copies.length} 个副本`, 'success');
            }
            return { selectionAfter: copies.map(copy => copy.id) };
        });
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

    // sanitizeToolName, sanitizeFilenameStem, getElementBaseName, buildToolResultNames,
    // resolveToolResultNaming — now imported from canvas-page-utils

    const runCanvasBenchmark = useCallback(async (count: number, mode: 'replace' | 'append' = 'replace') => {
        setIsBenchmarkRunning(true);
        showToast(`开始执行 ${count} 张图片压力测试...`, 'info');

        try {
            const start = performance.now();
            const seeds = generateBenchmarkSeeds(count);
            const refs = await mapWithConcurrency(seeds, IMAGE_IMPORT_CONCURRENCY, async (seed) => {
                const content = await ensureImageRef(seed.content);
                return content;
            });

            const generatedElements: CanvasElement[] = refs.map((content, index) => ({
                id: uuidv4(),
                type: 'image',
                x: seeds[index].x,
                y: seeds[index].y,
                width: seeds[index].width,
                height: seeds[index].height,
                content,
                ...getDefaultImagePresentation(workbenchSettings),
            }));

            if (mode === 'append') {
                addElements(generatedElements);
            } else {
                setElements(generatedElements);
                setSelectedIds([]);
            }

            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            await refreshStorageEstimate();
            const end = performance.now();
            const latestEstimate = await getStorageEstimateInfo();
            const results = saveCanvasBenchmarkResult({
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                count,
                durationMs: Math.round((end - start) * 100) / 100,
                storageUsageBytes: latestEstimate?.usageBytes ?? 0,
                quotaBytes: latestEstimate?.quotaBytes ?? 0,
                mode,
            });
            setBenchmarkResults(results);
            showToast(`压力测试完成：${count} 张 / ${Math.round(end - start)} ms`, 'success');
        } catch (error) {
            console.error('[Benchmark] Failed:', error);
            showToast('压力测试执行失败', 'error');
        } finally {
            setIsBenchmarkRunning(false);
        }
    }, [addElements, refreshStorageEstimate, setElements, showToast, workbenchSettings]);

    /** 批量更新多个元素属性（拖拽 N 个元素时只触发一次 re-render）— O(k) */
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
            const el = map.get(id);
            if (el) {
                const updated = { ...el, ...attrs };
                map.set(id, updated);
                updatedElements.push(updated);
                historyChangedIdsRef.current.add(id);
            }
        }
        historyManagerRef.current.touchTransactionIds(changes.map(change => change.id));
        if (updatedElements.length > 0) {
            spatialIndexRef.current.batchUpdate(updatedElements);
        }
        setElementsVersion(v => v + 1);
        for (const change of changes) {
            dirtyTrackerRef.current.markModified(change.id);
        }
        if (shouldAutoTransaction) {
            commitHistoryTransaction();
        }
    }, [beginHistoryTransaction, commitHistoryTransaction]);

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

    const beginImageToolSubmission = useCallback((params: {
        setSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
        setStatus: React.Dispatch<React.SetStateAction<string>>;
        loadingToast: string;
    }) => {
        params.setSubmitting(true);
        params.setStatus('正在读取原图...');
        showToast(params.loadingToast, 'info');
    }, [showToast]);

    const endImageToolSubmission = useCallback((
        setSubmitting: React.Dispatch<React.SetStateAction<boolean>>,
        setStatus: React.Dispatch<React.SetStateAction<string>>,
    ) => {
        setSubmitting(false);
        setStatus('');
    }, []);

    const ensureImageToolSource = useCallback((
        element: CanvasElement,
        errorMessage: string,
    ): element is CanvasElement & { type: 'image'; content: string } => {
        if (element.type === 'image' && element.content) {
            return true;
        }

        showToast(errorMessage, 'error');
        return false;
    }, [showToast]);

    // buildCenteredElementBounds — imported from canvas-element-ops

    const buildBelowElementDisplayMetricsOptions = useCallback((element: CanvasElement, maxHeightPadding = 0) => {
        const width = element.width || 400;
        const height = (element.height || 400) + maxHeightPadding;
        return {
            maxWidth: width,
            maxHeight: height,
            anchor: {
                x: element.x,
                y: element.y + (element.height || 0) + 40,
                width,
                height,
            },
        };
    }, []);

    const buildImageElement = useCallback((attrs: Omit<CanvasElement, 'id' | 'type'>) => {
        return {
            id: uuidv4(),
            type: 'image' as const,
            ...attrs,
            ...getDefaultImagePresentation(workbenchSettings),
        } satisfies CanvasElement;
    }, [workbenchSettings]);

    const buildBelowSourceImageResultElement = useCallback((params: {
        source: CanvasElement;
        metrics?: { x?: number; y?: number; width: number; height: number } | null;
        content: string;
        displayName?: string;
        extraAttrs?: Partial<CanvasElement>;
    }) => {
        const { source, metrics, content, displayName, extraAttrs } = params;
        return buildImageElement({
            x: metrics?.x ?? source.x,
            y: metrics?.y ?? source.y + (source.height || 0) + 40,
            width: metrics?.width ?? source.width,
            height: metrics?.height ?? source.height,
            displayName,
            content,
            ...extraAttrs,
        });
    }, [buildImageElement]);

    const buildVideoElement = useCallback((attrs: Omit<CanvasElement, 'id' | 'type'>) => {
        return {
            id: uuidv4(),
            type: 'video' as const,
            ...attrs,
        } satisfies CanvasElement;
    }, []);

    const buildGeneratorElement = useCallback((
        type: Extract<CanvasElement['type'], 'image-generator' | 'video-generator' | 'storyboard-planner'>,
        attrs: Omit<CanvasElement, 'id' | 'type'>,
    ) => {
        return {
            id: uuidv4(),
            type,
            ...attrs,
        } satisfies CanvasElement;
    }, []);

    const resolveCanvasContentBlob = useCallback(async (content: string, remoteFilename: string) => {
        return _resolveCanvasContentBlob(content, remoteFilename, { getImageBlob, dataUrlToBlob, fetchRemoteBlob });
    }, []);

    const handleAddImage = useCallback(async (files: File | File[], dropPosition?: { x: number; y: number }) => {
        const fileArray = Array.isArray(files) ? files : [files];
        if (fileArray.length === 0) return;

        const center = dropPosition || getPlacementPosition();
        setActiveTool('select');

        const importedElements: Array<CanvasElement | null> = await mapWithConcurrency(fileArray, IMAGE_IMPORT_CONCURRENCY, async (file, index) => {
            try {
                const { width: naturalWidth, height: naturalHeight } = await readImageDimensions(file);
                const { width, height } = getCanvasDisplaySize(naturalWidth, naturalHeight);
                const content = await saveImageBlob(file);
                if (!content) return null;

                return {
                    id: uuidv4(),
                    type: 'image',
                    x: center.x - width / 2 + index * 40,
                    y: center.y - height / 2 + index * 40,
                    width,
                    height,
                    content,
                    ...getDefaultImagePresentation(workbenchSettings),
                } satisfies CanvasElement;
            } catch (error) {
                console.warn('[Canvas] Failed to import image:', file.name, error);
                return null;
            }
        });

        const newElements = importedElements.filter((element): element is CanvasElement => element !== null);
        if (newElements.length > 0) {
            addElements(newElements);
            setSelectedIds(newElements.map(element => element.id));
            void refreshStorageEstimate();
        }

        if (newElements.length !== fileArray.length) {
            showToast(`成功导入 ${newElements.length}/${fileArray.length} 张图片`, newElements.length > 0 ? 'info' : 'error');
        }
    }, [getPlacementPosition, addElements, showToast, refreshStorageEstimate, workbenchSettings]);

    const handleAddVideo = useCallback(async (file: File, dropPosition?: { x: number; y: number }) => {
        const center = dropPosition || getPlacementPosition();
        const elementId = uuidv4();

        // Quick check: try to decode a frame to see if browser supports this codec
        const needsTranscode = await new Promise<boolean>((resolve) => {
            const testVideo = document.createElement('video');
            testVideo.muted = true;
            testVideo.playsInline = true;
            testVideo.preload = 'auto';
            const testUrl = URL.createObjectURL(file);
            testVideo.src = testUrl;

            const cleanup = () => { URL.revokeObjectURL(testUrl); testVideo.remove(); };
            const timer = setTimeout(() => { cleanup(); resolve(true); }, 3000); // timeout = assume needs transcode

            testVideo.onloadedmetadata = () => {
                if (testVideo.videoWidth === 0 || testVideo.videoHeight === 0) {
                    clearTimeout(timer); cleanup(); resolve(true);
                } else {
                    // Has dimensions, try to seek and check a frame
                    testVideo.currentTime = 0.1;
                }
            };
            testVideo.onseeked = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = testVideo.videoWidth;
                    canvas.height = testVideo.videoHeight;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(testVideo, 0, 0);
                    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                    let nonBlack = 0;
                    for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
                        if (data[i] > 5 || data[i+1] > 5 || data[i+2] > 5) nonBlack++;
                    }
                    clearTimeout(timer); cleanup();
                    resolve(nonBlack < (canvas.width * canvas.height / 4) * 0.01);
                } catch { clearTimeout(timer); cleanup(); resolve(true); }
            };
            testVideo.onerror = () => { clearTimeout(timer); cleanup(); resolve(true); };
        });

        if (!needsTranscode) {
            // Browser can play this format directly
            const blobUrl = URL.createObjectURL(file);
            const newElement: CanvasElement = {
                ...buildVideoElement({
                    ...buildCenteredElementBounds(center, 400, 300),
                    content: blobUrl,
                }),
                id: elementId,
            };
            addAndFocusElement(newElement);
            return;
        }

        // Needs transcoding - show placeholder and transcode via server
        console.log('[video] Format not supported by browser, transcoding...');
        setTranscodingStatus(`正在转码视频 "${file.name}"...`);

        // Add placeholder element immediately
        const placeholderElement: CanvasElement = {
            ...buildVideoElement({
                ...buildCenteredElementBounds(center, 400, 300),
                content: '',
            }),
            id: elementId,
        };
        addAndFocusElement(placeholderElement);

        try {
            const formData = new FormData();
            formData.append('video', file);

            const response = await fetch('/api/transcode-video', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `转码失败: ${response.status}`);
            }

            const mp4Blob = await response.blob();
            const blobUrl = URL.createObjectURL(mp4Blob);

            // Update placeholder with real video
            setElements(prev => prev.map(el =>
                el.id === elementId ? { ...el, content: blobUrl } : el
            ));
            setTranscodingStatus(null);
            console.log('[video] Transcode complete');
        } catch (error: unknown) {
            console.error('[video] Transcode failed:', error);
            setTranscodingStatus(null);
            // Remove placeholder on failure
            removeElementsByIds([elementId]);
            const message = error instanceof Error ? error.message : '未知错误';
            alert(`视频转码失败: ${message}\n\n请尝试用 H.264 编码的 MP4 文件。`);
        }
    }, [getPlacementPosition, removeElementsByIds, setElements, addAndFocusElement, buildCenteredElementBounds, buildVideoElement]);

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
    }, [getPlacementPosition, addAndFocusElement, buildCenteredElementBounds, buildGeneratorElement]);
    openImageGeneratorRef.current = handleOpenImageGenerator;

    useCanvasKeyboardShortcuts({
        elements,
        selectedIds,
        clipboardRef,
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
    }, [getPlacementPosition, addAndFocusElement, buildCenteredElementBounds, buildGeneratorElement]);

    const handleOpenStoryboardPlanner = useCallback(() => {
        const center = getPlacementPosition();
        const newElement = buildGeneratorElement('storyboard-planner', buildCenteredElementBounds(center, 420, 320));
        addAndFocusElement(newElement);
    }, [addAndFocusElement, buildCenteredElementBounds, buildGeneratorElement, getPlacementPosition]);

    const handleStoryboardPlanFromImage = useCallback((element: CanvasElement) => {
        if (element.type !== 'image' || !element.content) {
            return;
        }

        setStoryboardPlannerSourceElementId(element.id);
        setSelectedIds([element.id]);
    }, []);

    const handleCreateStoryboardDraft = useCallback((plan: StoryboardPlanResponse, referenceImages: string[], generatedStoryboardImage?: string | null, combinedPrompt?: string) => {
        if (plan.shots.length === 0) {
            showToast('分镜结果为空，无法导入画布', 'error');
            return;
        }

        void (async () => {
            const center = getPlacementPosition();
            const groupName = plan.title?.trim() || `${plan.mode === 'story' ? '故事' : '分镜'}规划草稿`;
            const columns = plan.shots.length === 4
                ? 2
                : plan.shots.length === 6
                    ? 3
                    : plan.shots.length === 9
                        ? 3
                        : plan.shots.length === 12
                            ? 4
                            : plan.shots.length === 16
                                ? 4
                                : plan.shots.length <= 8
                                    ? 3
                                    : 4;
            const rows = Math.ceil(plan.shots.length / columns);

            if (generatedStoryboardImage) {
                const boardWidth = Math.min(1280, columns * 260);
                const boardHeight = Math.round(boardWidth * rows / columns);
                const localizedBoardContent = await normalizeGeneratedImageContent(generatedStoryboardImage, 'storyboard-board');
                const boardElement = buildImageElement({
                    ...buildCenteredElementBounds(center, boardWidth, boardHeight),
                    displayName: `${groupName} · 宫格总图`,
                    content: localizedBoardContent,
                    savedPrompt: combinedPrompt?.trim() || plan.summary,
                    savedReferenceImages: referenceImages.length > 0 ? JSON.stringify(referenceImages) : undefined,
                    selectedModel: workbenchSettings.imageDefaults.model,
                    selectedAspectRatio: workbenchSettings.imageDefaults.aspectRatio,
                    selectedImageSize: workbenchSettings.imageDefaults.imageSize,
                });

                addElementsWithOptionalAutoGroup([boardElement], groupName);
                setStoryboardPlannerSourceElementId(null);
                showToast(`已导入 1 张 ${plan.shots.length} 格分镜宫格图到画布`, 'success');
                return;
            }

            const cellWidth = 360;
            const cellHeight = 270;
            const gap = 48;
            const totalWidth = columns * cellWidth + Math.max(0, columns - 1) * gap;
            const totalHeight = rows * cellHeight + Math.max(0, rows - 1) * gap;
            const originX = center.x - totalWidth / 2;
            const originY = center.y - totalHeight / 2;

            const draftElements = plan.shots.map((shot, index) => {
                const row = Math.floor(index / columns);
                const col = index % columns;
                const scopedReferenceImages = shot.referenceImageIndexes.length > 0
                    ? shot.referenceImageIndexes
                        .map((item) => referenceImages[item - 1])
                        .filter((item): item is string => typeof item === 'string' && item.length > 0)
                    : referenceImages;

                const placeholderContent = buildStoryboardPlaceholderDataUrl({
                    shotCode: shot.shotCode,
                    sceneType: shot.sceneType,
                    cameraMove: shot.cameraMove,
                    duration: shot.duration,
                    note: shot.note,
                    prompt: shot.promptZh?.trim() || shot.note,
                });

                return buildImageElement({
                    x: originX + col * (cellWidth + gap),
                    y: originY + row * (cellHeight + gap),
                    width: cellWidth,
                    height: cellHeight,
                    displayName: [shot.shotCode, shot.sceneType].filter(Boolean).join(' · '),
                    content: placeholderContent,
                    savedPrompt: shot.promptZh?.trim() || shot.note,
                    savedReferenceImages: scopedReferenceImages.length > 0 ? JSON.stringify(scopedReferenceImages) : undefined,
                    storyboardShotCode: shot.shotCode,
                    storyboardSceneType: shot.sceneType,
                    storyboardCameraMove: shot.cameraMove,
                    storyboardDuration: shot.duration,
                    storyboardNote: shot.note,
                    selectedModel: workbenchSettings.imageDefaults.model,
                    selectedAspectRatio: workbenchSettings.imageDefaults.aspectRatio,
                    selectedImageSize: workbenchSettings.imageDefaults.imageSize,
                });
            });

            addElementsWithOptionalAutoGroup(draftElements, groupName);
            setStoryboardPlannerSourceElementId(null);
            showToast(
                `宫格总图生成失败，已导入 ${draftElements.length} 个可编辑分镜卡片到画布`,
                'success',
            );
        })();
    }, [addElementsWithOptionalAutoGroup, buildImageElement, getPlacementPosition, normalizeGeneratedImageContent, showToast, workbenchSettings.imageDefaults.aspectRatio, workbenchSettings.imageDefaults.imageSize, workbenchSettings.imageDefaults.model]);

    const handleGenerateVideo = useCallback(async (videoUrl: string) => {
        const generatorElement = selectedIds
            .map((id) => elements.find((element) => element.id === id))
            .find((element): element is CanvasElement => !!element && element.type === 'video-generator') || null;
        void persistGeneratedAssetToDisk(videoUrl, 'video', 'generate');
        const generatorElementId = selectedIds.find(id => elements.find(el => el.id === id)?.type === 'video-generator');

        if (generatorElementId) {
            setElements(prev => prev.map(el => {
                if (el.id === generatorElementId) {
                    return { ...el, type: 'video', content: videoUrl };
                }
                return el;
            }));
        } else {
            const center = getPlacementPosition();
            const newElement = buildVideoElement({
                ...buildCenteredElementBounds(center, 400, 300),
                content: videoUrl,
            });
            addAndSelectElement(newElement);
        }
        recordProjectMediaItem({
            kind: 'video',
            content: videoUrl,
            sourceElement: generatorElement,
            sourceElementId: generatorElementId,
        });
    }, [selectedIds, elements, getPlacementPosition, setElements, persistGeneratedAssetToDisk, buildCenteredElementBounds, buildVideoElement, addAndSelectElement, recordProjectMediaItem]);

    const handleRecoverVideoTask = useCallback(async (elementId: string, rawTaskId: string) => {
        const taskId = rawTaskId.trim();
        if (!taskId) {
            throw new Error('请输入有效的 task_id');
        }

        const currentElement = elementsMapRef.current.get(elementId);
        if (!currentElement || currentElement.type !== 'video-generator') {
            throw new Error('当前视频生成器不存在，无法恢复任务');
        }

        const projectId = currentProjectIdRef.current;
        setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, true));

        try {
            const result = await pollGenerationTask(taskId, 'video');

            if (result.status === 'completed') {
                const resultUrl = result.resultUrl;
                if (!resultUrl) {
                    throw new Error('任务已完成，但未获取到视频结果链接');
                }

                void persistGeneratedAssetToDisk(resultUrl, 'video', 'manual-recover');
                setElements((prev) => applyVideoGenerationSuccess(prev, elementId, resultUrl));
                dirtyTrackerRef.current.markModified(elementId);
                if (projectId) {
                    clearSubmission(projectId, elementId);
                    removeGeneration(projectId, elementId);
                }
                recordProjectMediaItem({
                    kind: 'video',
                    content: resultUrl,
                    sourceElement: currentElement,
                    sourceElementId: elementId,
                });
                announceCompletedResult(elementId, '✅ 已通过 task_id 找回视频结果');
                return;
            }

            if (result.status === 'failed') {
                failGenerationTask(elementId, 'video', result.error);
                return;
            }

            if (result.status === 'retryable-error') {
                throw new Error(result.error);
            }

            setElements((prev) => applyElementGenerationPatch(
                prev,
                elementId,
                createGenerationTaskPatch(taskId, 'video', Math.max(0, result.progress || 0)),
            ));
            dirtyTrackerRef.current.markModified(elementId);
            if (projectId) {
                clearSubmission(projectId, elementId);
                persistGeneration(projectId, elementId, {
                    taskId,
                    taskType: 'video',
                    progress: Math.max(0, result.progress || 0),
                    savedPrompt: currentElement.savedPrompt,
                });
            }
            showToast('已接管视频任务，后续将继续自动轮询', 'success');
        } finally {
            setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, false));
        }
    }, [announceCompletedResult, failGenerationTask, persistGeneratedAssetToDisk, recordProjectMediaItem, setElements, showToast]);

    const handleRecoverImageTask = useCallback(async (elementId: string, rawTaskId: string) => {
        const taskId = rawTaskId.trim();
        if (!taskId) {
            throw new Error('请输入有效的 task_id');
        }

        const currentElement = elementsMapRef.current.get(elementId);
        if (!currentElement || currentElement.type !== 'image-generator') {
            throw new Error('当前图片生成器不存在，无法恢复任务');
        }

        const projectId = currentProjectIdRef.current;
        setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, true));

        try {
            const result = await pollGenerationTask(taskId, 'image');

            if (result.status === 'completed') {
                const resultUrl = result.resultUrl;
                if (!resultUrl) {
                    throw new Error('任务已完成，但未获取到图片结果链接');
                }

                replaceGeneratorWithPendingImage(elementId, resultUrl);
                await finalizeGeneratedImageElement(
                    elementId,
                    resultUrl,
                    'manual-recover',
                    {
                        x: currentElement.x,
                        y: currentElement.y,
                        width: currentElement.width || 400,
                        height: currentElement.height || 400,
                    },
                );
                if (projectId) {
                    clearSubmission(projectId, elementId);
                    removeGeneration(projectId, elementId);
                }
                announceCompletedResult(elementId, '✅ 已通过 task_id 找回图片结果');
                return;
            }

            if (result.status === 'failed') {
                failGenerationTask(elementId, 'image', result.error);
                return;
            }

            if (result.status === 'retryable-error') {
                throw new Error(result.error);
            }

            setElements((prev) => applyElementGenerationPatch(
                prev,
                elementId,
                createGenerationTaskPatch(taskId, 'image', Math.max(0, result.progress || 0)),
            ));
            dirtyTrackerRef.current.markModified(elementId);
            if (projectId) {
                clearSubmission(projectId, elementId);
                persistGeneration(projectId, elementId, {
                    taskId,
                    taskType: 'image',
                    progress: Math.max(0, result.progress || 0),
                    savedPrompt: currentElement.savedPrompt,
                });
            }
            showToast('已接管图片任务，后续将继续自动轮询', 'success');
        } finally {
            setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, false));
        }
    }, [announceCompletedResult, failGenerationTask, finalizeGeneratedImageElement, replaceGeneratorWithPendingImage, setElements, showToast]);

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

    const submitStoryboardGeneratorElement = useCallback(async (elementId: string, snapshot?: CanvasElement) => {
        const currentElement = snapshot || elementsMapRef.current.get(elementId);
        if (!currentElement || currentElement.type !== 'image-generator') {
            return false;
        }

        const prompt = currentElement.savedPrompt?.trim() || currentElement.storyboardNote?.trim();
        if (!prompt) {
            setElements((prev) => applyGenerationFailure(prev, elementId, '分镜卡片缺少提示词，无法提交生成'));
            dirtyTrackerRef.current.markModified(elementId);
            return false;
        }

        const model = currentElement.selectedModel || workbenchSettings.imageDefaults.model;
        const aspectRatio = currentElement.selectedAspectRatio || workbenchSettings.imageDefaults.aspectRatio;
        const imageSize = currentElement.selectedImageSize || workbenchSettings.imageDefaults.imageSize;
        const referenceImages = await resolveElementReferenceImages(currentElement);
        const projectId = currentProjectIdRef.current;

        setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, true));
        if (projectId) {
            persistSubmission(projectId, elementId, {
                prompt,
                model,
                aspectRatio,
                imageSize,
                taskType: 'image',
                timestamp: Date.now(),
            });
        }

        setElements((prev) => applyElementGenerationPatch(
            prev,
            elementId,
            createGenerationIdlePatch({ progress: 0 }),
        ));
        dirtyTrackerRef.current.markModified(elementId);

        try {
            const data = await runImageGenerationFlow({
                prompt,
                model,
                aspectRatio,
                imageSize,
                referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
                preferDirect: true,
                forceAsync: true,
            });

            if (projectId) {
                clearSubmission(projectId, elementId);
            }

            if (data.status === 'pending') {
                const taskId = data.taskId;
                setElements((prev) => applyElementGenerationPatch(prev, elementId, createGenerationTaskPatch(taskId, 'image')));
                dirtyTrackerRef.current.markModified(elementId);
                if (projectId) {
                    persistGeneration(projectId, elementId, {
                        taskId,
                        taskType: 'image',
                        progress: 0,
                        savedPrompt: prompt,
                    });
                }
                return true;
            }

            const resultUrl = data.imageUrl;

            replaceGeneratorWithPendingImage(elementId, resultUrl);
            await finalizeGeneratedImageElement(
                elementId,
                resultUrl,
                'storyboard-batch',
                {
                    x: currentElement.x,
                    y: currentElement.y,
                    width: currentElement.width || 400,
                    height: currentElement.height || 300,
                },
            );
            announcePassiveCompletedResult(elementId, '✅ 分镜图片生成完成，已回填到当前卡片');
            return true;
        } catch (error) {
            const interrupted = isRecoverableGenerationSubmissionError(error);
            const errorMessage = classifyGenerationError('image', error);
            const displayError = interrupted ? withSubmissionRecoveryHint(errorMessage) : errorMessage;
            setElements((prev) => applyGenerationFailure(prev, elementId, displayError));
            dirtyTrackerRef.current.markModified(elementId);
            if (projectId) {
                if (!interrupted) {
                    clearSubmission(projectId, elementId);
                }
                removeGeneration(projectId, elementId);
            }
            return false;
        } finally {
            setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, false));
        }
    }, [announcePassiveCompletedResult, finalizeGeneratedImageElement, replaceGeneratorWithPendingImage, resolveElementReferenceImages, setElements, workbenchSettings.imageDefaults.aspectRatio, workbenchSettings.imageDefaults.imageSize, workbenchSettings.imageDefaults.model]);

    const submitStoryboardVideoGeneratorElement = useCallback(async (elementId: string, snapshot?: CanvasElement) => {
        const currentElement = snapshot || elementsMapRef.current.get(elementId);
        if (!currentElement || currentElement.type !== 'video-generator') {
            return false;
        }

        const prompt = currentElement.savedPrompt?.trim() || currentElement.storyboardNote?.trim();
        if (!prompt) {
            setElements((prev) => applyGenerationFailure(prev, elementId, '分镜卡片缺少视频提示词，无法提交生成'));
            dirtyTrackerRef.current.markModified(elementId);
            return false;
        }

        const model = currentElement.selectedModel || workbenchSettings.videoDefaults.model;
        const aspectRatio = currentElement.selectedAspectRatio || workbenchSettings.videoDefaults.aspectRatio;
        const duration = currentElement.selectedDuration || workbenchSettings.videoDefaults.duration;
        const enhancePrompt = currentElement.selectedEnhancePrompt ?? workbenchSettings.videoDefaults.enhancePrompt;
        const images = await resolveElementFrameImages(currentElement);
        const projectId = currentProjectIdRef.current;

        setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, true));
        if (projectId) {
            persistSubmission(projectId, elementId, {
                prompt,
                model,
                aspectRatio,
                imageSize: '',
                duration,
                taskType: 'video',
                timestamp: Date.now(),
            });
        }

        setElements((prev) => applyElementGenerationPatch(
            prev,
            elementId,
            createGenerationIdlePatch({ progress: 0 }),
        ));
        dirtyTrackerRef.current.markModified(elementId);

        try {
            const data = await runVideoGenerationFlow({
                prompt,
                model,
                aspectRatio,
                duration,
                enhancePrompt,
                images: images.length > 0 ? images : undefined,
            });

            if (projectId) {
                clearSubmission(projectId, elementId);
            }

            if (data.status === 'pending') {
                const taskId = data.taskId;
                setElements((prev) => applyElementGenerationPatch(prev, elementId, createGenerationTaskPatch(taskId, 'video')));
                dirtyTrackerRef.current.markModified(elementId);
                if (projectId) {
                    persistGeneration(projectId, elementId, {
                        taskId,
                        taskType: 'video',
                        progress: 0,
                        savedPrompt: prompt,
                    });
                }
                return true;
            }

            const videoUrl = data.videoUrl;

            void persistGeneratedAssetToDisk(videoUrl, 'video', 'storyboard-batch-video');
            setElements((prev) => prev.map((item) => (
                item.id === elementId
                    ? {
                        ...item,
                        type: 'video',
                        content: videoUrl,
                        ...createGenerationIdlePatch(),
                    }
                    : item
            )));
            dirtyTrackerRef.current.markModified(elementId);
            if (projectId) {
                removeGeneration(projectId, elementId);
            }
            recordProjectMediaItem({
                kind: 'video',
                content: videoUrl,
                sourceElement: currentElement,
                sourceElementId: elementId,
            });
            announcePassiveCompletedResult(elementId, '✅ 分镜视频生成完成，已回填到当前批次');
            return true;
        } catch (error) {
            const interrupted = isRecoverableGenerationSubmissionError(error);
            const errorMessage = classifyGenerationError('video', error);
            const displayError = interrupted ? withSubmissionRecoveryHint(errorMessage) : errorMessage;
            setElements((prev) => applyGenerationFailure(prev, elementId, displayError));
            dirtyTrackerRef.current.markModified(elementId);
            if (projectId) {
                if (!interrupted) {
                    clearSubmission(projectId, elementId);
                }
                removeGeneration(projectId, elementId);
            }
            return false;
        } finally {
            setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, false));
        }
    }, [announcePassiveCompletedResult, persistGeneratedAssetToDisk, recordProjectMediaItem, resolveElementFrameImages, setElements, workbenchSettings.videoDefaults.aspectRatio, workbenchSettings.videoDefaults.duration, workbenchSettings.videoDefaults.enhancePrompt, workbenchSettings.videoDefaults.model]);

    const handleGenerateStoryboardSelection = useCallback((ids: string[]) => {
        const targets = ids
            .map((id) => elementsMapRef.current.get(id))
            .filter((element): element is CanvasElement => !!element && hasStoryboardGenerationSeed(element));
        const orderedTargets = sortStoryboardElements(targets);

        if (orderedTargets.length === 0) {
            showToast('所选内容里没有可批量出图的分镜卡片', 'error');
            return;
        }

        const frameNames = Array.from(new Set(orderedTargets
            .map((element) => element.parentFrameId ? elementsMapRef.current.get(element.parentFrameId)?.frameName : null)
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)));
        const batchId = uuidv4();
        const batchTitle = frameNames.length === 1
            ? `${frameNames[0]} · 批量出图`
            : `${orderedTargets.length} 张分镜 · 批量出图`;
        const targetIdSet = new Set(orderedTargets.map((element) => element.id));
        const generatorSnapshots = orderedTargets.map((element) => ({
            ...element,
            type: 'image-generator' as const,
            sourceStoryboardId: element.sourceStoryboardId || element.id,
            generationBatchId: batchId,
            generationBatchTitle: batchTitle,
            ...createGenerationIdlePatch({ progress: 0 }),
        }));
        const snapshotById = new Map(generatorSnapshots.map((element) => [element.id, element]));

        setElements((prev) => prev.map((item) => {
            if (!targetIdSet.has(item.id)) {
                return item;
            }

            return snapshotById.get(item.id) || item;
        }));

        targets.forEach((element) => {
            dirtyTrackerRef.current.markModified(element.id);
        });

        setSelectedIds(orderedTargets.map((element) => element.id));
        showToast(`已创建 ${orderedTargets.length} 个分镜出图任务，正在提交`, 'info');

        void (async () => {
            const results = await Promise.allSettled(generatorSnapshots.map((element) => submitStoryboardGeneratorElement(element.id, element)));
            const successCount = results.filter((result) => result.status === 'fulfilled' && result.value).length;
            const failedCount = orderedTargets.length - successCount;

            if (successCount > 0 && failedCount === 0) {
                showToast(`分镜批量出图已提交 ${successCount} 项`, 'success');
                return;
            }

            if (successCount > 0) {
                showToast(`分镜批量出图已提交 ${successCount} 项，${failedCount} 项提交失败`, 'info');
                return;
            }

            showToast('分镜批量出图提交失败，请检查参数后重试', 'error');
        })();
    }, [setElements, showToast, submitStoryboardGeneratorElement]);

    const handleGenerateStoryboardVideoSelection = useCallback((ids: string[]) => {
        const targets = ids
            .map((id) => elementsMapRef.current.get(id))
            .filter((element): element is CanvasElement => !!element && hasStoryboardGenerationSeed(element));
        const orderedTargets = sortStoryboardElements(targets);

        if (orderedTargets.length === 0) {
            showToast('所选内容里没有可批量出视频的分镜卡片', 'error');
            return;
        }

        const xs = orderedTargets.map((element) => element.x);
        const ys = orderedTargets.map((element) => element.y);
        const xe = orderedTargets.map((element) => element.x + (element.width || 0));
        const ye = orderedTargets.map((element) => element.y + (element.height || 0));
        const sourceHeight = Math.max(...ye) - Math.min(...ys);
        const offsetY = sourceHeight + 80;
        const frameNames = Array.from(new Set(orderedTargets
            .map((element) => element.parentFrameId ? elementsMapRef.current.get(element.parentFrameId)?.frameName : null)
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)));
        const batchId = uuidv4();
        const batchTitle = frameNames.length === 1
            ? `${frameNames[0]} · 批量出视频`
            : `${orderedTargets.length} 张分镜 · 批量出视频`;
        const generatorSnapshots = orderedTargets.map((element, index) => {
            const nextElement = orderedTargets[index + 1];
            const frameImages = [
                {
                    id: uuidv4(),
                    image: element.content || '',
                    imageType: 'first_frame',
                    name: element.displayName || element.storyboardShotCode || `分镜 ${index + 1}`,
                },
                ...(nextElement?.content
                    ? [{
                        id: uuidv4(),
                        image: nextElement.content,
                        imageType: 'last_frame',
                        name: nextElement.displayName || nextElement.storyboardShotCode || `分镜 ${index + 2}`,
                    }]
                    : []),
            ];

            return buildGeneratorElement('video-generator', {
                x: element.x,
                y: element.y + offsetY,
                width: element.width || 400,
                height: element.height || 300,
                displayName: `${element.displayName || element.storyboardShotCode || '分镜'} · 视频`,
                referenceImageId: element.id,
                parentFrameId: element.parentFrameId,
                savedPrompt: element.savedPrompt,
                selectedModel: workbenchSettings.videoDefaults.model,
                selectedAspectRatio: workbenchSettings.videoDefaults.aspectRatio,
                selectedDuration: workbenchSettings.videoDefaults.duration,
                selectedEnhancePrompt: workbenchSettings.videoDefaults.enhancePrompt,
                savedFrameImages: JSON.stringify(frameImages),
                generationBatchId: batchId,
                generationBatchTitle: batchTitle,
                sourceStoryboardId: element.id,
                storyboardShotCode: element.storyboardShotCode,
                storyboardSceneType: element.storyboardSceneType,
                storyboardCameraMove: element.storyboardCameraMove,
                storyboardDuration: element.storyboardDuration,
                storyboardNote: element.storyboardNote,
            });
        });

        addElementsWithOptionalAutoGroup(generatorSnapshots, batchTitle);
        showToast(`已创建 ${generatorSnapshots.length} 个分镜视频任务，正在提交`, 'info');

        void (async () => {
            const results = await Promise.allSettled(generatorSnapshots.map((element) => submitStoryboardVideoGeneratorElement(element.id, element)));
            const successCount = results.filter((result) => result.status === 'fulfilled' && result.value).length;
            const failedCount = generatorSnapshots.length - successCount;

            if (successCount > 0 && failedCount === 0) {
                showToast(`分镜批量出视频已提交 ${successCount} 项`, 'success');
                return;
            }

            if (successCount > 0) {
                showToast(`分镜批量出视频已提交 ${successCount} 项，${failedCount} 项提交失败`, 'info');
                return;
            }

            showToast('分镜批量出视频提交失败，请检查参数后重试', 'error');
        })();
    }, [addElementsWithOptionalAutoGroup, buildGeneratorElement, showToast, submitStoryboardVideoGeneratorElement, workbenchSettings.videoDefaults.aspectRatio, workbenchSettings.videoDefaults.duration, workbenchSettings.videoDefaults.enhancePrompt, workbenchSettings.videoDefaults.model]);

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

    // AI 编辑图片
    const handleAiEditElement = useCallback(async (element: CanvasElement, prompt: string) => {
        if (!element.content) {
            showToast('该元素没有可编辑的图片内容', 'error');
            return;
        }

        const model = element.selectedModel || workbenchSettings.imageDefaults.model;
        const aspectRatio = element.selectedAspectRatio || workbenchSettings.imageDefaults.aspectRatio;
        const imageSize = element.selectedImageSize || workbenchSettings.imageDefaults.imageSize;

        handleGeneratorSubmittingChange(element.id, true, { prompt, model, aspectRatio, imageSize });
        showToast('✨ AI 正在处理中，请稍候...', 'info');

        // 解析 imgref 为实际数据用于 API 发送
        const resolvedContent = await getImageDataUrl(element.content) || element.content;
        const extraReferenceImages = await resolveElementReferenceImages(element);
        const scopedReferenceImages = [resolvedContent, ...extraReferenceImages.filter((image) => image !== resolvedContent)];

        // 在元素上显示加载状态
        setElements(prev => prev.map((item) => (
            item.id === element.id
                ? {
                    ...item,
                    savedPrompt: prompt,
                    selectedModel: model,
                    selectedAspectRatio: aspectRatio,
                    selectedImageSize: imageSize,
                    ...createGenerationTaskPatch('ai-editing', 'image'),
                }
                : item
        )));
        dirtyTrackerRef.current.markModified(element.id);

        let submissionAccepted = false;
        let submissionOutcome: 'succeeded' | 'failed' | 'interrupted' = 'failed';

        try {
            const data = await runImageGenerationFlow({
                prompt,
                model,
                aspectRatio,
                imageSize,
                referenceImages: scopedReferenceImages.length > 0 ? scopedReferenceImages : undefined,
                referenceImage: resolvedContent,
                preferDirect: false,
                forceAsync: true,
            });

            submissionAccepted = true;
            submissionOutcome = 'succeeded';

            if (data.status === 'pending') {
                const taskId = data.taskId;
                // 更新为正确的 taskId 让轮询机制接管
                setElements(prev => setElementGenerationTask(prev, element.id, taskId, 'image'));
                dirtyTrackerRef.current.markModified(element.id);
                // 同步写入 sessionStorage
                const pid = currentProjectIdRef.current;
                if (pid) {
                    persistGeneration(pid, element.id, {
                        taskId,
                        taskType: 'image',
                        progress: 0,
                        savedPrompt: prompt,
                    });
                }
                showToast('已提交 AI 任务，正在生成中...', 'info');
            } else {
                await finalizeAiEditedImageElement(
                    element.id,
                    data.imageUrl,
                    'ai-edit',
                    {
                        x: element.x,
                        y: element.y,
                        width: element.width || 400,
                        height: element.height || 400,
                    },
                );
                announceCompletedResult(element.id, '✅ AI 编辑完成，结果已更新到画布');
            }
        } catch (err: unknown) {
            const isInterrupted = !submissionAccepted && isRecoverableGenerationSubmissionError(err);
            submissionOutcome = isInterrupted ? 'interrupted' : 'failed';
            const classifiedMessage = classifyGenerationError('image', err);
            const nextMessage = isInterrupted ? withSubmissionRecoveryHint(classifiedMessage) : classifiedMessage;

            if (isInterrupted) {
                console.warn('AI edit interrupted before task acceptance:', err);
            } else {
                console.error('AI edit failed:', err);
            }

            setElements(prev => applyGenerationFailure(prev, element.id, nextMessage));
            dirtyTrackerRef.current.markModified(element.id);
            showToast(
                isInterrupted
                    ? 'AI 编辑请求中断，已保留提交记录，刷新页面后会自动重试'
                    : `AI 编辑失败: ${(nextMessage.split(/\r?\n/).find((line) => line.trim()) || '未知错误').trim()}`,
                isInterrupted ? 'info' : 'error',
            );
        } finally {
            handleGeneratorSubmittingChange(element.id, false, { prompt, model, aspectRatio, imageSize }, { outcome: submissionOutcome });
        }

    }, [announceCompletedResult, finalizeAiEditedImageElement, handleGeneratorSubmittingChange, resolveElementReferenceImages, setElements, showToast, workbenchSettings.imageDefaults.aspectRatio, workbenchSettings.imageDefaults.imageSize, workbenchSettings.imageDefaults.model]);

    const handleRecoverEditedImageTask = useCallback(async (elementId: string, rawTaskId: string) => {
        const taskId = rawTaskId.trim();
        if (!taskId) {
            throw new Error('请输入有效的 task_id');
        }

        const currentElement = elementsMapRef.current.get(elementId);
        if (!currentElement || currentElement.type !== 'image' || !currentElement.content) {
            throw new Error('当前图片不存在，无法恢复 AI 编辑任务');
        }

        const projectId = currentProjectIdRef.current;
        setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, true));

        try {
            const result = await pollGenerationTask(taskId, 'image');

            if (result.status === 'completed') {
                const resultUrl = result.resultUrl;
                if (!resultUrl) {
                    throw new Error('任务已完成，但未获取到图片结果链接');
                }

                await finalizeAiEditedImageElement(
                    elementId,
                    resultUrl,
                    'manual-recover-ai-edit',
                    {
                        x: currentElement.x,
                        y: currentElement.y,
                        width: currentElement.width || 400,
                        height: currentElement.height || 400,
                    },
                );
                if (projectId) {
                    clearSubmission(projectId, elementId);
                    removeGeneration(projectId, elementId);
                }
                announceCompletedResult(elementId, '✅ 已通过 task_id 找回 AI 编辑结果');
                return;
            }

            if (result.status === 'failed') {
                failGenerationTask(elementId, 'image', result.error);
                return;
            }

            if (result.status === 'retryable-error') {
                throw new Error(result.error);
            }

            setElements((prev) => applyElementGenerationPatch(
                prev,
                elementId,
                createGenerationTaskPatch(taskId, 'image', Math.max(0, result.progress || 0)),
            ));
            dirtyTrackerRef.current.markModified(elementId);
            if (projectId) {
                clearSubmission(projectId, elementId);
                persistGeneration(projectId, elementId, {
                    taskId,
                    taskType: 'image',
                    progress: Math.max(0, result.progress || 0),
                    savedPrompt: currentElement.savedPrompt,
                });
            }
            showToast('已接管 AI 编辑任务，后续将继续自动轮询', 'success');
        } finally {
            setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, false));
        }
    }, [announceCompletedResult, failGenerationTask, finalizeAiEditedImageElement, setElements, showToast]);

    const handleStoryboardExportItemsChange = useCallback((
        orderedItems: Array<{
            id: string;
            storyboardShotCode?: string;
            storyboardSceneType?: string;
            storyboardCameraMove?: string;
            storyboardDuration?: string;
            storyboardNote?: string;
        }>,
    ) => {
        const normalizeMetaText = (value?: string) => {
            const nextValue = value?.trim();
            return nextValue ? nextValue : undefined;
        };

        orderedItems.forEach((item) => {
            const element = elementsMapRef.current.get(item.id);
            if (!element || element.type !== 'image') {
                return;
            }

            const nextAttrs: Partial<CanvasElement> = {};
            const nextShotCode = normalizeMetaText(item.storyboardShotCode);
            const nextSceneType = normalizeMetaText(item.storyboardSceneType);
            const nextCameraMove = normalizeMetaText(item.storyboardCameraMove);
            const nextDuration = normalizeMetaText(item.storyboardDuration);
            const nextNote = normalizeMetaText(item.storyboardNote);

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
                handleElementChange(item.id, nextAttrs);
            }
        });
    }, [handleElementChange]);

    // 替换背景
    const handleReplaceBackground = useCallback(async (element: CanvasElement, prompt: string) => {
        // 复用 AI 编辑通道，prompt 已经包含具体的背景操作指令
        handleAiEditElement(element, prompt);
    }, [handleAiEditElement]);

    // Mockup 效果图
    const handleMockupElement = useCallback(async (element: CanvasElement, templateId: string) => {
        const templatePrompts: Record<string, string> = {
            'phone': 'Place this image on a modern smartphone screen, realistic perspective mockup, professional product photography',
            'laptop': 'Place this image on a laptop screen, MacBook style, realistic workspace mockup, professional photography',
            'mug': 'Print this image on a white ceramic coffee mug, realistic mockup, clean studio background',
            'bag': 'Print this image on a canvas tote bag, realistic fashion mockup, clean background',
            'card': 'Place this image on a business card, realistic mockup, professional presentation',
        };
        const prompt = templatePrompts[templateId] || templatePrompts['phone'];
        handleAiEditElement(element, prompt);
    }, [handleAiEditElement]);

    const handleAnnotateImage = useCallback(async (
        element: CanvasElement,
        options: AnnotateImageOptions,
    ) => {
        if (!ensureImageToolSource(element, '当前元素不是可标注图片')) {
            return;
        }

        beginImageToolSubmission({
            setSubmitting: setIsAnnotateImageSubmitting,
            setStatus: setAnnotateImageSubmitStatus,
            loadingToast: '正在生成标注图片...',
        });

        try {
            const sourceBlob = await resolveCanvasContentBlob(element.content, 'lovart-annotate-image');

            if (!sourceBlob) {
                throw new Error('无法读取图片内容');
            }

            setAnnotateImageSubmitStatus('正在后台生成标注图...');
            const annotatedBlob = await annotateImageBlob(sourceBlob, options);
            setAnnotateImageSubmitStatus('正在写入画布素材...');
            const content = await saveImageBlob(annotatedBlob);
            setAnnotateImageSubmitStatus('正在计算展示尺寸...');
            const metrics = await resolveImageDisplayMetrics(
                content,
                'annotate-image',
                buildBelowElementDisplayMetricsOptions(element, 160),
                annotatedBlob,
            );

            const naming = resolveToolResultNaming({
                element,
                prefix: options.namePrefix,
                groupLabel: '标注结果',
                fallbackLabel: '标注结果',
                buildPrefixedItemNames: (trimmedPrefix) => [`${trimmedPrefix} · 标注`],
            });

            const newElement = buildBelowSourceImageResultElement({
                source: element,
                metrics,
                displayName: naming.itemNames[0] || sanitizeToolName(options.label.trim() || `${getElementBaseName(element)} · 标注`, '标注结果'),
                content,
                extraAttrs: {
                    annotationTitle: options.label.trim(),
                    annotationNote: options.note?.trim() || '',
                },
            });

            addElementsWithOptionalAutoGroup([newElement], naming.groupName);
            setAnnotateImageTargetId(null);

            announceCompletedResult(newElement.id, '✅ 标注图片已生成并添加到画布');
        } catch (error) {
            if (isWorkerCancelledError(error)) {
                return;
            }
            console.error('Annotate image failed:', error);
            const message = error instanceof Error ? error.message : '未知错误';
            showToast(`标注图片失败: ${message}`, 'error');
        } finally {
            endImageToolSubmission(setIsAnnotateImageSubmitting, setAnnotateImageSubmitStatus);
        }
    }, [addElementsWithOptionalAutoGroup, announceCompletedResult, beginImageToolSubmission, buildBelowElementDisplayMetricsOptions, buildBelowSourceImageResultElement, endImageToolSubmission, ensureImageToolSource, getElementBaseName, resolveCanvasContentBlob, resolveImageDisplayMetrics, resolveToolResultNaming, sanitizeToolName, showToast]);

    const handleExportStoryboard = useCallback(async (
        options: StoryboardExportOptions,
        orderedItems: Array<{
            id: string;
            content: string;
            displayName?: string;
            prompt?: string;
            annotationTitle?: string;
            annotationNote?: string;
            storyboardShotCode?: string;
            storyboardSceneType?: string;
            storyboardCameraMove?: string;
            storyboardDuration?: string;
            storyboardNote?: string;
        }>,
    ) => {
        const selectedImageElements = orderedItems
            .map((item) => ({ source: elementsMapRef.current.get(item.id), meta: item }))
            .filter((entry): entry is { source: CanvasElement; meta: typeof orderedItems[number] } => !!entry.source && entry.source.type === 'image' && !!entry.source.content);

        if (selectedImageElements.length < 2) {
            showToast('请至少选择两张图片再导出分镜表', 'error');
            return;
        }

        setIsStoryboardExportSubmitting(true);
        setStoryboardExportSubmitStatus('正在收集导出图片...');
        showToast('正在合成分镜表...', 'info');

        try {
            const exportItems = [] as Array<{
                blob: Blob;
                caption?: string;
                displayName?: string;
                storyboardShotCode?: string;
                storyboardSceneType?: string;
                storyboardCameraMove?: string;
                storyboardDuration?: string;
                storyboardNote?: string;
            }>;
            for (const entry of selectedImageElements) {
                const element = entry.source;
                const meta = entry.meta;
                setStoryboardExportSubmitStatus(`正在收集导出图片 (${exportItems.length + 1}/${selectedImageElements.length})...`);
                if (!element.content) continue;

                const blob = await resolveCanvasContentBlob(element.content, 'lovart-storyboard-export');

                if (!blob) continue;

                const caption = (() => {
                    switch (options.captionMode) {
                        case 'display-name':
                            return element.displayName || element.annotationTitle || element.savedPrompt || '';
                        case 'prompt':
                            return element.savedPrompt || '';
                        case 'annotation-title':
                            return element.annotationTitle || '';
                        case 'annotation-note':
                            return element.annotationNote || '';
                        case 'annotation-full': {
                            const parts = [element.annotationTitle, element.annotationNote]
                                .map((part) => (part || '').trim())
                                .filter(Boolean);
                            return parts.join(' · ');
                        }
                        case 'storyboard-meta': {
                            const parts = [
                                meta.storyboardShotCode || element.storyboardShotCode,
                                meta.storyboardSceneType || element.storyboardSceneType,
                                meta.storyboardCameraMove || element.storyboardCameraMove,
                                meta.storyboardDuration || element.storyboardDuration,
                                meta.storyboardNote || element.storyboardNote,
                            ].map((part) => (part || '').trim()).filter(Boolean);
                            return parts.join(' · ');
                        }
                        case 'none':
                        default:
                            return undefined;
                    }
                })();

                exportItems.push({
                    blob,
                    caption,
                    displayName: meta.displayName || element.displayName || element.annotationTitle || element.savedPrompt || '',
                    storyboardShotCode: meta.storyboardShotCode || element.storyboardShotCode || '',
                    storyboardSceneType: meta.storyboardSceneType || element.storyboardSceneType || '',
                    storyboardCameraMove: meta.storyboardCameraMove || element.storyboardCameraMove || '',
                    storyboardDuration: meta.storyboardDuration || element.storyboardDuration || '',
                    storyboardNote: meta.storyboardNote || element.storyboardNote || meta.annotationNote || element.annotationNote || '',
                });
            }

            if (exportItems.length < 2) {
                throw new Error('可导出的图片不足两张');
            }

            setStoryboardExportSubmitStatus('正在后台合成分镜表...');
            const mergedBlob = await buildStoryboardExportBlob(exportItems, options);
            const primaryName = selectedImageElements[0]
                ? getElementBaseName(selectedImageElements[0].source)
                : 'storyboard';
            const filenameStem = sanitizeFilenameStem(
                options.suggestedFileName?.trim() || `${primaryName} 分镜表 ${selectedImageElements.length}张`,
                'lovart-storyboard',
            );
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${filenameStem}-${timestamp}.png`;
            setStoryboardExportSubmitStatus('正在保存导出文件...');
            const saveMode = await saveBlobToLocalFile(mergedBlob, filename);
            if (saveMode === 'cancelled') {
                showToast('已取消保存', 'info');
                return;
            }

            setIsStoryboardExportOpen(false);
            showToast(saveMode === 'picker' ? '分镜表已保存到本地硬盘' : '分镜表下载成功', 'success');
        } catch (error) {
            if (isWorkerCancelledError(error)) {
                return;
            }
            console.error('Storyboard export failed:', error);
            const message = error instanceof Error ? error.message : '未知错误';
            showToast(`分镜表导出失败: ${message}`, 'error');
        } finally {
            setIsStoryboardExportSubmitting(false);
            setStoryboardExportSubmitStatus('');
        }
    }, [getElementBaseName, resolveCanvasContentBlob, sanitizeFilenameStem, showToast]);

    const handleCropImage = useCallback(async (
        element: CanvasElement,
        options: CropImageOptions,
    ) => {
        if (!ensureImageToolSource(element, '当前元素不是可裁剪图片')) {
            return;
        }

        beginImageToolSubmission({
            setSubmitting: setIsCropImageSubmitting,
            setStatus: setCropImageSubmitStatus,
            loadingToast: '正在裁剪图片...',
        });

        try {
            const sourceBlob = await resolveCanvasContentBlob(element.content, 'lovart-crop-image');

            if (!sourceBlob) {
                throw new Error('无法读取图片内容');
            }

            setCropImageSubmitStatus('正在后台裁剪图片...');
            const croppedBlob = await cropImageBlob(sourceBlob, options);
            setCropImageSubmitStatus('正在写入画布素材...');
            const content = await saveImageBlob(croppedBlob);
            setCropImageSubmitStatus('正在计算展示尺寸...');
            const metrics = await resolveImageDisplayMetrics(
                content,
                'crop-image',
                buildBelowElementDisplayMetricsOptions(element),
                croppedBlob,
            );

            const naming = resolveToolResultNaming({
                element,
                prefix: options.namePrefix,
                groupLabel: '裁剪结果',
                fallbackLabel: '裁剪结果',
                buildPrefixedItemNames: (trimmedPrefix) => [`${trimmedPrefix} · 裁剪`],
            });

            const newElement = buildBelowSourceImageResultElement({
                source: element,
                metrics,
                displayName: naming.itemNames[0],
                content,
            });

            addElementsWithOptionalAutoGroup([newElement], naming.groupName);
            setCropImageTargetId(null);

            announceCompletedResult(newElement.id, '✅ 图片裁剪完成，结果已添加到画布');
        } catch (error) {
            if (isWorkerCancelledError(error)) {
                return;
            }
            console.error('Crop image failed:', error);
            const message = error instanceof Error ? error.message : '未知错误';
            showToast(`图片裁剪失败: ${message}`, 'error');
        } finally {
            endImageToolSubmission(setIsCropImageSubmitting, setCropImageSubmitStatus);
        }
    }, [addElementsWithOptionalAutoGroup, announceCompletedResult, beginImageToolSubmission, buildBelowElementDisplayMetricsOptions, buildBelowSourceImageResultElement, endImageToolSubmission, ensureImageToolSource, resolveCanvasContentBlob, resolveImageDisplayMetrics, resolveToolResultNaming, showToast]);

    const handleSplitStoryboard = useCallback(async (
        element: CanvasElement,
        options: StoryboardSplitOptions,
    ) => {
        if (!ensureImageToolSource(element, '当前元素不是可切割图片')) {
            return;
        }

        beginImageToolSubmission({
            setSubmitting: setIsSplitStoryboardSubmitting,
            setStatus: setSplitStoryboardSubmitStatus,
            loadingToast: '正在切割分镜...',
        });

        try {
            const sourceBlob = await resolveCanvasContentBlob(element.content, 'lovart-split-storyboard');

            if (!sourceBlob) {
                throw new Error('无法读取图片内容');
            }

            setSplitStoryboardSubmitStatus('正在后台切割分镜...');
            const frames = await splitImageBlobIntoFrames(sourceBlob, options);
            if (frames.length === 0) {
                throw new Error('没有生成任何切片');
            }

            const layoutGap = 24;
            const baseCellWidth = Math.max(120, Math.floor((element.width || 480) / Math.max(1, options.cols)));
            const baseCellHeight = Math.max(120, Math.floor((element.height || 480) / Math.max(1, options.rows)));
            const naming = resolveToolResultNaming({
                element,
                prefix: options.namePrefix,
                groupLabel: '分镜切割',
                fallbackLabel: '分镜切割',
                count: frames.length,
                buildPrefixedItemNames: (trimmedPrefix) => Array.from({ length: frames.length }, (_, index) => `${trimmedPrefix} ${String(index + 1).padStart(2, '0')}`),
            });

            const preparedFrames: Array<{
                frame: StoryboardSplitFrame;
                content: string;
                width: number;
                height: number;
                displayName: string;
            }> = [];

            for (const [index, frame] of frames.entries()) {
                let finalBlob = frame.blob;

                if (options.upscaleEnabled && options.upscaleModel) {
                    setSplitStoryboardSubmitStatus(`正在 AI 放大切片 (${index + 1}/${frames.length})...`);
                    try {
                        finalBlob = await upscaleImageBlob(frame.blob, {
                            model: options.upscaleModel as UpscaleModelId,
                            scale: options.upscaleScale || 4,
                        });
                    } catch (upscaleErr) {
                        console.warn(`切片 ${index + 1} AI 放大失败，使用原图:`, upscaleErr);
                    }
                }

                setSplitStoryboardSubmitStatus(`正在写入切片素材 (${index + 1}/${frames.length})...`);
                const content = await saveImageBlob(finalBlob);
                const metrics = await resolveImageDisplayMetrics(
                    content,
                    'split-storyboard',
                    {
                        maxWidth: baseCellWidth,
                        maxHeight: baseCellHeight,
                    },
                    finalBlob,
                );

                preparedFrames.push({
                    frame,
                    content,
                    width: metrics?.width ?? baseCellWidth,
                    height: metrics?.height ?? baseCellHeight,
                    displayName: naming.itemNames[index],
                });
            }

            const colWidths = Array.from({ length: Math.max(1, options.cols) }, (_, col) => {
                const values = preparedFrames
                    .filter((item) => item.frame.col === col)
                    .map((item) => item.width);
                return Math.max(baseCellWidth, ...values);
            });
            const rowHeights = Array.from({ length: Math.max(1, options.rows) }, (_, row) => {
                const values = preparedFrames
                    .filter((item) => item.frame.row === row)
                    .map((item) => item.height);
                return Math.max(baseCellHeight, ...values);
            });

            const viewportBounds = getViewportBounds(scaleRef.current, panRef.current);
            const existingElements = elements.filter((item) => item.id !== element.id && item.type !== 'connector');
            const origin = chooseSplitLayoutOrigin({
                sourceBounds: {
                    x: element.x,
                    y: element.y,
                    width: element.width || 0,
                    height: element.height || 0,
                },
                viewport: viewportBounds,
                existingElements,
                colWidths,
                rowHeights,
                gap: layoutGap,
            });

            const nextElements: CanvasElement[] = preparedFrames.map((item) => {
                const offsetX = colWidths.slice(0, item.frame.col).reduce((sum, width) => sum + width, 0) + item.frame.col * layoutGap;
                const offsetY = rowHeights.slice(0, item.frame.row).reduce((sum, height) => sum + height, 0) + item.frame.row * layoutGap;
                const cellWidth = colWidths[item.frame.col] || baseCellWidth;
                const cellHeight = rowHeights[item.frame.row] || baseCellHeight;

                return buildImageElement({
                    x: origin.x + offsetX + Math.round((cellWidth - item.width) / 2),
                    y: origin.y + offsetY + Math.round((cellHeight - item.height) / 2),
                    width: item.width,
                    height: item.height,
                    displayName: item.displayName,
                    content: item.content,
                });
            });

            addElementsWithOptionalAutoGroup(nextElements, naming.groupName);
            setSplitStoryboardTargetId(null);

            announceCompletedResult(
                nextElements[0].id,
                `✅ 分镜切割完成，已生成 ${nextElements.length} 张图片`,
            );
        } catch (error) {
            if (isWorkerCancelledError(error)) {
                return;
            }
            console.error('Split storyboard failed:', error);
            const message = error instanceof Error ? error.message : '未知错误';
            showToast(`分镜切割失败: ${message}`, 'error');
        } finally {
            endImageToolSubmission(setIsSplitStoryboardSubmitting, setSplitStoryboardSubmitStatus);
        }
    }, [
        addElementsWithOptionalAutoGroup,
        announceCompletedResult,
        beginImageToolSubmission,
        buildImageElement,
        elements,
        endImageToolSubmission,
        ensureImageToolSource,
        resolveCanvasContentBlob,
        resolveImageDisplayMetrics,
        resolveToolResultNaming,
        showToast,
    ]);

    const handleGenerateImage = useCallback(async (imageUrl: string) => {
        // ImageGeneratorPanel now handles API calls and polling internally
        // This callback receives the final image URL. Show a placeholder immediately,
        // then localize/cache/measure in the background.
        // 使用 elementsMapRef 而非闭包中的 elements，避免并发生成时读取到过时的元素状态
        const map = elementsMapRef.current;
        const generatorElementId = selectedIds.find(id => {
            const el = map.get(id);
            return el?.type === 'image-generator';
        });
        const generatorElement = generatorElementId ? map.get(generatorElementId) : null;

        if (generatorElementId && generatorElement) {
            // 立即展示图片预览（cover 填充），让用户立刻看到生成结果位置
            replaceGeneratorWithPendingImage(generatorElementId, imageUrl);
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
            );
            return;
        }

        const center = getPlacementPosition();
        const newElement = buildImageElement({
            ...buildCenteredElementBounds(center, 400, 400),
            content: imageUrl,
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
        );
    }, [selectedIds, getPlacementPosition, announceCompletedResult, buildImageElement, finalizeGeneratedImageElement, replaceGeneratorWithPendingImage, buildCenteredElementBounds, addAndSelectElement]);

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
        selectedGenerateCount?: number;
        generationResultIndex?: number;
        savedReferenceImages?: string;
    }) => {
        void (async () => {
            const normalizedElement = { ...element } as CanvasElement;
            if (normalizedElement.type === 'image' && normalizedElement.content) {
                let batchBlob: Blob | null = null;
                if (normalizedElement.content.startsWith('http://') || normalizedElement.content.startsWith('https://')) {
                    batchBlob = await fetchRemoteBlob(normalizedElement.content, 'lovart-batch-image');
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
        })();
    }, [addElement, normalizeGeneratedImageContent, resolveImageDisplayMetrics, workbenchSettings.defaultImageFit, workbenchSettings.defaultImageSurface]);

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
        if (!selectedAnnotateImageElement) {
            return undefined;
        }

        return {
            left: `${(selectedAnnotateImageElement.x * scale) + pan.x}px`,
            top: `${((selectedAnnotateImageElement.y + (selectedAnnotateImageElement.height || 300)) * scale) + pan.y + 20}px`,
        };
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
        if (!selectedCropImageElement) {
            return undefined;
        }

        return {
            left: `${(selectedCropImageElement.x * scale) + pan.x}px`,
            top: `${((selectedCropImageElement.y + (selectedCropImageElement.height || 300)) * scale) + pan.y + 20}px`,
        };
    }, [pan, scale, selectedCropImageElement]);

    const selectedStoryboardExportElements = useMemo(() => {
        return selectedIds
            .map((id) => elements.find((item) => item.id === id))
            .filter((item): item is CanvasElement => !!item && item.type === 'image' && !!item.content);
    }, [elements, selectedIds]);

    const handleStoryboardAuditFilterChange = useCallback((filter: StoryboardAuditFilter) => {
        setStoryboardAuditFilter(filter);
        setAutoAdvanceStoryboardScope(mapStoryboardFilterToScope(filter));
    }, []);

    const handleStoryboardFieldsSaved = useCallback((savedId: string) => {
        if (!autoAdvanceStoryboardIssues) {
            return;
        }

        const currentElements = Array.from(elementsMapRef.current.values());
        const imageElements = currentElements.filter((element) => element.type === 'image' && !!element.content);
        const invalidIds = imageElements.filter((element) => getStoryboardAuditState(element).hasValidationError).map((element) => element.id);
        const partialIds = imageElements.filter((element) => getStoryboardAuditState(element).isPartial).map((element) => element.id);
        const untrackedIds = imageElements.filter((element) => getStoryboardAuditState(element).isUntracked).map((element) => element.id);
        const issueIds = autoAdvanceStoryboardScope === 'invalid'
            ? invalidIds
            : autoAdvanceStoryboardScope === 'partial'
                ? partialIds
                : autoAdvanceStoryboardScope === 'untracked'
                    ? untrackedIds
                    : [...invalidIds, ...partialIds, ...untrackedIds];

        if (issueIds.includes(savedId)) {
            return;
        }

        if (issueIds.length === 0) {
            showToast('分镜问题已全部处理完成。', 'success');
            return;
        }

        const imageOrder = imageElements.map((element) => element.id);
        const savedIndex = imageOrder.indexOf(savedId);
        const nextIssueId = issueIds.find((id) => imageOrder.indexOf(id) > savedIndex) || issueIds[0];

        if (!showLayers) {
            toggleLayers();
        }
        focusCanvasElement(nextIssueId);
    }, [autoAdvanceStoryboardIssues, autoAdvanceStoryboardScope, focusCanvasElement, showLayers, showToast, toggleLayers]);

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
        if (!selectedSplitStoryboardElement) {
            return undefined;
        }

        return {
            left: `${(selectedSplitStoryboardElement.x * scale) + pan.x}px`,
            top: `${((selectedSplitStoryboardElement.y + (selectedSplitStoryboardElement.height || 300)) * scale) + pan.y + 20}px`,
        };
    }, [pan, scale, selectedSplitStoryboardElement]);

    // 显示加载状态
    if (isLoading) {
        return (
            <div className="h-screen w-full bg-white flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 font-medium">加载画布中...</p>
                    <p className="text-gray-400 text-sm mt-2">正在从云端获取数据</p>
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
            {/* Header */}
            <header className="pointer-events-none absolute top-0 left-0 z-50 flex h-12 w-full items-center justify-between border-b border-slate-200/60 bg-white/90 px-4 backdrop-blur-xl">
                <div className="pointer-events-auto flex min-w-0 items-center gap-2">
                    <Link href="/projects" className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[13px] text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700">
                        <ChevronLeft size={14} />
                        <span className="hidden sm:inline">返回</span>
                    </Link>
                    <div className="h-3.5 w-px bg-slate-200/80" />
                    <div className="flex min-w-0 items-center gap-2">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => handleTitleChange(e.target.value)}
                            className="w-36 rounded-lg border-none bg-transparent px-1.5 py-0.5 text-[13px] font-semibold text-slate-800 outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50"
                            placeholder="未命名"
                            disabled={isLoading}
                            data-testid="canvas-title-input"
                        />
                        <div
                            className="flex items-center gap-1.5"
                            data-testid="canvas-save-status"
                            data-status={saveStatus}
                        >
                            {saveStatus === 'saving' && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-sky-500">
                                    <Cloud size={11} className="animate-pulse" />
                                    <span className="hidden md:inline">保存中</span>
                                </span>
                            )}
                            {saveStatus === 'saved' && user && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
                                    <Cloud size={11} />
                                    <span className="hidden md:inline">已保存</span>
                                </span>
                            )}
                            {saveStatus === 'offline' && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-rose-500">
                                    <CloudOff size={11} />
                                    <span className="hidden md:inline">离线</span>
                                </span>
                            )}
                            {!user && (
                                <span className="inline-flex items-center text-[11px] text-amber-500">未登录</span>
                            )}
                        </div>
                        <span className="hidden rounded-md bg-slate-100/80 px-1.5 py-px text-[10px] font-medium text-slate-400 lg:inline-flex">
                            {elements.length} 项
                        </span>
                    </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-2">
                    <CanvasWorkbenchSwitcher
                        showLayers={showLayers}
                        showHistory={showHistory}
                        showMedia={showMedia}
                        showReferences={showReferences}
                        showChat={showChat}
                        elementCount={elements.length}
                        selectionCount={selectedIds.length}
                        historyCount={historySummary.patchCount}
                        referenceCount={projectReferenceItems.length}
                        onToggleLayers={toggleLayers}
                        onToggleHistory={toggleHistory}
                        onToggleMedia={toggleMedia}
                        onToggleReferences={toggleReferences}
                        onToggleChat={toggleChat}
                        onOpenCommandPalette={() => setShowCommandPalette(true)}
                        onOpenShortcutHelp={() => setShowShortcutHelp(true)}
                    />

                    <div className="flex items-center gap-1.5 xl:hidden">
                        <button
                            onClick={toggleLayers}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${showLayers ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                            title={showLayers ? '关闭图层面板' : '打开图层面板'}
                            data-testid="canvas-layers-toggle"
                        >
                            层
                        </button>
                        <button
                            onClick={toggleHistory}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${showHistory ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                            title={showHistory ? '关闭历史侧栏' : '打开历史侧栏'}
                            data-testid="canvas-history-toggle"
                        >
                            史
                        </button>
                        <button
                            onClick={toggleMedia}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${showMedia ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                            title={showMedia ? '关闭媒体历史' : '打开媒体历史'}
                            data-testid="canvas-media-toggle"
                        >
                            媒
                        </button>
                        <button
                            onClick={toggleReferences}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${showReferences ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                            title={showReferences ? '关闭项目参考库' : '打开项目参考库'}
                            data-testid="canvas-reference-toggle"
                        >
                            参
                        </button>
                        <button
                            onClick={toggleChat}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${showChat ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
                            title={showChat ? '关闭 AI 对话' : '打开 AI 对话'}
                            data-testid="canvas-chat-toggle"
                        >
                            <Sparkles size={13} />
                        </button>
                    </div>

                    <button
                        onClick={() => void handleToggleAutoSaveGenerated()}
                        className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                            workbenchSettings.autoSaveGenerated
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                        title={workbenchSettings.autoSaveGenerated ? '关闭生成结果自动落盘' : '开启生成结果自动落盘'}
                    >
                        <HardDrive size={14} />
                        {workbenchSettings.autoSaveGenerated && (
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-white bg-green-500" />
                        )}
                    </button>
                    <ApiSettingsButton />
                </div>
            </header>

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
                        isGenerating={isGenerating}
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
                        onClearAll={() => {
                            if (!currentProjectIdRef.current) return;
                            clearProjectMediaHistory(currentProjectIdRef.current);
                            showToast('已清空当前项目媒体历史', 'info');
                        }}
                        onSaveAsReference={saveProjectReferenceFromMediaItem}
                        onLocateSource={(item) => {
                            if (item.sourceElementId) {
                                focusCanvasElement(item.sourceElementId);
                            }
                        }}
                        onInsertItem={(item) => {
                            if (item.kind === 'audio') {
                                void navigator.clipboard.writeText(item.content).then(() => {
                                    showToast('已复制音频素材地址，可在视频生成器中作为参考音频使用', 'success');
                                }).catch(() => {
                                    showToast('音频素材仅可在视频生成器中作为参考音频使用', 'info');
                                });
                                return;
                            }

                            const center = getPlacementPosition();
                            if (item.kind === 'image') {
                                const newElement = buildImageElement({
                                    ...buildCenteredElementBounds(center, 400, 300),
                                    content: item.content,
                                    savedPrompt: item.prompt,
                                    selectedModel: item.model,
                                    selectedAspectRatio: item.aspectRatio,
                                    selectedImageSize: item.imageSize,
                                });
                                addAndSelectElement(newElement);
                                showToast('已将项目图片回流到画布', 'success');
                                return;
                            }

                            const newElement = buildVideoElement({
                                ...buildCenteredElementBounds(center, 400, 300),
                                content: item.content,
                                savedPrompt: item.prompt,
                                selectedModel: item.model,
                                selectedAspectRatio: item.aspectRatio,
                                selectedDuration: item.duration,
                            });
                            addAndSelectElement(newElement);
                            showToast('已将项目视频回流到画布', 'success');
                        }}
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
                        onClearAll={() => {
                            if (!currentProjectIdRef.current) return;
                            clearProjectReferenceLibrary(currentProjectIdRef.current);
                            showToast('已清空当前项目参考库', 'info');
                        }}
                        onDeleteItem={(item) => {
                            if (!currentProjectIdRef.current) return;
                            removeProjectReferenceImage(currentProjectIdRef.current, item.id);
                            showToast('已从项目参考库移除', 'info');
                        }}
                        onDeleteItems={(items) => {
                            if (!currentProjectIdRef.current || items.length === 0) return;
                            items.forEach((item) => removeProjectReferenceImage(currentProjectIdRef.current!, item.id));
                            showToast(`已批量移出 ${items.length} 张项目参考图`, 'info');
                        }}
                        onLocateSource={(item) => {
                            if (item.sourceElementId) {
                                focusCanvasElement(item.sourceElementId);
                            }
                        }}
                        onInsertItem={(item) => {
                            const center = getPlacementPosition();
                            const newElement = buildImageElement({
                                ...buildCenteredElementBounds(center, 400, 300),
                                content: item.image,
                                displayName: item.label,
                                savedPrompt: item.prompt,
                            });
                            addAndSelectElement(newElement);
                            touchProjectReferenceImage(currentProjectIdRef.current!, item.id);
                            showToast('已将项目参考图回流到画布', 'success');
                        }}
                        onInsertItems={(items) => {
                            if (items.length === 0) return;
                            const center = getPlacementPosition();
                            const gapX = 36;
                            const gapY = 28;
                            const newElements = items.map((item, index) => buildImageElement({
                                ...buildCenteredElementBounds({ x: center.x + (index * gapX), y: center.y + (index * gapY) }, 400, 300),
                                content: item.image,
                                displayName: item.label,
                                savedPrompt: item.prompt,
                            }));
                            newElements.forEach((element) => addElement(element));
                            setSelectedIds(newElements.map((element) => element.id));
                            items.forEach((item) => touchProjectReferenceImage(currentProjectIdRef.current!, item.id));
                            showToast(`已批量回流 ${items.length} 张项目参考图`, 'success');
                        }}
                    />
                </div>
            )}

            {benchmarkMode && (
                <div className="absolute top-20 z-50 w-[360px] rounded-2xl border border-gray-200 bg-white/96 p-4 shadow-2xl backdrop-blur pointer-events-auto" style={{ right: `${benchmarkPanelRightOffset}px` }} data-testid="benchmark-panel">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                <Gauge size={16} className="text-violet-500" />
                                画布压力测试
                            </div>
                            <p className="mt-1 text-xs leading-5 text-gray-500">
                                使用合成 4K SVG 图片模拟导入、存储和首屏渲染耗时。
                            </p>
                        </div>
                        <button
                            onClick={handleClearBenchmarkResults}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="清空测试记录"
                        >
                            <Trash size={14} />
                        </button>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-2">
                        {[100, 500, 1000, 2000].map((count) => (
                            <button
                                key={count}
                                type="button"
                                data-testid={`benchmark-run-${count}`}
                                disabled={isBenchmarkRunning}
                                onClick={() => void runCanvasBenchmark(count, 'replace')}
                                className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-violet-200 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {count} 张
                            </button>
                        ))}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                        {[250, 500].map((count) => (
                            <button
                                key={`append-${count}`}
                                type="button"
                                data-testid={`benchmark-run-append-${count}`}
                                disabled={isBenchmarkRunning}
                                onClick={() => void runCanvasBenchmark(count, 'append')}
                                className="rounded-xl border border-violet-200 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                追加 {count} 张
                            </button>
                        ))}
                    </div>

                    {renderMetrics && (
                        <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-3 text-xs text-slate-600" data-testid="benchmark-live-metrics">
                            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-violet-700">
                                <span>实时渲染指标</span>
                                <span>{renderMetrics.visibleCount} / {renderMetrics.totalCount}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">裁剪数量</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-metric-culled">{renderMetrics.culledCount}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">延后渲染</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-metric-deferred">{renderMetrics.deferredCount}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">分区数量</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-metric-partitions">{renderMetrics.partitionCount}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">分区尺寸</div>
                                    <div className="mt-1 font-semibold text-slate-700">{Math.round(renderMetrics.partitionTileSize)} px</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {chunkStats && (
                        <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-3 text-xs text-slate-600" data-testid="benchmark-chunk-metrics">
                            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-emerald-700">
                                <span>逻辑分块持久化</span>
                                <span>{chunkStats.chunkCount} 块</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">最大块</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-largest">{chunkStats.largestChunkSize}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">根层级</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-root">{chunkStats.rootElementCount}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">已建索引</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-manifest">{chunkManifest.length}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">激活块</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-active">{activeChunkSummary.activeChunkIds.length}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">释放块</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-released">{activeChunkSummary.releasedChunkIds.length}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">激活元素</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-active-elements">{activeChunkSummary.activeElements.length}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">固定块</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-pinned">{pinnedChunkIds.length}</div>
                                </div>
                                <div className="rounded-xl bg-white/80 px-2.5 py-2">
                                    <div className="text-[10px] text-slate-400">运行态卸载</div>
                                    <div className="mt-1 font-semibold text-slate-700" data-testid="benchmark-chunk-unloaded">{chunkResidency.unloadedChunkIds.length}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-xs text-slate-600" data-testid="benchmark-chunk-preheat">
                        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-sky-700">
                            <span>分块预热</span>
                            <span>{chunkPreheat.loadedChunks}/{chunkPreheat.totalChunks}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/80">
                            <div
                                className="h-full rounded-full bg-sky-500 transition-all"
                                style={{ width: `${chunkPreheat.totalElements > 0 ? (chunkPreheat.loadedElements / chunkPreheat.totalElements) * 100 : 0}%` }}
                            />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                            <span>{chunkPreheat.currentChunkLabel || '待机'}</span>
                            <span>{chunkPreheat.loadedElements}/{chunkPreheat.totalElements}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                            <span>运行态</span>
                            <span data-testid="benchmark-chunk-residency-phase">{chunkResidency.phase === 'hydrating' ? '回填中' : chunkResidency.phase === 'releasing' ? '释放中' : '稳定'}</span>
                        </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-xs text-slate-600" data-testid="benchmark-history-panel">
                        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                            <span>历史面板</span>
                            <span>{historySummary.patchCount} 步</span>
                        </div>
                        <div className="truncate font-medium text-slate-800">{historySummary.lastAction}</div>
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                            <span className={`rounded-full px-2 py-0.5 ${historySummary.canUndo ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'}`}>撤销</span>
                            <span className={`rounded-full px-2 py-0.5 ${historySummary.canRedo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>重做</span>
                        </div>
                        <div className="mt-3 space-y-2" data-testid="benchmark-history-timeline">
                            {historyTimeline.length === 0 ? (
                                <div className="rounded-xl bg-white/80 px-2.5 py-2 text-[10px] text-slate-400">暂无历史时间线</div>
                            ) : historyTimeline.slice(0, 6).map((entry) => (
                                <div key={entry.id} className={`rounded-xl border px-2.5 py-2 ${entry.active ? 'border-violet-200 bg-violet-50/70' : 'border-slate-200 bg-white/80 opacity-70'}`}>
                                    <div className="flex items-center justify-between gap-2 text-[10px]">
                                        <span className="truncate font-medium text-slate-700">{entry.label}</span>
                                        <span className="text-slate-400">{new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        <div className="flex items-center justify-between">
                            <span>缓存阈值</span>
                            <span>{Math.round(STORAGE_INFO_THRESHOLD * 100)} / {Math.round(STORAGE_WARN_THRESHOLD * 100)} / {Math.round(STORAGE_CRITICAL_THRESHOLD * 100)}%</span>
                        </div>
                        {storageEstimate && (
                            <div className="mt-2 flex items-center justify-between">
                                <span>当前占用</span>
                                <span className={`rounded-full px-2 py-0.5 ${getStorageBadgeClass(storageEstimate.usageRatio)}`} data-testid="benchmark-storage-usage">
                                    {formatBytes(storageEstimate.usageBytes)} / {formatBytes(storageEstimate.quotaBytes)}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="mt-3 space-y-2" data-testid="benchmark-results">
                        {benchmarkResults.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                                暂无压力测试记录
                            </div>
                        ) : benchmarkResults.slice(0, 4).map((result) => (
                            <div key={result.id} className="rounded-xl border border-gray-100 px-3 py-2">
                                <div className="flex items-center justify-between text-xs font-medium text-gray-700">
                                    <span>{result.count} 张 · {result.mode === 'append' ? '追加' : '替换'}</span>
                                    <span>{new Date(result.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                                    <span>耗时 {result.durationMs.toFixed(0)} ms</span>
                                    <span>{formatBytes(result.storageUsageBytes)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
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
                <CanvasArea
                    scale={scale}
                    pan={pan}
                    onPanChange={setPan}
                    onScaleChange={setScale}
                    elements={canvasRuntimeElements}
                    selectedIds={selectedIds}
                    highlightedElementIds={highlightedLayerIds}
                    onSelect={setSelectedIds}
                    onElementChange={handleElementChange}
                    onStoryboardSaved={handleStoryboardFieldsSaved}
                    storyboardAutoAdvanceEnabled={autoAdvanceStoryboardIssues}
                    onBatchElementChange={handleBatchElementChange}
                    onDelete={handleDelete}
                    onAddElement={addElement}
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onConnectFlow={handleConnectFlow}
                    onCopyElement={handleCopyElement}
                    onCopySelection={handleCopySelection}
                    onCutSelection={handleCutSelection}
                    onPasteAt={handlePasteAt}
                    onDuplicateSelection={handleDuplicateSelection}
                    onDownloadElement={handleDownloadElement}
                    onSendSelectionToChat={handleSendSelectionToChat}
                    onGroupSelection={handleGroupSelection}
                    onUngroupSelection={handleUngroupSelection}
                    onMergeSelection={handleMergeSelection}
                    onBringForward={handleBringForward}
                    onSendBackward={handleSendBackward}
                    onBringToFront={handleBringToFront}
                    onSendToBack={handleSendToBack}
                    onToggleElementsHidden={handleToggleElementsHidden}
                    onToggleElementsLocked={handleToggleElementsLocked}
                    onDeleteSelection={removeElementsByIds}
                    onExportStoryboardSelection={(ids) => {
                        const imageCount = ids
                            .map((id) => elementsMapRef.current.get(id))
                            .filter((item) => item?.type === 'image' && !!item.content)
                            .length;
                        if (imageCount >= 2) {
                            setAnnotateImageTargetId(null);
                            setCropImageTargetId(null);
                            setSplitStoryboardTargetId(null);
                            setIsStoryboardExportOpen(true);
                        } else {
                            showToast('请至少选择两张图片', 'info');
                        }
                    }}
                    onGenerateStoryboardSelection={handleGenerateStoryboardSelection}
                    onGenerateStoryboardVideoSelection={handleGenerateStoryboardVideoSelection}
                    projectReferenceImages={projectReferenceItems}
                    onUseProjectReferenceImage={handleUseProjectReferenceImage}
                    onSaveAsProjectReference={saveProjectReferenceFromElement}
                    onSaveSelectionAsProjectReference={saveProjectReferenceFromSelection}
                    onAiEditElement={handleAiEditElement}
                    onRecoverImageEditTask={handleRecoverEditedImageTask}
                    onReplaceBackground={handleReplaceBackground}
                    onMockupElement={handleMockupElement}
                    onAnnotateImage={(element) => {
                        setCropImageTargetId(null);
                        setSplitStoryboardTargetId(null);
                        setAnnotateImageTargetId((current) => current === element.id ? null : element.id);
                    }}
                    onCropImage={(element) => {
                        setAnnotateImageTargetId(null);
                        setSplitStoryboardTargetId(null);
                        setCropImageTargetId((current) => current === element.id ? null : element.id);
                    }}
                    onSplitStoryboard={(element) => {
                        setAnnotateImageTargetId(null);
                        setCropImageTargetId(null);
                        setSplitStoryboardTargetId((current) => current === element.id ? null : element.id);
                    }}
                    onStoryboardPlanFromImage={handleStoryboardPlanFromImage}
                    onAddImage={handleAddImage}
                    onAddVideo={handleAddVideo}
                    onOpenImageGenerator={handleOpenImageGenerator}
                    onOpenVideoGenerator={handleOpenVideoGenerator}
                    onCanvasMouseMove={handleCanvasMouseMove}
                    canvasSelectMode={canvasSelectMode}
                    onCanvasSelectPick={handleCanvasSelectPick}
                    onCancelCanvasSelect={handleCancelCanvasSelect}
                    generatorSubmittingMap={generatorSubmittingMap}
                    highlightedResultId={highlightedResultId}
                    canPaste={clipboardRef.current.length > 0}
                    spatialIndex={spatialIndexRef.current}
                    resolvedImageSrcMap={runtimeImageRenderSrcs}
                    onRenderMetricsChange={benchmarkMode ? handleRenderMetricsChange : undefined}
                    minimapRightOffset={rightWorkbenchOffset}
                />
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
                        canvasImages={canvasImages.map((image) => ({
                            id: image.id,
                            content: image.content,
                            displayName: elementsMapRef.current.get(image.id)?.displayName || `图片 ${image.id.slice(0, 4)}`,
                        }))}
                        selectedCanvasImageIds={selectedIds.filter((id) => {
                            const element = elementsMapRef.current.get(id);
                            return element?.type === 'image' && !!element.content;
                        })}
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
                        canvasImages={canvasImages.map((image) => ({
                            id: image.id,
                            content: image.content,
                            displayName: elementsMapRef.current.get(image.id)?.displayName || `图片 ${image.id.slice(0, 4)}`,
                        }))}
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