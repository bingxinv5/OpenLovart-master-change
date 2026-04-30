import type { GenerationQueueItem } from '@/components/lovart/GenerationQueuePanel';
import type {
    CanvasElement,
    CanvasGeneratorElement,
    CanvasImageElement,
    CanvasImageGeneratorElement,
    CanvasMediaElement,
    CanvasStoryboardPlannerElement,
    CanvasVideoElement,
    CanvasVideoGeneratorElement,
} from '@/components/lovart/canvas-types';
import { isCanvasGeneratorElement, isCanvasMediaElement } from '@/components/lovart/canvas-types';
import { summarizeGenerationError } from '@/components/lovart/generator-error-utils';
import {
    createGenerationFailurePatch,
    createGenerationIdlePatch,
    createGenerationTaskPatch,
    type GenerationTaskPatch,
} from '@/lib/generation-task-state';

export type GeneratorSubmittingMap = Record<string, boolean>;

type GenerationQueueElement = CanvasGeneratorElement | CanvasMediaElement;
type ImageGenerationQueueElement = CanvasImageElement | CanvasImageGeneratorElement | CanvasStoryboardPlannerElement;
type VideoGenerationQueueElement = CanvasVideoElement | CanvasVideoGeneratorElement;

function isImageGenerationQueueElement(element: GenerationQueueElement): element is ImageGenerationQueueElement {
    return element.type === 'image' || element.type === 'image-generator' || element.type === 'storyboard-planner';
}

function isVideoGenerationQueueElement(element: GenerationQueueElement): element is VideoGenerationQueueElement {
    return element.type === 'video' || element.type === 'video-generator';
}

const QUEUE_TONE_PRIORITY: Record<GenerationQueueItem['tone'], number> = {
    running: 5,
    finishing: 4,
    queued: 3,
    submitting: 2,
    failed: 1,
};

export function updateGeneratorSubmittingMap(
    previous: GeneratorSubmittingMap,
    elementId: string,
    submitting: boolean,
): GeneratorSubmittingMap {
    const current = !!previous[elementId];
    if (current === submitting) {
        return previous;
    }

    if (submitting) {
        return { ...previous, [elementId]: true };
    }

    const next = { ...previous };
    delete next[elementId];
    return next;
}

export function setElementGenerationTask(
    elements: CanvasElement[],
    elementId: string,
    taskId: string,
    taskType: 'image' | 'video',
): CanvasElement[] {
    return applyElementGenerationPatch(elements, elementId, createGenerationTaskPatch(taskId, taskType));
}

export function clearElementGenerationTask(
    elements: CanvasElement[],
    elementId: string,
): CanvasElement[] {
    return applyElementGenerationPatch(elements, elementId, createGenerationIdlePatch());
}

export function applyElementGenerationPatch(
    elements: CanvasElement[],
    elementId: string,
    patch: GenerationTaskPatch,
): CanvasElement[] {
    return elements.map((element) =>
        element.id === elementId
            ? { ...element, ...patch }
            : element,
    );
}

export function getActiveGenerationTasks(elements: CanvasElement[]) {
    return elements.filter((element): element is GenerationQueueElement => (
        (isCanvasGeneratorElement(element) || isCanvasMediaElement(element))
        && !!element.generatingTaskId
        && element.generatingTaskId !== 'ai-editing'
    ));
}

function safeJsonCount(raw?: string) {
    if (!raw) return 0;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
        return 0;
    }
}

function buildQueueMetaChips(element: GenerationQueueElement, kind: 'image' | 'video') {
    const chips: string[] = [];

    if (element.storyboardShotCode?.trim()) {
        chips.push(element.storyboardShotCode.trim());
    }

    if (element.selectedModel?.trim()) {
        chips.push(element.selectedModel.trim());
    }
    if (element.selectedAspectRatio?.trim()) {
        chips.push(element.selectedAspectRatio.trim());
    }
    if (kind === 'image' && isImageGenerationQueueElement(element) && element.selectedImageSize?.trim()) {
        chips.push(element.selectedImageSize.trim());
    }
    if (kind === 'image' && isImageGenerationQueueElement(element) && element.selectedImageQuality?.trim() && element.selectedImageQuality.trim() !== 'auto') {
        chips.push(`质量 ${element.selectedImageQuality.trim()}`);
    }
    if (kind === 'video' && isVideoGenerationQueueElement(element) && element.selectedDuration?.trim()) {
        chips.push(element.selectedDuration.trim());
    }

    const referenceCount = kind === 'image'
        ? safeJsonCount(element.savedReferenceImages)
        : safeJsonCount(element.savedFrameImages);

    if (referenceCount > 0) {
        chips.push(`${referenceCount} 张参考`);
    }

    if (kind === 'image' && isImageGenerationQueueElement(element) && element.selectedGenerateCount && element.selectedGenerateCount > 1) {
        chips.push(`批量 ${element.selectedGenerateCount}`);
    }

    return chips;
}

function getQueueTonePriority(tone: GenerationQueueItem['tone']) {
    return QUEUE_TONE_PRIORITY[tone];
}

function buildQueueTone(params: {
    hasRunning: boolean;
    hasFinishing: boolean;
    hasQueued: boolean;
    hasSubmitting: boolean;
    hasFailed: boolean;
}) {
    if (params.hasRunning) return 'running' as const;
    if (params.hasFinishing) return 'finishing' as const;
    if (params.hasQueued) return 'queued' as const;
    if (params.hasSubmitting) return 'submitting' as const;
    return 'failed' as const;
}

export function buildGenerationQueueItems(
    elements: CanvasElement[],
    generatorSubmittingMap: GeneratorSubmittingMap,
): GenerationQueueItem[] {
    const generatorElements = elements.filter((element): element is GenerationQueueElement => (
        isCanvasGeneratorElement(element) || isCanvasMediaElement(element)
    ));

    const activeGeneratorElements = generatorElements.filter((element) => (
        (!!element.generatingTaskId && element.generatingTaskId !== 'ai-editing')
        || generatorSubmittingMap[element.id]
        || !!element.generatingError
    ));
    const groupedItems = new Map<string, GenerationQueueItem[]>();
    const standaloneItems: GenerationQueueItem[] = [];

    activeGeneratorElements.forEach((element) => {
            const kind: 'image' | 'video' = element.type === 'video-generator' || element.type === 'video' ? 'video' : 'image';
            const hasAcceptedTask = !!element.generatingTaskId && element.generatingTaskId !== 'ai-editing';
            const progress = element.generatingProgress || 0;
            const isSubmitting = !!generatorSubmittingMap[element.id] && !hasAcceptedTask;
            const isStoryboardPlanner = element.type === 'storyboard-planner';
            const isCanvasImage = element.type === 'image';
            const isCanvasVideo = element.type === 'video';
            const tone: GenerationQueueItem['tone'] = element.generatingError
                ? 'failed'
                : isSubmitting
                    ? 'submitting'
                    : progress <= 0
                        ? 'queued'
                        : progress < 85
                            ? 'running'
                            : 'finishing';

            const statusLabel = element.generatingError
                ? '失败'
                : isSubmitting
                    ? '提交中'
                    : progress <= 0
                        ? '排队中'
                        : progress < 85
                            ? '生成中'
                            : '整理中';

            const errorSummary = summarizeGenerationError(element.generatingError);

            const item: GenerationQueueItem = {
                id: element.id,
                kind,
                entityType: 'item',
                title: element.savedPrompt?.trim() || (isStoryboardPlanner ? '分镜宫格图生成' : kind === 'image' ? '图片生成任务' : '视频生成任务'),
                subtitle: isStoryboardPlanner
                    ? '分镜规划器 · 结果将导入当前画布'
                    : isCanvasImage
                        ? 'AI 智能编辑 · 结果将覆盖当前图片'
                        : isCanvasVideo
                            ? '视频编辑 · 结果将覆盖当前视频'
                    : element.generationBatchTitle?.trim()
                        ? `${element.generationBatchTitle.trim()} · 结果将显示在当前分镜位置`
                        : `${kind === 'image' ? '图像生成器' : '视频生成器'} · 结果将显示在当前生成器位置`,
                metaChips: element.generatingError
                    ? [...buildQueueMetaChips(element, kind), errorSummary].slice(0, 4)
                    : buildQueueMetaChips(element, kind),
                statusHint: element.generatingError
                    ? isStoryboardPlanner
                        ? `${errorSummary}，可调整提示词后重新生成`
                        : `${errorSummary}，可继续编辑后重试`
                    : isSubmitting
                        ? isStoryboardPlanner
                            ? '宫格图请求已提交，正在创建任务'
                            : isCanvasImage
                                ? '编辑请求已提交，正在创建任务'
                                : isCanvasVideo
                                    ? '视频编辑请求已提交，正在创建任务'
                            : '参数已提交，正在创建任务'
                        : progress <= 0
                            ? isStoryboardPlanner
                                ? '宫格图任务排队中，等待服务端执行'
                                : isCanvasImage
                                    ? '图片编辑任务排队中，完成后将覆盖当前图片'
                                    : isCanvasVideo
                                        ? '视频编辑任务排队中，完成后将覆盖当前视频'
                                : '任务排队中，等待服务端执行'
                            : progress < 85
                                ? isStoryboardPlanner
                                    ? '宫格图生成中，完成后将自动导入画布'
                                    : isCanvasImage
                                        ? '图片编辑处理中，完成后将覆盖当前图片'
                                        : isCanvasVideo
                                            ? '视频编辑处理中，完成后将覆盖当前视频'
                                    : '结果生成中，将落回当前生成器位置'
                                : isStoryboardPlanner
                                    ? '宫格图整理中，完成后将自动导入画布'
                                    : isCanvasImage
                                        ? '图片编辑整理中，准备替换到当前画布'
                                        : isCanvasVideo
                                            ? '视频编辑整理中，准备替换到当前画布'
                                    : '结果整理中，准备替换到画布',
                canResume: !!element.generatingError && !isStoryboardPlanner,
                statusLabel,
                progress,
                tone,
            };

            if (element.generationBatchId?.trim()) {
                const batchId = element.generationBatchId.trim();
                const bucket = groupedItems.get(batchId) || [];
                bucket.push(item);
                groupedItems.set(batchId, bucket);
                return;
            }

            standaloneItems.push(item);
        });

    const groupedSummaries = Array.from(groupedItems.entries()).map(([batchId, items]) => {
        const batchMembers = elements.filter((element) => element.generationBatchId === batchId);
        const completedCount = batchMembers.filter((element) => (
            !generatorSubmittingMap[element.id]
            && !element.generatingTaskId
            && !element.generatingError
            && (element.type === 'image' || element.type === 'video')
        )).length;
        const failedMembers = batchMembers.filter((element) => !!element.generatingError);
        const failedCount = failedMembers.length;
        const runningCount = batchMembers.length - completedCount - failedCount;
        const averageProgress = batchMembers.length > 0
            ? Math.round(batchMembers.reduce((sum, member) => {
                if ((member.type === 'image' || member.type === 'video') && !member.generatingTaskId && !member.generatingError && !generatorSubmittingMap[member.id]) {
                    return sum + 100;
                }
                if (!!generatorSubmittingMap[member.id] && !member.generatingTaskId) {
                    return sum + 8;
                }
                return sum + Math.max(0, member.generatingProgress || 0);
            }, 0) / batchMembers.length)
            : 0;
        const hasRunning = items.some((item) => item.tone === 'running');
        const hasFinishing = items.some((item) => item.tone === 'finishing');
        const hasQueued = items.some((item) => item.tone === 'queued');
        const hasSubmitting = items.some((item) => item.tone === 'submitting');
        const hasFailed = failedCount > 0;
        const tone = buildQueueTone({ hasRunning, hasFinishing, hasQueued, hasSubmitting, hasFailed });
        const batchTitle = batchMembers.find((element) => element.generationBatchTitle?.trim())?.generationBatchTitle?.trim()
            || batchMembers.find((element) => element.displayName?.trim())?.displayName?.trim()
            || `分镜批次 ${batchId.slice(0, 4)}`;
        const parentFrameIds = new Set(batchMembers.map((element) => element.parentFrameId).filter((item): item is string => typeof item === 'string' && item.length > 0));
        const locateTargetId = parentFrameIds.size === 1 ? Array.from(parentFrameIds)[0] : items[0]?.id;
        const resumeTargetIds = failedMembers
            .filter((element) => element.type === 'image-generator' || element.type === 'video-generator')
            .map((element) => element.id);

        const summaryItem: GenerationQueueItem = {
            id: `group:${batchId}`,
            kind: 'group',
            entityType: 'group',
            title: batchTitle,
            subtitle: `分镜批量任务 · ${batchMembers.length} 项`,
            metaChips: [
                `${completedCount}/${batchMembers.length} 完成`,
                runningCount > 0 ? `${runningCount} 处理中` : null,
                failedCount > 0 ? `${failedCount} 失败` : null,
            ].filter((item): item is string => !!item),
            statusHint: failedCount > 0
                ? `当前有 ${failedCount} 个分镜任务失败，可跳过成功项继续重试`
                : `当前批次共有 ${batchMembers.length} 个分镜任务正在按组执行`,
            canResume: resumeTargetIds.length > 0,
            statusLabel: failedCount > 0 && runningCount === 0
                ? '批量待重试'
                : runningCount > 0
                    ? '批量进行中'
                    : '批量排队中',
            progress: averageProgress,
            tone,
            locateTargetId,
            resumeTargetIds,
        };

        items.sort((left, right) => getQueueTonePriority(right.tone) - getQueueTonePriority(left.tone) || right.progress - left.progress);

        return {
            summaryItem,
            childItems: items,
            priority: Math.max(getQueueTonePriority(summaryItem.tone), ...items.map((item) => getQueueTonePriority(item.tone))),
        };
    });

    groupedSummaries.sort((left, right) => right.priority - left.priority || right.summaryItem.progress - left.summaryItem.progress);
    standaloneItems.sort((left, right) => getQueueTonePriority(right.tone) - getQueueTonePriority(left.tone) || right.progress - left.progress);

    return [
        ...groupedSummaries.flatMap((group) => [group.summaryItem, ...group.childItems]),
        ...standaloneItems,
    ];
}

export function applyGenerationProgress(
    elements: CanvasElement[],
    elementId: string,
    progress: number,
): CanvasElement[] {
    return applyElementGenerationPatch(elements, elementId, { generatingProgress: progress });
}

export function applyGenerationFailure(
    elements: CanvasElement[],
    elementId: string,
    error: string,
): CanvasElement[] {
    return applyElementGenerationPatch(elements, elementId, createGenerationFailurePatch(error));
}

export function applyVideoGenerationSuccess(
    elements: CanvasElement[],
    elementId: string,
    videoUrl: string,
    taskId?: string | null,
): CanvasElement[] {
    const normalizedTaskId = typeof taskId === 'string' && taskId.trim().length > 0
        ? taskId.trim()
        : null;

    return elements.map((element) =>
        element.id === elementId
            ? {
                ...element,
                type: 'video',
                content: videoUrl,
                sourceGenerationTaskId: normalizedTaskId ?? element.sourceGenerationTaskId,
                sourceGenerationTaskType: (normalizedTaskId ?? element.sourceGenerationTaskId) ? 'video' : undefined,
                ...createGenerationIdlePatch(),
            }
            : element,
    );
}
