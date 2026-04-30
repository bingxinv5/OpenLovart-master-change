import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import {
    createGenerationTaskPatch,
} from '@/lib/generation-task-state';
import {
    applyElementGenerationPatch,
    applyVideoGenerationSuccess,
    updateGeneratorSubmittingMap,
} from './canvas-generation';
import { clearSubmission, persistGeneration, removeGeneration } from './generation-persistence';
import { pollGenerationTask } from './generation-polling';
import { DirtyTracker } from '@/lib/editor-kernel';
import type { CanvasToastType } from './canvas-feedback';
import { buildCenteredElementBounds } from './canvas-element-ops';

type SetElements = (updater: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) => void;

type RecordProjectMediaItem = (item: {
    kind: 'image' | 'video';
    content: string;
    taskId?: string;
    sourceElement?: CanvasElement | null;
    sourceElementId?: string;
}) => void;

export interface UseCanvasGenerationActionsParams {
    selectedIds: string[];
    elements: CanvasElement[];
    elementsMapRef: MutableRefObject<Map<string, CanvasElement>>;
    currentProjectIdRef: MutableRefObject<string | null>;
    dirtyTrackerRef: MutableRefObject<DirtyTracker>;
    setElements: SetElements;
    setGeneratorSubmittingMap: Dispatch<SetStateAction<Record<string, boolean>>>;
    getPlacementPosition: () => { x: number; y: number };
    buildVideoElement: (attrs: Omit<CanvasElement, 'id' | 'type'>) => CanvasElement;
    addAndSelectElement: (element: CanvasElement) => void;
    persistGeneratedAssetToDisk: (content: string, kind: 'image' | 'video', source: string) => Promise<unknown> | unknown;
    recordProjectMediaItem: RecordProjectMediaItem;
    failGenerationTask: (elementId: string, taskType: 'image' | 'video', error: string) => void;
    announceCompletedResult: (elementId: string, message: string) => void;
    showToast: (message: string, type?: CanvasToastType) => void;
    replaceGeneratorWithPendingImage: (elementId: string, resultUrl: string, taskId?: string) => void;
    finalizeGeneratedImageElement: (
        elementId: string,
        resultUrl: string,
        source: string,
        anchor: { x: number; y: number; width: number; height: number },
        taskId?: string | null,
    ) => Promise<void>;
}

export function useCanvasGenerationActions({
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
}: UseCanvasGenerationActionsParams) {
    const handleGenerateVideo = useCallback(async ({ videoUrl, taskId }: { videoUrl: string; taskId?: string | null }) => {
        const normalizedTaskId = typeof taskId === 'string' && taskId.trim().length > 0
            ? taskId.trim()
            : undefined;
        const generatorElement = selectedIds
            .map((id) => elements.find((element) => element.id === id))
            .find((element): element is CanvasElement => !!element && element.type === 'video-generator') || null;
        void persistGeneratedAssetToDisk(videoUrl, 'video', 'generate');
        const generatorElementId = selectedIds.find((id) => elements.find((element) => element.id === id)?.type === 'video-generator');
        let insertedElement: CanvasElement | null = null;

        if (generatorElementId) {
            setElements((prev) => applyVideoGenerationSuccess(prev, generatorElementId, videoUrl, normalizedTaskId));
        } else {
            const center = getPlacementPosition();
            const newElement = buildVideoElement({
                ...buildCenteredElementBounds(center, 400, 300),
                content: videoUrl,
                sourceGenerationTaskId: normalizedTaskId,
                sourceGenerationTaskType: normalizedTaskId ? 'video' : undefined,
            });
            insertedElement = newElement;
            addAndSelectElement(newElement);
        }
        recordProjectMediaItem({
            kind: 'video',
            content: videoUrl,
            taskId: normalizedTaskId,
            sourceElement: generatorElement || insertedElement,
            sourceElementId: generatorElementId || insertedElement?.id,
        });
    }, [addAndSelectElement, buildVideoElement, elements, getPlacementPosition, persistGeneratedAssetToDisk, recordProjectMediaItem, selectedIds, setElements]);

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
                setElements((prev) => applyVideoGenerationSuccess(prev, elementId, resultUrl, taskId));
                dirtyTrackerRef.current.markModified(elementId);
                if (projectId) {
                    clearSubmission(projectId, elementId);
                    removeGeneration(projectId, elementId);
                }
                recordProjectMediaItem({
                    kind: 'video',
                    content: resultUrl,
                    taskId,
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
    }, [announceCompletedResult, currentProjectIdRef, dirtyTrackerRef, elementsMapRef, failGenerationTask, persistGeneratedAssetToDisk, recordProjectMediaItem, setElements, setGeneratorSubmittingMap, showToast]);

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

                replaceGeneratorWithPendingImage(elementId, resultUrl, taskId);
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
                    taskId,
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
    }, [announceCompletedResult, currentProjectIdRef, dirtyTrackerRef, elementsMapRef, failGenerationTask, finalizeGeneratedImageElement, replaceGeneratorWithPendingImage, setElements, setGeneratorSubmittingMap, showToast]);

    return {
        handleGenerateVideo,
        handleRecoverVideoTask,
        handleRecoverImageTask,
    };
}