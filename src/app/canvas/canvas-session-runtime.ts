/**
 * canvas-session-runtime.ts — 画布会话运行时控制器
 *
 * 从 page.tsx 提取的会话生命周期管理：
 * - 自动保存（debounced）
 * - 组件卸载时刷新脏数据
 * - beforeunload 页面离开时保存
 * - 孤立生成任务的恢复重提交
 *
 * page.tsx 只需调用 useCanvasSessionRuntime() 即可，不再内联这些 effect。
 */

import { useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { requestImageGeneration } from '@/lib/ai-client';
import { debugLog } from '@/lib/debug-log';
import { runImageGenerationFlow } from '@/components/lovart/image-generation-flow';
import { runVideoGenerationFlow } from '@/components/lovart/video-generation-flow';
import { getImageDataUrl, type DirtyTracker } from '@/lib/editor-kernel';
import { fetchRemoteBlob } from '@/lib/blob-utils';
import { shouldUseDomesticImageBatching } from '@/lib/image-generation-models';
import {
    createGenerationIdlePatch,
    createGenerationTaskPatch,
} from '@/lib/generation-task-state';
import { syncGenerationsFromElements, persistGeneration, clearSubmission, loadPendingSubmissions } from './generation-persistence';
import { resolveElementReferenceImages } from './canvas-element-ops';
import { saveViewportState } from './viewport-persistence';
import { updateGeneratorSubmittingMap } from './canvas-generation';

// ── Types ────────────────────────────────────────────────────

export interface CanvasSessionRuntimeDeps {
    /** Current user (null = not logged in) */
    user: { id: string } | null;
    /** Whether the project is still loading */
    isLoading: boolean;
    /** Whether the initial canvas session has been applied and hooks can run recovery work */
    isCanvasReady: boolean;
    /** Whether user is dragging an element */
    isDraggingElement: boolean;
    /** Current element count (for dependency tracking) */
    elementsCount: number;
    /** Elements version counter (for dependency tracking) */
    elementsVersion: number;
    /** Current title */
    title: string;

    // ── Refs (stable across renders) ──
    /** Ref to the elements map */
    elementsMapRef: React.RefObject<Map<string, CanvasElement>>;
    /** Ref to initialization flag */
    isInitializedRef: React.RefObject<boolean>;
    /** Ref to current project ID */
    currentProjectIdRef: React.RefObject<string | null>;
    /** Ref to current scale value */
    scaleRef: React.RefObject<number>;
    /** Ref to current pan value */
    panRef: React.RefObject<{ x: number; y: number }>;
    /** Ref to dirty tracker instance */
    dirtyTrackerRef: React.RefObject<DirtyTracker>;
    /** Ref to whether title is dirty */
    titleDirtyRef: React.RefObject<boolean>;

    // ── Callbacks (stable via useCallback) ──
    /** Save the project to IndexedDB */
    saveProject: () => void | Promise<void>;
    /** Clear any scheduled debounced save */
    clearScheduledSave: () => void;
    /** Show a toast notification */
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
    /** Set generator submitting map state */
    setGeneratorSubmittingMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    /** Bump elements version to trigger re-render */
    setElementsVersion: React.Dispatch<React.SetStateAction<number>>;
    /** Finalize a completed AI edit back onto an existing image element */
    finalizeAiEditedImageElement: (
        elementId: string,
        resultUrl: string,
        source: string,
        anchor?: {
            x: number;
            y: number;
            width: number;
            height: number;
        },
        taskId?: string | null,
    ) => Promise<void>;
    /** Record completed media into project-scoped history. */
    recordProjectMediaItem: (params: {
        kind: 'image' | 'video';
        content: string;
        taskId?: string;
        sourceElement?: CanvasElement | null;
        sourceElementId?: string;
    }) => void;

    // ── Image content normalization (for orphan recovery) ──
    normalizeGeneratedImageContent: (rawUrl: string, source: string, blob?: Blob | null) => Promise<string>;
    resolveImageDisplayMetrics: (
        content: string,
        source: string,
        options: { anchor: { x: number; y: number; width: number; height: number } },
        blob?: Blob | null,
    ) => Promise<{ width: number; height: number } | null>;
    persistGeneratedAssetToDisk: (content: string, kind: 'image' | 'video', source: string, blob?: Blob | null) => void;
}

// ── Hook ─────────────────────────────────────────────────────

/**
 * Manages the canvas session lifecycle:
 * 1. Auto-save with debouncing
 * 2. Unmount flush (SPA navigation)
 * 3. beforeunload flush (page close/refresh)
 * 4. Orphaned generation recovery
 */
export function useCanvasSessionRuntime(deps: CanvasSessionRuntimeDeps) {
    const {
        user,
        isLoading,
        isCanvasReady,
        isDraggingElement,
        elementsCount,
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
    } = deps;

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        clearScheduledSave();
    }, [clearScheduledSave]);

    // ── 1. Auto-save with debouncing ──
    useEffect(() => {
        if (!user || isLoading || !isInitializedRef.current || isDraggingElement) {
            return;
        }

        if (!dirtyTrackerRef.current.isDirty && !titleDirtyRef.current) {
            return;
        }

        debugLog('Auto-save scheduled for', elementsCount, 'elements');

        clearSave();

        saveTimeoutRef.current = setTimeout(() => {
            debugLog('Auto-save triggered');
            saveProject();
        }, 2000);

        return () => {
            clearSave();
        };
    }, [clearSave, elementsCount, elementsVersion, title, user, isLoading, isDraggingElement, saveProject, isInitializedRef, dirtyTrackerRef, titleDirtyRef]);

    // ── 2. Unmount flush — save dirty changes on SPA navigation ──
    const saveProjectRef = useRef(saveProject);
    saveProjectRef.current = saveProject;
    useEffect(() => {
        const mapRef = elementsMapRef;
        const dtRef = dirtyTrackerRef;

        return () => {
            clearSave();

            const pid = currentProjectIdRef.current;
            if (pid) {
                syncGenerationsFromElements(pid, Array.from(mapRef.current.values()));
            }
            if (pid && isInitializedRef.current) {
                saveViewportState(pid, scaleRef.current, panRef.current);
            }
            if (dtRef.current.isDirty || titleDirtyRef.current) {
                debugLog('Unmount flush - saving dirty changes before leaving canvas');
                saveProjectRef.current();
            }
        };
    }, [clearSave, elementsMapRef, currentProjectIdRef, isInitializedRef, scaleRef, panRef, dirtyTrackerRef, titleDirtyRef]);

    // ── 3. beforeunload — save before page close/refresh ──
    useEffect(() => {
        const handleBeforeUnload = () => {
            clearSave();

            const pid = currentProjectIdRef.current;
            if (pid) {
                syncGenerationsFromElements(pid, Array.from(elementsMapRef.current.values()));
            }
            if (pid && isInitializedRef.current) {
                saveViewportState(pid, scaleRef.current, panRef.current);
            }
            if ((dirtyTrackerRef.current.isDirty || titleDirtyRef.current) && user && isInitializedRef.current) {
                saveProject();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [clearSave, saveProject, user, elementsMapRef, currentProjectIdRef, isInitializedRef, scaleRef, panRef, dirtyTrackerRef, titleDirtyRef]);

    // ── 4. Orphaned generation recovery ──
    const hasCheckedOrphanedRef = useRef(false);
    useEffect(() => {
        if (isLoading || !isCanvasReady || !isInitializedRef.current || hasCheckedOrphanedRef.current) return;
        hasCheckedOrphanedRef.current = true;

        const pid = currentProjectIdRef.current;
        if (!pid) return;

        const submissions = loadPendingSubmissions(pid);
        const orphanedEntries = Object.entries(submissions);
        if (orphanedEntries.length === 0) return;

        const MAX_AGE_MS = 5 * 60 * 1000;

        for (const [elementId, sub] of orphanedEntries) {
            if (Date.now() - sub.timestamp > MAX_AGE_MS) {
                clearSubmission(pid, elementId);
                continue;
            }

            const el = elementsMapRef.current.get(elementId);
            if (!el) {
                clearSubmission(pid, elementId);
                continue;
            }

            if (el.generatingTaskId && el.generatingTaskId !== 'ai-editing') {
                clearSubmission(pid, elementId);
                continue;
            }

            const isRecoverableGenerator = el.type === 'image-generator' || el.type === 'video-generator';
            const isRecoverableImageEdit = el.type === 'image' && sub.taskType === 'image' && !!el.content;

            if (!isRecoverableGenerator && !isRecoverableImageEdit) {
                clearSubmission(pid, elementId);
                continue;
            }

            debugLog(`[GenPersist] Re-submitting orphaned generation for element ${elementId}, prompt: "${sub.prompt}"`);

            setGeneratorSubmittingMap(prev => updateGeneratorSubmittingMap(prev, elementId, true));

            const recoveredGenerateCount = sub.generateCount || el.selectedGenerateCount || 1;
            const parseSavedFrameImages = (value?: string) => {
                if (!value) {
                    return undefined;
                }

                try {
                    const parsed = JSON.parse(value) as Array<{ image?: unknown; imageType?: unknown }>;
                    const normalized = parsed.flatMap((item) => {
                        if (!item || typeof item.image !== 'string' || !item.image.trim()) {
                            return [];
                        }

                        const imageType = item.imageType === 'last_frame' || item.imageType === 'reference'
                            ? item.imageType
                            : 'first_frame';

                        return [{ image: item.image.trim(), image_type: imageType }];
                    });

                    return normalized.length > 0 ? normalized : undefined;
                } catch {
                    return undefined;
                }
            };
            const parseSavedReferenceUrls = (value?: string) => {
                if (!value) {
                    return undefined;
                }

                try {
                    const parsed = JSON.parse(value) as Array<string | { url?: unknown }>;
                    const normalized = parsed.flatMap((item) => {
                        if (typeof item === 'string' && item.trim()) {
                            return [item.trim()];
                        }

                        if (item && typeof item === 'object' && typeof item.url === 'string' && item.url.trim()) {
                            return [item.url.trim()];
                        }

                        return [];
                    });

                    return normalized.length > 0 ? normalized : undefined;
                } catch {
                    return undefined;
                }
            };

            const requestBody = sub.taskType === 'video'
                ? {
                    prompt: sub.prompt,
                    model: sub.model || el.selectedModel || undefined,
                    aspectRatio: sub.aspectRatio || el.selectedAspectRatio || undefined,
                    duration: sub.duration || el.selectedDuration || undefined,
                    generationMode: el.selectedDomesticMode === 'first-last-frame' || el.selectedDomesticMode === 'omni-reference'
                        ? el.selectedDomesticMode
                        : undefined,
                    images: parseSavedFrameImages(el.savedFrameImages),
                    videos: parseSavedReferenceUrls(el.savedReferenceVideos),
                    audios: parseSavedReferenceUrls(el.savedReferenceAudios),
                    resolution: el.selectedResolution === '480p' || el.selectedResolution === '720p'
                        ? el.selectedResolution
                        : undefined,
                    generateAudio: typeof el.selectedGenerateAudio === 'boolean' ? el.selectedGenerateAudio : undefined,
                }
                : { prompt: sub.prompt, model: sub.model, aspectRatio: sub.aspectRatio, imageSize: sub.imageSize, quality: sub.quality, generateCount: recoveredGenerateCount };

            void (async () => {
                try {
                    if (sub.taskType === 'video') {
                        const data = await runVideoGenerationFlow(requestBody as Parameters<typeof runVideoGenerationFlow>[0]);
                        const map = elementsMapRef.current;
                        const currentEl = map.get(elementId);
                        if (currentEl) {
                            if (data.status === 'pending') {
                                const updated = {
                                    ...currentEl,
                                    ...createGenerationTaskPatch(data.taskId, sub.taskType),
                                };
                                map.set(elementId, updated);
                                setElementsVersion(v => v + 1);
                                dirtyTrackerRef.current.markModified(elementId);
                                persistGeneration(pid, elementId, {
                                    taskId: data.taskId,
                                    taskType: sub.taskType,
                                    progress: 0,
                                    savedPrompt: sub.prompt,
                                });
                                showToast('🔄 已恢复之前的生成任务', 'info');
                            } else {
                                    const normalizedTaskId = typeof data.taskId === 'string' && data.taskId.trim().length > 0
                                        ? data.taskId.trim()
                                        : undefined;
                                const updated = {
                                    ...currentEl,
                                    type: 'video' as const,
                                    content: data.videoUrl,
                                        sourceGenerationTaskId: normalizedTaskId,
                                        sourceGenerationTaskType: normalizedTaskId ? 'video' as const : undefined,
                                    ...createGenerationIdlePatch(),
                                };
                                map.set(elementId, updated);
                                setElementsVersion(v => v + 1);
                                dirtyTrackerRef.current.markModified(elementId);
                                void persistGeneratedAssetToDisk(data.videoUrl, 'video', 'retry-video');
                                    recordProjectMediaItem({
                                        kind: 'video',
                                        content: data.videoUrl,
                                        taskId: normalizedTaskId,
                                        sourceElement: currentEl,
                                        sourceElementId: elementId,
                                    });
                                showToast('✅ 恢复的生成任务已完成', 'info');
                            }
                        }
                        return;
                    }

                    if (el.type === 'image') {
                        const resolvedContent = await getImageDataUrl(el.content!) || el.content!;
                        const extraReferenceImages = await resolveElementReferenceImages(el);
                        const scopedReferenceImages = [resolvedContent, ...extraReferenceImages.filter((image) => image !== resolvedContent)];
                        const data = await runImageGenerationFlow({
                            prompt: sub.prompt,
                            model: sub.model || el.selectedModel || undefined,
                            aspectRatio: sub.aspectRatio || el.selectedAspectRatio || undefined,
                            imageSize: sub.imageSize || el.selectedImageSize || undefined,
                            referenceImages: scopedReferenceImages.length > 0 ? scopedReferenceImages : undefined,
                            referenceImage: resolvedContent,
                            preferDirect: false,
                            forceAsync: true,
                        });

                        const map = elementsMapRef.current;
                        const currentEl = map.get(elementId);
                        if (currentEl?.type === 'image' && currentEl.content) {
                            if (data.status === 'pending') {
                                const updated = {
                                    ...currentEl,
                                    savedPrompt: sub.prompt,
                                    selectedModel: sub.model || currentEl.selectedModel,
                                    selectedAspectRatio: sub.aspectRatio || currentEl.selectedAspectRatio,
                                    selectedImageSize: sub.imageSize || currentEl.selectedImageSize,
                                    ...createGenerationTaskPatch(data.taskId, sub.taskType),
                                };
                                map.set(elementId, updated);
                                setElementsVersion(v => v + 1);
                                dirtyTrackerRef.current.markModified(elementId);
                                persistGeneration(pid, elementId, {
                                    taskId: data.taskId,
                                    taskType: sub.taskType,
                                    progress: 0,
                                    savedPrompt: sub.prompt,
                                });
                                showToast('🔄 已恢复之前的 AI 编辑任务', 'info');
                            } else {
                                await finalizeAiEditedImageElement(
                                    elementId,
                                    data.imageUrl,
                                    'retry-ai-edit',
                                    {
                                        x: currentEl.x,
                                        y: currentEl.y,
                                        width: currentEl.width ?? 512,
                                        height: currentEl.height ?? 512,
                                    },
                                    data.taskId,
                                );
                                showToast('✅ 恢复的 AI 编辑任务已完成', 'info');
                            }
                        }
                        return;
                    }

                    const imageRequest = {
                        ...(requestBody as {
                            prompt: string;
                            model?: string;
                            aspectRatio?: string;
                            imageSize?: string;
                            quality?: string;
                            generateCount?: number;
                        }),
                        preferDirect: false,
                        forceAsync: true,
                    };

                    const useDomesticBatching = shouldUseDomesticImageBatching(imageRequest.model);
                    const data = useDomesticBatching
                        ? await requestImageGeneration(imageRequest)
                        : await runImageGenerationFlow(imageRequest);

                    if (data.status === 'pending') {
                        const pendingTaskId = data.taskId;
                        if (typeof pendingTaskId !== 'string' || pendingTaskId.length === 0) {
                            throw new Error('恢复生成任务失败：缺少 taskId');
                        }
                        const map = elementsMapRef.current;
                        const currentEl = map.get(elementId);
                        if (currentEl) {
                            const updated = {
                                ...currentEl,
                                selectedGenerateCount: imageRequest.generateCount || currentEl.selectedGenerateCount,
                                generationResultIndex: 0,
                                ...createGenerationTaskPatch(pendingTaskId, sub.taskType),
                            };
                            map.set(elementId, updated);
                            if (useDomesticBatching && (imageRequest.generateCount || 1) > 1) {
                                const width = currentEl.width ?? 512;
                                const height = currentEl.height ?? 512;
                                const offsetX = width + 20;
                                for (let index = 1; index < (imageRequest.generateCount || 1); index += 1) {
                                    const siblingId = uuidv4();
                                    map.set(siblingId, {
                                        ...currentEl,
                                        id: siblingId,
                                        x: currentEl.x + offsetX * index,
                                        y: currentEl.y,
                                        width,
                                        height,
                                        generationResultIndex: index,
                                        selectedGenerateCount: imageRequest.generateCount || currentEl.selectedGenerateCount,
                                        ...createGenerationTaskPatch(pendingTaskId, sub.taskType),
                                    });
                                    dirtyTrackerRef.current.markAdded(siblingId);
                                    persistGeneration(pid, siblingId, {
                                        taskId: pendingTaskId,
                                        taskType: sub.taskType,
                                        progress: 0,
                                        savedPrompt: sub.prompt,
                                    });
                                }
                            }
                            setElementsVersion(v => v + 1);
                            dirtyTrackerRef.current.markModified(elementId);
                            persistGeneration(pid, elementId, {
                                taskId: pendingTaskId,
                                taskType: sub.taskType,
                                progress: 0,
                                savedPrompt: sub.prompt,
                            });
                        }
                        showToast('🔄 已恢复之前的生成任务', 'info');
                    } else {
                        const rawUrl = ('imageUrl' in data && typeof data.imageUrl === 'string' && data.imageUrl.length > 0)
                            ? data.imageUrl
                            : ('imageData' in data && typeof data.imageData === 'string' && data.imageData.length > 0)
                                ? data.imageData
                                : null;
                        if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
                            throw new Error('恢复生成任务失败：缺少图片结果');
                        }
                        const map = elementsMapRef.current;
                        const currentEl = map.get(elementId);
                        if (currentEl) {
                            const normalizedTaskId = typeof data.taskId === 'string' && data.taskId.trim().length > 0
                                ? data.taskId.trim()
                                : undefined;
                            let retryBlob: Blob | null = null;
                            if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
                                retryBlob = await fetchRemoteBlob(rawUrl, 'lovart-retry-image');
                            }
                            const finalContent = await normalizeGeneratedImageContent(rawUrl, 'retry-generate', retryBlob);
                            const displayMetrics = await resolveImageDisplayMetrics(finalContent, 'retry-generate', {
                                anchor: { x: currentEl.x, y: currentEl.y, width: currentEl.width ?? 512, height: currentEl.height ?? 512 },
                            }, retryBlob);
                            const updated = {
                                ...currentEl,
                                type: 'image' as const,
                                content: finalContent,
                                sourceGenerationTaskId: normalizedTaskId,
                                sourceGenerationTaskType: normalizedTaskId ? 'image' as const : undefined,
                                ...(displayMetrics ? { width: displayMetrics.width, height: displayMetrics.height } : {}),
                                ...createGenerationIdlePatch(),
                            };
                            map.set(elementId, updated);
                            setElementsVersion(v => v + 1);
                            dirtyTrackerRef.current.markModified(elementId);
                            void persistGeneratedAssetToDisk(finalContent, 'image', 'retry', retryBlob);
                            recordProjectMediaItem({
                                kind: 'image',
                                content: finalContent,
                                taskId: normalizedTaskId,
                                sourceElement: currentEl,
                                sourceElementId: elementId,
                            });
                        }
                        showToast('✅ 恢复的生成任务已完成', 'info');
                    }
                } catch (err) {
                    console.error('[GenPersist] Retry failed:', err);
                    showToast('之前的生成任务恢复失败，请重新点击生成', 'error');
                } finally {
                    clearSubmission(pid, elementId);
                    setGeneratorSubmittingMap(prev => updateGeneratorSubmittingMap(prev, elementId, false));
                }
            })();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, isCanvasReady]);
}
