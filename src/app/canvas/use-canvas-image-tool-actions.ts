import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { classifyGenerationError, isRecoverableGenerationSubmissionError, withSubmissionRecoveryHint } from '@/components/lovart/generator-error-utils';
import { runImageGenerationFlow } from '@/components/lovart/image-generation-flow';
import { createGenerationTaskPatch } from '@/lib/generation-task-state';
import { getImageGenerationDefaults } from '@/lib/generation-defaults';
import { getImageDataUrl, saveImageBlob } from '@/lib/editor-kernel';
import { annotateImageBlob, type AnnotateImageOptions } from '@/lib/image-annotate';
import { cropImageBlob, type CropImageOptions } from '@/lib/image-crop';
import { splitImageBlobIntoFrames, type StoryboardSplitFrame, type StoryboardSplitOptions } from '@/lib/storyboard-split';
import { upscaleImageBlob, type UpscaleModelId } from '@/lib/upscale-api';
import { isWorkerCancelledError } from '@/lib/image-worker-bridge';
import type { WorkbenchSettings } from '@/lib/workbench-settings';
import type { ResolveImageDisplayMetricsOptions } from './canvas-image-assets';
import type { CanvasToastType } from './canvas-feedback';
import { createSingleImageToolResultElement } from './image-tool-result';
import {
    applyElementGenerationPatch,
    applyGenerationFailure,
    setElementGenerationTask,
    updateGeneratorSubmittingMap,
} from './canvas-generation';
import { pollGenerationTask } from './generation-polling';
import { clearSubmission, persistGeneration, removeGeneration } from './generation-persistence';
import { chooseSplitLayoutOrigin } from './canvas-geometry-utils';
import { getViewportBounds } from './canvas-media-utils';
import {
    getElementBaseName,
    resolveToolResultNaming,
    sanitizeToolName,
} from './canvas-element-naming';

type SingleImageToolResultOptions = Parameters<typeof createSingleImageToolResultElement>[0];
type BuildDisplayMetricsOptions = SingleImageToolResultOptions['buildDisplayMetricsOptions'];
type BuildResultElement = SingleImageToolResultOptions['buildResultElement'];

type CanvasElementBuilder = (attrs: Omit<CanvasElement, 'id' | 'type'>) => CanvasElement;

type ImageToolStatusSetter = Dispatch<SetStateAction<string>>;
type ImageToolSubmittingSetter = Dispatch<SetStateAction<boolean>>;

interface UseCanvasImageToolActionsOptions {
    elements: CanvasElement[];
    elementsMapRef: MutableRefObject<Map<string, CanvasElement>>;
    dirtyTrackerRef: MutableRefObject<{ markModified: (id: string) => void }>;
    currentProjectIdRef: MutableRefObject<string | null>;
    scaleRef: MutableRefObject<number>;
    panRef: MutableRefObject<{ x: number; y: number }>;
    setElements: Dispatch<SetStateAction<CanvasElement[]>>;
    setGeneratorSubmittingMap: Dispatch<SetStateAction<Record<string, boolean>>>;
    workbenchSettings: WorkbenchSettings;
    resolveElementReferenceImages: (element: CanvasElement) => Promise<string[]>;
    finalizeAiEditedImageElement: (
        elementId: string,
        imageUrl: string,
        source: string,
        fallbackBounds: { x: number; y: number; width: number; height: number },
        taskId?: string | null,
    ) => Promise<void>;
    failGenerationTask: (elementId: string, taskType: 'image' | 'video', error: string) => void;
    announceCompletedResult: (elementId: string, message: string) => void;
    showToast: (message: string, type?: CanvasToastType) => void;
    handleGeneratorSubmittingChange: (
        elementId: string,
        submitting: boolean,
        liveParams?: { prompt?: string; model?: string; aspectRatio?: string; imageSize?: string; quality?: string; duration?: string; generateCount?: number },
        completion?: { outcome: 'succeeded' | 'failed' | 'interrupted' },
    ) => void;
    resolveCanvasContentBlob: (content: string, remoteFilename: string) => Promise<Blob | null>;
    resolveImageDisplayMetrics: (
        content: string,
        source: string,
        options?: ResolveImageDisplayMetricsOptions,
        prefetchedBlob?: Blob | null,
    ) => Promise<{ width: number; height: number; x?: number; y?: number; aspectRatio?: string } | null>;
    buildBelowElementDisplayMetricsOptions: BuildDisplayMetricsOptions;
    buildBelowSourceImageResultElement: BuildResultElement;
    buildImageElement: CanvasElementBuilder;
    addElementsWithOptionalAutoGroup: (items: CanvasElement[], groupName: string) => void;
    beginImageToolSubmission: (params: {
        setSubmitting: ImageToolSubmittingSetter;
        setStatus: ImageToolStatusSetter;
        loadingToast: string;
    }) => void;
    endImageToolSubmission: (
        setSubmitting: ImageToolSubmittingSetter,
        setStatus: ImageToolStatusSetter,
    ) => void;
    ensureImageToolSource: (element: CanvasElement, message: string) => boolean;
    setAnnotateImageTargetId: Dispatch<SetStateAction<string | null>>;
    setIsAnnotateImageSubmitting: ImageToolSubmittingSetter;
    setAnnotateImageSubmitStatus: ImageToolStatusSetter;
    setCropImageTargetId: Dispatch<SetStateAction<string | null>>;
    setIsCropImageSubmitting: ImageToolSubmittingSetter;
    setCropImageSubmitStatus: ImageToolStatusSetter;
    setSplitStoryboardTargetId: Dispatch<SetStateAction<string | null>>;
    setIsSplitStoryboardSubmitting: ImageToolSubmittingSetter;
    setSplitStoryboardSubmitStatus: ImageToolStatusSetter;
}

export function useCanvasImageToolActions({
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
}: UseCanvasImageToolActionsOptions) {
    const handleAiEditElement = useCallback(async (element: CanvasElement, prompt: string) => {
        if (!element.content) {
            showToast('该元素没有可编辑的图片内容', 'error');
            return;
        }

        const imageDefaults = getImageGenerationDefaults();
        const model = element.selectedModel || imageDefaults.model;
        const aspectRatio = element.selectedAspectRatio || imageDefaults.aspectRatio;
        const imageSize = element.selectedImageSize || imageDefaults.imageSize;
        const quality = element.selectedImageQuality || imageDefaults.quality;

        handleGeneratorSubmittingChange(element.id, true, { prompt, model, aspectRatio, imageSize, quality });
        showToast('✨ AI 正在处理中，请稍候...', 'info');

        const resolvedContent = await getImageDataUrl(element.content) || element.content;
        const extraReferenceImages = await resolveElementReferenceImages(element);
        const scopedReferenceImages = [resolvedContent, ...extraReferenceImages.filter((image) => image !== resolvedContent)];

        setElements(prev => prev.map((item) => (
            item.id === element.id
                ? {
                    ...item,
                    savedPrompt: prompt,
                    selectedModel: model,
                    selectedAspectRatio: aspectRatio,
                    selectedImageSize: imageSize,
                    selectedImageQuality: quality,
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
                quality,
                referenceImages: scopedReferenceImages.length > 0 ? scopedReferenceImages : undefined,
                referenceImage: resolvedContent,
                preferDirect: false,
                forceAsync: true,
            });

            submissionAccepted = true;
            submissionOutcome = 'succeeded';

            if (data.status === 'pending') {
                const taskId = data.taskId;
                setElements(prev => setElementGenerationTask(prev, element.id, taskId, 'image'));
                dirtyTrackerRef.current.markModified(element.id);
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
                    data.taskId,
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
            handleGeneratorSubmittingChange(element.id, false, { prompt, model, aspectRatio, imageSize, quality }, { outcome: submissionOutcome });
        }
    }, [announceCompletedResult, currentProjectIdRef, dirtyTrackerRef, finalizeAiEditedImageElement, handleGeneratorSubmittingChange, resolveElementReferenceImages, setElements, showToast]);

    const handleRecoverEditedImageTask = useCallback(async (elementId: string, rawTaskId: string) => {
        const taskId = rawTaskId.trim();
        if (!taskId) {
            throw new Error('请输入有效的 task_id');
        }

        const currentElement = elementsMapRef.current.get(elementId);
        if (!currentElement || currentElement.type !== 'image' || !currentElement.content) {
            throw new Error('当前图片不存在，无法查询 task_id 对应结果');
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
                    taskId,
                );
                if (projectId) {
                    clearSubmission(projectId, elementId);
                    removeGeneration(projectId, elementId);
                }
                announceCompletedResult(elementId, '✅ 已通过 task_id 查询并更新当前图片');
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
    }, [announceCompletedResult, currentProjectIdRef, dirtyTrackerRef, elementsMapRef, failGenerationTask, finalizeAiEditedImageElement, setElements, setGeneratorSubmittingMap, showToast]);

    const handleReplaceBackground = useCallback(async (element: CanvasElement, prompt: string) => {
        handleAiEditElement(element, prompt);
    }, [handleAiEditElement]);

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
            const sourceBlob = await resolveCanvasContentBlob(element.content!, 'lovart-annotate-image');

            if (!sourceBlob) {
                throw new Error('无法读取图片内容');
            }

            setAnnotateImageSubmitStatus('正在后台生成标注图...');
            const annotatedBlob = await annotateImageBlob(sourceBlob, options);

            const naming = resolveToolResultNaming({
                element,
                prefix: options.namePrefix,
                groupLabel: '标注结果',
                fallbackLabel: '标注结果',
                buildPrefixedItemNames: (trimmedPrefix) => [`${trimmedPrefix} · 标注`],
            });

            setAnnotateImageSubmitStatus('正在写入画布素材...');
            const { element: newElement } = await createSingleImageToolResultElement({
                sourceElement: element,
                resultBlob: annotatedBlob,
                metricsSource: 'annotate-image',
                maxHeightPadding: 160,
                onContentSaved: () => setAnnotateImageSubmitStatus('正在计算展示尺寸...'),
                displayName: naming.itemNames[0] || sanitizeToolName(options.label.trim() || `${getElementBaseName(element)} · 标注`, '标注结果'),
                extraAttrs: {
                    annotationTitle: options.label.trim(),
                    annotationNote: options.note?.trim() || '',
                },
                saveBlob: saveImageBlob,
                resolveImageDisplayMetrics,
                buildDisplayMetricsOptions: buildBelowElementDisplayMetricsOptions,
                buildResultElement: buildBelowSourceImageResultElement,
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
    }, [addElementsWithOptionalAutoGroup, announceCompletedResult, beginImageToolSubmission, buildBelowElementDisplayMetricsOptions, buildBelowSourceImageResultElement, endImageToolSubmission, ensureImageToolSource, resolveCanvasContentBlob, resolveImageDisplayMetrics, setAnnotateImageSubmitStatus, setAnnotateImageTargetId, setIsAnnotateImageSubmitting, showToast]);

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
            const sourceBlob = await resolveCanvasContentBlob(element.content!, 'lovart-crop-image');

            if (!sourceBlob) {
                throw new Error('无法读取图片内容');
            }

            setCropImageSubmitStatus('正在后台裁剪图片...');
            const croppedBlob = await cropImageBlob(sourceBlob, options);

            const naming = resolveToolResultNaming({
                element,
                prefix: options.namePrefix,
                groupLabel: '裁剪结果',
                fallbackLabel: '裁剪结果',
                buildPrefixedItemNames: (trimmedPrefix) => [`${trimmedPrefix} · 裁剪`],
            });

            setCropImageSubmitStatus('正在写入画布素材...');
            const { element: newElement } = await createSingleImageToolResultElement({
                sourceElement: element,
                resultBlob: croppedBlob,
                metricsSource: 'crop-image',
                onContentSaved: () => setCropImageSubmitStatus('正在计算展示尺寸...'),
                displayName: naming.itemNames[0],
                saveBlob: saveImageBlob,
                resolveImageDisplayMetrics,
                buildDisplayMetricsOptions: buildBelowElementDisplayMetricsOptions,
                buildResultElement: buildBelowSourceImageResultElement,
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
    }, [addElementsWithOptionalAutoGroup, announceCompletedResult, beginImageToolSubmission, buildBelowElementDisplayMetricsOptions, buildBelowSourceImageResultElement, endImageToolSubmission, ensureImageToolSource, resolveCanvasContentBlob, resolveImageDisplayMetrics, setCropImageSubmitStatus, setCropImageTargetId, setIsCropImageSubmitting, showToast]);

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
            const sourceBlob = await resolveCanvasContentBlob(element.content!, 'lovart-split-storyboard');

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
    }, [addElementsWithOptionalAutoGroup, announceCompletedResult, beginImageToolSubmission, buildImageElement, elements, endImageToolSubmission, ensureImageToolSource, panRef, resolveCanvasContentBlob, resolveImageDisplayMetrics, scaleRef, setIsSplitStoryboardSubmitting, setSplitStoryboardSubmitStatus, setSplitStoryboardTargetId, showToast]);

    const handleAnnotateImageRequest = useCallback((element: CanvasElement) => {
        setCropImageTargetId(null);
        setSplitStoryboardTargetId(null);
        setAnnotateImageTargetId((current) => current === element.id ? null : element.id);
    }, [setAnnotateImageTargetId, setCropImageTargetId, setSplitStoryboardTargetId]);

    const handleCropImageRequest = useCallback((element: CanvasElement) => {
        setAnnotateImageTargetId(null);
        setSplitStoryboardTargetId(null);
        setCropImageTargetId((current) => current === element.id ? null : element.id);
    }, [setAnnotateImageTargetId, setCropImageTargetId, setSplitStoryboardTargetId]);

    const handleSplitStoryboardRequest = useCallback((element: CanvasElement) => {
        setAnnotateImageTargetId(null);
        setCropImageTargetId(null);
        setSplitStoryboardTargetId((current) => current === element.id ? null : element.id);
    }, [setAnnotateImageTargetId, setCropImageTargetId, setSplitStoryboardTargetId]);

    return {
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
    };
}