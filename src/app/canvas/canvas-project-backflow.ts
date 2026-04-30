import { getImageBlob, isImageRef } from '@/lib/editor-kernel';
import type { GenerationPollResult } from '@/lib/ai-client';
import {
    readProjectMediaHistory,
    replaceProjectMediaHistory,
    type ProjectMediaHistoryItem,
} from '@/lib/project-media-history';
import {
    readProjectReferenceLibrary,
    replaceProjectReferenceLibrary,
    saveProjectReferenceImage,
    type ProjectReferenceImageItem,
} from '@/lib/project-reference-library';

export type NormalizeProjectImageContent = (content: string, source: string) => Promise<string>;
export type PollImageGenerationTask = (taskId: string, taskType: 'image') => Promise<GenerationPollResult>;

export interface ProjectImageBackflowDeps {
    projectId: string | null | undefined;
    normalizeImageContent: NormalizeProjectImageContent;
    pollImageGenerationTask: PollImageGenerationTask;
}

export function updateProjectMediaItemContent(
    projectId: string | null | undefined,
    itemId: string,
    content: string,
): boolean {
    if (!projectId || !content) {
        return false;
    }

    const currentItems = readProjectMediaHistory(projectId);
    let hasChanges = false;
    const nextItems = currentItems.map((item) => {
        if (item.id !== itemId || item.content === content) {
            return item;
        }

        hasChanges = true;
        return {
            ...item,
            content,
        };
    });

    if (!hasChanges) {
        return false;
    }

    replaceProjectMediaHistory(projectId, nextItems);
    return true;
}

export function updateProjectReferenceItemImage(
    projectId: string | null | undefined,
    itemId: string,
    image: string,
): boolean {
    if (!projectId || !image) {
        return false;
    }

    const currentItems = readProjectReferenceLibrary(projectId);
    let hasChanges = false;
    const nextItems = currentItems.map((item) => {
        if (item.id !== itemId || item.image === image) {
            return item;
        }

        hasChanges = true;
        return {
            ...item,
            image,
        };
    });

    if (!hasChanges) {
        return false;
    }

    replaceProjectReferenceLibrary(projectId, nextItems);
    return true;
}

export function getCompletedImageResultUrl(result: GenerationPollResult): string | null {
    if (result.status !== 'completed') {
        return null;
    }

    if (typeof result.resultUrl === 'string' && result.resultUrl.trim().length > 0) {
        return result.resultUrl;
    }

    return Array.isArray(result.resultUrls)
        ? result.resultUrls.find((url) => typeof url === 'string' && url.trim().length > 0) ?? null
        : null;
}

export async function resolveProjectMediaImageInsertContent(
    item: ProjectMediaHistoryItem,
    deps: ProjectImageBackflowDeps,
): Promise<string> {
    if (!item.content || !isImageRef(item.content)) {
        return item.content;
    }

    const existingBlob = await getImageBlob(item.content);
    if (existingBlob) {
        return item.content;
    }

    if (!item.taskId) {
        throw new Error('图片素材已失效，且缺少 task_id，无法恢复');
    }

    const result = await deps.pollImageGenerationTask(item.taskId, 'image');
    if (result.status !== 'completed') {
        throw new Error('task_id 尚未返回可恢复的图片结果');
    }

    const resultUrl = getCompletedImageResultUrl(result);
    if (!resultUrl) {
        throw new Error('task_id 未返回可用图片结果');
    }

    const recoveredContent = await deps.normalizeImageContent(resultUrl, 'media-history-recover');
    updateProjectMediaItemContent(deps.projectId, item.id, recoveredContent);
    return recoveredContent;
}

export async function resolveProjectReferenceImageInsertContent(
    item: ProjectReferenceImageItem,
    deps: ProjectImageBackflowDeps,
): Promise<string> {
    if (!item.image || !isImageRef(item.image)) {
        return item.image;
    }

    const existingBlob = await getImageBlob(item.image);
    if (existingBlob) {
        return item.image;
    }

    if (!deps.projectId || !item.sourceMediaId) {
        throw new Error('参考图素材已失效，且缺少可恢复来源');
    }

    const sourceMediaItem = readProjectMediaHistory(deps.projectId)
        .find((mediaItem) => mediaItem.id === item.sourceMediaId && mediaItem.kind === 'image');
    if (!sourceMediaItem) {
        throw new Error('参考图来源媒体记录不存在，无法恢复');
    }

    const recoveredContent = await resolveProjectMediaImageInsertContent(sourceMediaItem, deps);
    updateProjectReferenceItemImage(deps.projectId, item.id, recoveredContent);
    return recoveredContent;
}

export async function saveProjectReferenceFromMediaItem(
    item: ProjectMediaHistoryItem,
    deps: ProjectImageBackflowDeps,
): Promise<boolean> {
    if (!deps.projectId || item.kind !== 'image') {
        return false;
    }

    const resolvedContent = await resolveProjectMediaImageInsertContent(item, deps);
    saveProjectReferenceImage({
        projectId: deps.projectId,
        image: resolvedContent,
        label: item.prompt,
        prompt: item.prompt,
        sourceMediaId: item.id,
        sourceElementId: item.sourceElementId,
    });
    return true;
}