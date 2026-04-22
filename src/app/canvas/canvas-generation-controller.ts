/**
 * canvas-generation-controller.ts — 生成任务轮询控制器
 *
 * 将 page.tsx 中的集中式生成轮询、健康跟踪、失败处理和队列可视化
 * 提取为一个独立 hook，减少画布页面的编排压力。
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import type { DirtyTracker } from '@/lib/editor-kernel';
import { GENERATION_POLLING_CONFIG } from '@/lib/ai-client';
import { pollGenerationTask } from './generation-polling';
import {
    applyGenerationFailure,
    applyGenerationProgress,
    applyVideoGenerationSuccess,
    buildGenerationQueueItems,
    getActiveGenerationTasks,
    updateGeneratorSubmittingMap,
} from './canvas-generation';
import {
    removeGeneration,
    clearSubmission,
    persistGenerationProgress,
} from './generation-persistence';
import type { GenerationHealthState } from './canvas-runtime-types';
import { classifyGenerationError, summarizeGenerationError } from '@/components/lovart/generator-error-utils';

// ── Types ────────────────────────────────────────────────────

export interface GenerationPollingCallbacks {
    finalizePolledImageResult: (element: CanvasElement, resultUrl: string) => Promise<void>;
    persistGeneratedAssetToDisk: (content: string, kind: 'image' | 'video', source: string) => Promise<void>;
    recordProjectMediaItem: (params: {
        kind: 'image' | 'video';
        content: string;
        taskId?: string;
        sourceElement?: CanvasElement | null;
        sourceElementId?: string;
    }) => void;
    announceCompletedResult: (elementId: string, message: string) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export interface UseGenerationPollingControllerArgs {
    elements: CanvasElement[];
    setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
    dirtyTrackerRef: React.RefObject<DirtyTracker>;
    currentProjectIdRef: React.RefObject<string | null>;
    generatorSubmittingMap: Record<string, boolean>;
    setGeneratorSubmittingMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    callbacks: GenerationPollingCallbacks;
}

// ── Hook ─────────────────────────────────────────────────────

export function useGenerationPollingController(args: UseGenerationPollingControllerArgs) {
    const {
        elements,
        setElements,
        dirtyTrackerRef,
        currentProjectIdRef,
        generatorSubmittingMap,
        setGeneratorSubmittingMap,
        callbacks,
    } = args;

    // ── Health tracking ──────────────────────────────────────

    const generationHealthRef = useRef<Record<string, GenerationHealthState>>({});

    const resolveCompletedImageUrlForElement = useCallback((
        element: CanvasElement,
        result: { resultUrl: string | null; resultUrls?: string[] },
    ) => {
        const urls = result.resultUrls?.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            ?? (result.resultUrl ? [result.resultUrl] : []);

        const requestedIndex = typeof element.generationResultIndex === 'number' && element.generationResultIndex >= 0
            ? Math.trunc(element.generationResultIndex)
            : 0;

        return urls[requestedIndex] ?? null;
    }, []);

    const seedGenerationHealth = useCallback((elementId: string, progress: number) => {
        const now = Date.now();
        const existing = generationHealthRef.current[elementId];

        if (!existing) {
            const next: GenerationHealthState = {
                startedAt: now,
                lastProgressAt: now,
                lastProgress: progress,
                consecutiveErrors: 0,
            };
            generationHealthRef.current[elementId] = next;
            return next;
        }

        if (progress > existing.lastProgress) {
            existing.lastProgress = progress;
            existing.lastProgressAt = now;
        }

        return existing;
    }, []);

    const pruneGenerationHealth = useCallback((activeIds: string[]) => {
        const activeIdSet = new Set(activeIds);
        for (const elementId of Object.keys(generationHealthRef.current)) {
            if (!activeIdSet.has(elementId)) {
                delete generationHealthRef.current[elementId];
            }
        }
    }, []);

    // ── Fail task ────────────────────────────────────────────

    const failGenerationTask = useCallback((
        elementId: string,
        taskType: 'image' | 'video',
        error: string,
    ) => {
        const classifiedMessage = classifyGenerationError(taskType, error);
        const errorSummary = summarizeGenerationError(classifiedMessage);
        delete generationHealthRef.current[elementId];

        const pid = currentProjectIdRef.current;
        if (pid) {
            removeGeneration(pid, elementId);
            clearSubmission(pid, elementId);
        }

        setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, false));
        setElements((prev) => applyGenerationFailure(prev, elementId, classifiedMessage));
        dirtyTrackerRef.current.markModified(elementId);
        callbacks.showToast(`${taskType === 'image' ? '图片' : '视频'}生成失败: ${errorSummary}`, 'error');
    }, [setElements, callbacks.showToast, setGeneratorSubmittingMap, currentProjectIdRef, dirtyTrackerRef]);

    // ── Active tasks memo ────────────────────────────────────

    const activeGenerationTasks = useMemo(
        () => getActiveGenerationTasks(elements),
        [elements],
    );

    const activeGenerationTaskSignature = useMemo(
        () => activeGenerationTasks
            .map(el => `${el.id}:${el.generatingTaskId ?? ''}:${el.generatingTaskType ?? ''}`)
            .join(','),
        [activeGenerationTasks],
    );

    // ── Queue visualization ──────────────────────────────────

    const generationQueueItems = useMemo(
        () => buildGenerationQueueItems(elements, generatorSubmittingMap),
        [elements, generatorSubmittingMap],
    );

    // ── Stable refs for polling effect (avoid re-triggering) ─

    const activeGenerationTasksRef = useRef(activeGenerationTasks);
    useEffect(() => {
        activeGenerationTasksRef.current = activeGenerationTasks;
    }, [activeGenerationTasks]);

    const callbacksRef = useRef(callbacks);
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    const failGenerationTaskRef = useRef(failGenerationTask);
    useEffect(() => {
        failGenerationTaskRef.current = failGenerationTask;
    }, [failGenerationTask]);

    const seedGenerationHealthRef = useRef(seedGenerationHealth);
    useEffect(() => {
        seedGenerationHealthRef.current = seedGenerationHealth;
    }, [seedGenerationHealth]);

    const pruneGenerationHealthRef = useRef(pruneGenerationHealth);
    useEffect(() => {
        pruneGenerationHealthRef.current = pruneGenerationHealth;
    }, [pruneGenerationHealth]);

    // ── Centralized polling effect ───────────────────────────

    useEffect(() => {
        const initialTasks = activeGenerationTasksRef.current;
        pruneGenerationHealthRef.current(initialTasks.map((task) => task.id));
        if (initialTasks.length === 0) return;

        for (const task of initialTasks) {
            seedGenerationHealthRef.current(task.id, task.generatingProgress || 0);
        }

        let cancelled = false;
        let isPolling = false;

        const pollAllTasks = async () => {
            if (cancelled || isPolling) {
                return;
            }

            isPolling = true;

            try {
                const tasks = activeGenerationTasksRef.current;
                if (tasks.length === 0) {
                    return;
                }

                await Promise.allSettled(tasks.map(async (el) => {
                    if (!el.generatingTaskId || !el.generatingTaskType) return;

                    try {
                        const health = seedGenerationHealthRef.current(el.id, el.generatingProgress || 0);
                        const staleTimeoutMs = GENERATION_POLLING_CONFIG.staleTimeoutMs[el.generatingTaskType];
                        const result = await pollGenerationTask(el.generatingTaskId, el.generatingTaskType);

                        if (cancelled) {
                            return;
                        }

                        if (result.status === 'completed') {
                            delete generationHealthRef.current[el.id];
                            const resultUrl = el.generatingTaskType === 'image'
                                ? resolveCompletedImageUrlForElement(el, result)
                                : result.resultUrl;
                            const pid = currentProjectIdRef.current;
                            if (pid) removeGeneration(pid, el.id);

                            if (resultUrl) {
                                if (el.generatingTaskType === 'image') {
                                    void callbacksRef.current.finalizePolledImageResult(el, resultUrl);
                                    callbacksRef.current.announceCompletedResult(el.id, '✅ 图片生成完成，已显示在生成器当前位置');
                                } else {
                                    void callbacksRef.current.persistGeneratedAssetToDisk(resultUrl, el.generatingTaskType, 'poll');
                                    setElements(prev => applyVideoGenerationSuccess(prev, el.id, resultUrl, el.generatingTaskId));
                                    callbacksRef.current.recordProjectMediaItem({
                                        kind: 'video',
                                        content: resultUrl,
                                        taskId: el.generatingTaskId,
                                        sourceElement: el,
                                        sourceElementId: el.id,
                                    });
                                    dirtyTrackerRef.current.markModified(el.id);
                                    callbacksRef.current.announceCompletedResult(el.id, '✅ 视频生成完成，已显示在生成器当前位置');
                                }
                            } else {
                                console.error(`[Polling] ${el.generatingTaskType} completed but resultUrl is null for element ${el.id}`);
                                failGenerationTaskRef.current(el.id, el.generatingTaskType, '生成完成但未获取到资源链接，请检查 API 返回数据格式');
                            }
                            return;
                        }

                        if (result.status === 'failed') {
                            failGenerationTaskRef.current(el.id, el.generatingTaskType, result.error);
                            return;
                        }

                        if (result.status === 'retryable-error') {
                            const now = Date.now();
                            health.consecutiveErrors += 1;
                            const exceededRetryLimit = health.consecutiveErrors >= GENERATION_POLLING_CONFIG.retryableErrorThreshold;
                            const exceededTimeout = now - health.lastProgressAt >= staleTimeoutMs;

                            if (exceededRetryLimit || exceededTimeout) {
                                failGenerationTaskRef.current(
                                    el.id,
                                    el.generatingTaskType,
                                    result.error,
                                );
                                return;
                            }

                            console.warn(`[Poll ${el.generatingTaskType}] Retry ${health.consecutiveErrors}/${GENERATION_POLLING_CONFIG.retryableErrorThreshold}: ${result.error}`);
                            return;
                        }

                        const now = Date.now();
                        health.consecutiveErrors = 0;
                        const newProgress = result.progress;
                        if (newProgress > health.lastProgress) {
                            health.lastProgress = newProgress;
                            health.lastProgressAt = now;
                        }

                        if (now - health.lastProgressAt >= staleTimeoutMs) {
                            failGenerationTaskRef.current(
                                el.id,
                                el.generatingTaskType,
                                `${el.generatingTaskType === 'image' ? '图片' : '视频'}生成超时，请重新点击生成`,
                            );
                            return;
                        }

                        if (newProgress !== el.generatingProgress) {
                            setElements(prev => applyGenerationProgress(prev, el.id, newProgress));
                            dirtyTrackerRef.current.markModified(el.id);
                            const pid = currentProjectIdRef.current;
                            if (pid) persistGenerationProgress(pid, el.id, newProgress);
                        }
                    } catch (error) {
                        const now = Date.now();
                        const staleTimeoutMs = GENERATION_POLLING_CONFIG.staleTimeoutMs[el.generatingTaskType];
                        const health = generationHealthRef.current[el.id] ?? {
                            startedAt: now,
                            lastProgressAt: now,
                            lastProgress: el.generatingProgress || 0,
                            consecutiveErrors: 0,
                        };

                        health.consecutiveErrors += 1;
                        generationHealthRef.current[el.id] = health;

                        const exceededRetryLimit = health.consecutiveErrors >= GENERATION_POLLING_CONFIG.retryableErrorThreshold;
                        const exceededTimeout = now - health.lastProgressAt >= staleTimeoutMs;
                        if (exceededRetryLimit || exceededTimeout) {
                            failGenerationTaskRef.current(
                                el.id,
                                el.generatingTaskType,
                                error instanceof Error
                                    ? `状态查询异常：${error.message}`
                                    : '状态查询异常，请重新点击生成',
                            );
                            return;
                        }

                        console.warn(`[Poll ${el.generatingTaskType}] Retry ${health.consecutiveErrors}/${GENERATION_POLLING_CONFIG.retryableErrorThreshold}:`, error);
                    }
                }));
            } finally {
                isPolling = false;
            }
        };

        void pollAllTasks();
        const intervalId = setInterval(() => {
            void pollAllTasks();
        }, GENERATION_POLLING_CONFIG.intervalMs);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [activeGenerationTaskSignature, setElements, currentProjectIdRef, dirtyTrackerRef, resolveCompletedImageUrlForElement]);

    return {
        failGenerationTask,
        generationQueueItems,
        activeGenerationTaskSignature,
    };
}
