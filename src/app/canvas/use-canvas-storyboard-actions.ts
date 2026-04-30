import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { classifyGenerationError, isRecoverableGenerationSubmissionError, withSubmissionRecoveryHint } from '@/components/lovart/generator-error-utils';
import { runImageGenerationFlow } from '@/components/lovart/image-generation-flow';
import { runVideoGenerationFlow } from '@/components/lovart/video-generation-flow';
import type { StoryboardPlanResponse } from '@/lib/ai-client';
import { createGenerationIdlePatch, createGenerationTaskPatch } from '@/lib/generation-task-state';
import type { WorkbenchSettings } from '@/lib/workbench-settings';
import { buildStoryboardExportBlob, type StoryboardExportOptions } from '@/lib/storyboard-export';
import { isWorkerCancelledError } from '@/lib/image-worker-bridge';
import type { CanvasToastType } from './canvas-feedback';
import {
    applyElementGenerationPatch,
    applyGenerationFailure,
    applyVideoGenerationSuccess,
    updateGeneratorSubmittingMap,
} from './canvas-generation';
import { buildCenteredElementBounds } from './canvas-element-ops';
import {
    buildStoryboardPlaceholderDataUrl,
    getStoryboardAuditState,
    hasStoryboardGenerationSeed,
    sortStoryboardElements,
} from './canvas-storyboard-utils';
import { getElementBaseName, sanitizeFilenameStem } from './canvas-element-naming';
import { saveBlobToLocalFile } from './canvas-export-utils';
import { mapStoryboardFilterToScope } from './canvas-session-prefs';
import type {
    StoryboardAuditFilter,
    StoryboardNavigationScope,
} from './canvas-runtime-types';
import { clearSubmission, persistGeneration, persistSubmission, removeGeneration } from './generation-persistence';

type CanvasElementBuilder = (attrs: Omit<CanvasElement, 'id' | 'type'>) => CanvasElement;
type CanvasGeneratorBuilder = (
    type: Extract<CanvasElement['type'], 'image-generator' | 'video-generator' | 'storyboard-planner'>,
    attrs: Omit<CanvasElement, 'id' | 'type'>,
) => CanvasElement;

type StoryboardExportOrderedItem = {
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
};

interface UseCanvasStoryboardActionsOptions {
    elementsMapRef: MutableRefObject<Map<string, CanvasElement>>;
    dirtyTrackerRef: MutableRefObject<{ markModified: (id: string) => void }>;
    currentProjectIdRef: MutableRefObject<string | null>;
    setElements: Dispatch<SetStateAction<CanvasElement[]>>;
    setSelectedIds: Dispatch<SetStateAction<string[]>>;
    setGeneratorSubmittingMap: Dispatch<SetStateAction<Record<string, boolean>>>;
    workbenchSettings: WorkbenchSettings;
    getPlacementPosition: () => { x: number; y: number };
    buildImageElement: CanvasElementBuilder;
    buildGeneratorElement: CanvasGeneratorBuilder;
    addElementsWithOptionalAutoGroup: (items: CanvasElement[], groupName: string) => void;
    resolveElementReferenceImages: (element: CanvasElement) => Promise<string[]>;
    resolveElementFrameImages: (element: CanvasElement) => Promise<Array<{ image: string; image_type: string }>>;
    replaceGeneratorWithPendingImage: (
        elementId: string,
        imageUrl: string,
        taskId?: string | null,
    ) => void;
    finalizeGeneratedImageElement: (
        elementId: string,
        imageUrl: string,
        source: string,
        fallbackBounds: { x: number; y: number; width: number; height: number },
        taskId?: string | null,
    ) => Promise<void>;
    persistGeneratedAssetToDisk: (
        content: string,
        kind: 'image' | 'video',
        source: string,
        prefetchedBlob?: Blob | null,
    ) => Promise<void>;
    recordProjectMediaItem: (params: {
        kind: 'image' | 'video' | 'audio';
        content: string;
        taskId?: string;
        prompt?: string;
        sourceElement?: CanvasElement | null;
        sourceElementId?: string;
    }) => void;
    announcePassiveCompletedResult: (elementId: string, message: string) => void;
    normalizeGeneratedImageContent: (content: string, source: string, prefetchedBlob?: Blob | null) => Promise<string>;
    resolveCanvasContentBlob: (content: string, remoteFilename: string) => Promise<Blob | null>;
    handleElementChange: (id: string, newAttrs: Partial<CanvasElement>) => void;
    focusCanvasElement: (elementId: string) => void;
    showToast: (message: string, type?: CanvasToastType) => void;
    setStoryboardPlannerSourceElementId: Dispatch<SetStateAction<string | null>>;
    setIsStoryboardExportOpen: Dispatch<SetStateAction<boolean>>;
    setIsStoryboardExportSubmitting: Dispatch<SetStateAction<boolean>>;
    setStoryboardExportSubmitStatus: Dispatch<SetStateAction<string>>;
    setAnnotateImageTargetId: Dispatch<SetStateAction<string | null>>;
    setCropImageTargetId: Dispatch<SetStateAction<string | null>>;
    setSplitStoryboardTargetId: Dispatch<SetStateAction<string | null>>;
    setStoryboardAuditFilter: Dispatch<SetStateAction<StoryboardAuditFilter>>;
    autoAdvanceStoryboardIssues: boolean;
    autoAdvanceStoryboardScope: StoryboardNavigationScope;
    setAutoAdvanceStoryboardScope: Dispatch<SetStateAction<StoryboardNavigationScope>>;
    showLayers: boolean;
    toggleLayers: () => void;
}

export function useCanvasStoryboardActions({
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
}: UseCanvasStoryboardActionsOptions) {
    const handleStoryboardPlanFromImage = useCallback((element: CanvasElement) => {
        if (element.type !== 'image' || !element.content) {
            return;
        }

        setStoryboardPlannerSourceElementId(element.id);
        setSelectedIds([element.id]);
    }, [setSelectedIds, setStoryboardPlannerSourceElementId]);

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
                    selectedImageQuality: workbenchSettings.imageDefaults.quality,
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
                    selectedImageQuality: workbenchSettings.imageDefaults.quality,
                });
            });

            addElementsWithOptionalAutoGroup(draftElements, groupName);
            setStoryboardPlannerSourceElementId(null);
            showToast(
                `宫格总图生成失败，已导入 ${draftElements.length} 个可编辑分镜卡片到画布`,
                'success',
            );
        })();
    }, [addElementsWithOptionalAutoGroup, buildImageElement, getPlacementPosition, normalizeGeneratedImageContent, setStoryboardPlannerSourceElementId, showToast, workbenchSettings.imageDefaults.aspectRatio, workbenchSettings.imageDefaults.imageSize, workbenchSettings.imageDefaults.model, workbenchSettings.imageDefaults.quality]);

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
        const quality = currentElement.selectedImageQuality || workbenchSettings.imageDefaults.quality;
        const referenceImages = await resolveElementReferenceImages(currentElement);
        const projectId = currentProjectIdRef.current;

        setGeneratorSubmittingMap((prev) => updateGeneratorSubmittingMap(prev, elementId, true));
        if (projectId) {
            persistSubmission(projectId, elementId, {
                prompt,
                model,
                aspectRatio,
                imageSize,
                quality,
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
                quality,
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

            replaceGeneratorWithPendingImage(elementId, resultUrl, data.taskId);
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
                data.taskId,
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
    }, [announcePassiveCompletedResult, currentProjectIdRef, dirtyTrackerRef, elementsMapRef, finalizeGeneratedImageElement, replaceGeneratorWithPendingImage, resolveElementReferenceImages, setElements, setGeneratorSubmittingMap, workbenchSettings.imageDefaults.aspectRatio, workbenchSettings.imageDefaults.imageSize, workbenchSettings.imageDefaults.model, workbenchSettings.imageDefaults.quality]);

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
            setElements((prev) => applyVideoGenerationSuccess(prev, elementId, videoUrl, data.taskId));
            dirtyTrackerRef.current.markModified(elementId);
            if (projectId) {
                removeGeneration(projectId, elementId);
            }
            recordProjectMediaItem({
                kind: 'video',
                content: videoUrl,
                taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
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
    }, [announcePassiveCompletedResult, currentProjectIdRef, dirtyTrackerRef, elementsMapRef, persistGeneratedAssetToDisk, recordProjectMediaItem, resolveElementFrameImages, setElements, setGeneratorSubmittingMap, workbenchSettings.videoDefaults.aspectRatio, workbenchSettings.videoDefaults.duration, workbenchSettings.videoDefaults.enhancePrompt, workbenchSettings.videoDefaults.model]);

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
    }, [dirtyTrackerRef, elementsMapRef, setElements, setSelectedIds, showToast, submitStoryboardGeneratorElement]);

    const handleGenerateStoryboardVideoSelection = useCallback((ids: string[]) => {
        const targets = ids
            .map((id) => elementsMapRef.current.get(id))
            .filter((element): element is CanvasElement => !!element && hasStoryboardGenerationSeed(element));
        const orderedTargets = sortStoryboardElements(targets);

        if (orderedTargets.length === 0) {
            showToast('所选内容里没有可批量出视频的分镜卡片', 'error');
            return;
        }

        const ys = orderedTargets.map((element) => element.y);
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
    }, [addElementsWithOptionalAutoGroup, buildGeneratorElement, elementsMapRef, showToast, submitStoryboardVideoGeneratorElement, workbenchSettings.videoDefaults.aspectRatio, workbenchSettings.videoDefaults.duration, workbenchSettings.videoDefaults.enhancePrompt, workbenchSettings.videoDefaults.model]);

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
    }, [elementsMapRef, handleElementChange]);

    const handleExportStoryboard = useCallback(async (
        options: StoryboardExportOptions,
        orderedItems: StoryboardExportOrderedItem[],
    ) => {
        const selectedImageElements = orderedItems
            .map((item) => ({ source: elementsMapRef.current.get(item.id), meta: item }))
            .filter((entry): entry is { source: CanvasElement; meta: StoryboardExportOrderedItem } => !!entry.source && entry.source.type === 'image' && !!entry.source.content);

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
    }, [elementsMapRef, resolveCanvasContentBlob, setIsStoryboardExportOpen, setIsStoryboardExportSubmitting, setStoryboardExportSubmitStatus, showToast]);

    const handleStoryboardAuditFilterChange = useCallback((filter: StoryboardAuditFilter) => {
        setStoryboardAuditFilter(filter);
        setAutoAdvanceStoryboardScope(mapStoryboardFilterToScope(filter));
    }, [setAutoAdvanceStoryboardScope, setStoryboardAuditFilter]);

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
    }, [autoAdvanceStoryboardIssues, autoAdvanceStoryboardScope, elementsMapRef, focusCanvasElement, showLayers, showToast, toggleLayers]);

    const handleExportStoryboardSelection = useCallback((ids: string[]) => {
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
    }, [elementsMapRef, setAnnotateImageTargetId, setCropImageTargetId, setIsStoryboardExportOpen, setSplitStoryboardTargetId, showToast]);

    return {
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
    };
}