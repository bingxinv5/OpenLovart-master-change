"use client";

import {
    type ProjectAssetStoreConfig,
    isPlainObject,
    createTimestampId,
    optionalString,
    safeTimestamp,
    readItems,
    writeItems,
    clearItems,
    subscribeItems,
} from './project-asset-store';

export type ProjectMediaHistoryKind = 'image' | 'video' | 'audio';

export interface ProjectMediaHistoryItem {
    id: string;
    projectId: string;
    kind: ProjectMediaHistoryKind;
    content: string;
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    imageSize?: string;
    duration?: string;
    sourceElementId?: string;
    batchId?: string;
    batchTitle?: string;
    createdAt: number;
}

export interface ProjectMediaHistoryDraft {
    projectId: string;
    kind: ProjectMediaHistoryKind;
    content: string;
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    imageSize?: string;
    duration?: string;
    sourceElementId?: string;
    batchId?: string;
    batchTitle?: string;
}

const MAX_ITEMS = 120;

function createItemId(kind: ProjectMediaHistoryKind) {
    return createTimestampId(`${kind}-`);
}

function sanitizeItem(value: unknown, projectId: string): ProjectMediaHistoryItem | null {
    if (!isPlainObject(value)) return null;
    if (typeof value.content !== 'string' || !value.content.trim()) return null;

    const kind: ProjectMediaHistoryKind = value.kind === 'video'
        ? 'video'
        : value.kind === 'audio'
            ? 'audio'
            : 'image';
    return {
        id: typeof value.id === 'string' && value.id.trim() ? value.id : createItemId(kind),
        projectId,
        kind,
        content: value.content,
        prompt: optionalString(value.prompt),
        model: optionalString(value.model),
        aspectRatio: optionalString(value.aspectRatio),
        imageSize: optionalString(value.imageSize),
        duration: optionalString(value.duration),
        sourceElementId: optionalString(value.sourceElementId),
        batchId: optionalString(value.batchId),
        batchTitle: optionalString(value.batchTitle),
        createdAt: safeTimestamp(value.createdAt),
    };
}

export const mediaHistoryStoreConfig: ProjectAssetStoreConfig<ProjectMediaHistoryItem> = {
    storageKeyPrefix: 'lovart_project_media_history:',
    storageEventPrefix: 'lovart:project-media-history:',
    maxItems: MAX_ITEMS,
    sanitizeItem,
    sortComparator: (a, b) => b.createdAt - a.createdAt,
};

export function readProjectMediaHistory(projectId: string | null | undefined): ProjectMediaHistoryItem[] {
    return readItems(mediaHistoryStoreConfig, projectId);
}

export function appendProjectMediaHistory(draft: ProjectMediaHistoryDraft): ProjectMediaHistoryItem[] {
    if (typeof window === 'undefined' || !draft.projectId || !draft.content) {
        return [];
    }

    const nextItem = sanitizeItem({
        ...draft,
        id: createItemId(draft.kind),
        createdAt: Date.now(),
    }, draft.projectId);

    if (!nextItem) {
        return readProjectMediaHistory(draft.projectId);
    }

    const current = readProjectMediaHistory(draft.projectId);
    const deduped = current.filter((item) => !(item.kind === nextItem.kind && item.content === nextItem.content));
    const next = [nextItem, ...deduped].slice(0, MAX_ITEMS);
    writeItems(mediaHistoryStoreConfig, draft.projectId, next);
    return next;
}

export function subscribeProjectMediaHistory(projectId: string | null | undefined, listener: () => void): () => void {
    return subscribeItems(mediaHistoryStoreConfig, projectId, listener);
}

export function clearProjectMediaHistory(projectId: string) {
    clearItems(mediaHistoryStoreConfig, projectId);
}