"use client";

import {
    type ProjectAssetStoreConfig,
    isPlainObject,
    createTimestampId,
    normalizeItems,
    optionalString,
    safeTimestamp,
    readItems,
    writeItems,
    clearItems,
    subscribeItems,
    removeItemById,
    updateItemById,
} from './project-asset-store';

export interface ProjectReferenceImageItem {
    id: string;
    projectId: string;
    image: string;
    label: string;
    prompt?: string;
    sourceMediaId?: string;
    sourceElementId?: string;
    createdAt: number;
    lastUsedAt: number;
}

export interface ProjectReferenceImageDraft {
    projectId: string;
    image: string;
    label?: string;
    prompt?: string;
    sourceMediaId?: string;
    sourceElementId?: string;
}

const MAX_ITEMS = 80;

function createItemId() {
    return createTimestampId('pref-');
}

function buildDefaultLabel(label: string | undefined, prompt: string | undefined, createdAt: number) {
    const trimmedLabel = label?.trim();
    if (trimmedLabel) {
        return trimmedLabel.length > 24 ? `${trimmedLabel.slice(0, 24)}...` : trimmedLabel;
    }

    const trimmedPrompt = prompt?.trim();
    if (trimmedPrompt) {
        return trimmedPrompt.length > 24 ? `${trimmedPrompt.slice(0, 24)}...` : trimmedPrompt;
    }

    return `项目参考 ${new Date(createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`;
}

function sanitizeItem(value: unknown, projectId: string): ProjectReferenceImageItem | null {
    if (!isPlainObject(value)) return null;
    if (typeof value.image !== 'string' || !value.image.trim()) return null;

    const createdAt = safeTimestamp(value.createdAt);
    const prompt = optionalString(value.prompt);
    const label = buildDefaultLabel(typeof value.label === 'string' ? value.label : undefined, prompt, createdAt);

    return {
        id: typeof value.id === 'string' && value.id.trim() ? value.id : createItemId(),
        projectId,
        image: value.image,
        label,
        prompt,
        sourceMediaId: optionalString(value.sourceMediaId),
        sourceElementId: optionalString(value.sourceElementId),
        createdAt,
        lastUsedAt: safeTimestamp(value.lastUsedAt),
    };
}

export const referenceLibraryStoreConfig: ProjectAssetStoreConfig<ProjectReferenceImageItem> = {
    storageKeyPrefix: 'lovart_project_reference_library:',
    storageEventPrefix: 'lovart:project-reference-library:',
    maxItems: MAX_ITEMS,
    sanitizeItem,
    sortComparator: (a, b) => b.lastUsedAt - a.lastUsedAt,
};

export function readProjectReferenceLibrary(projectId: string | null | undefined): ProjectReferenceImageItem[] {
    return readItems(referenceLibraryStoreConfig, projectId);
}

export function saveProjectReferenceImage(draft: ProjectReferenceImageDraft): ProjectReferenceImageItem[] {
    if (typeof window === 'undefined' || !draft.projectId || !draft.image) {
        return [];
    }

    const now = Date.now();
    const current = readProjectReferenceLibrary(draft.projectId);
    const existing = current.find((item) => item.image === draft.image);
    const next = existing
        ? current.map((item) => item.image === draft.image ? {
            ...item,
            label: buildDefaultLabel(draft.label, draft.prompt ?? item.prompt, item.createdAt),
            prompt: draft.prompt?.trim() || item.prompt,
            sourceMediaId: draft.sourceMediaId || item.sourceMediaId,
            sourceElementId: draft.sourceElementId || item.sourceElementId,
            lastUsedAt: now,
        } : item)
        : [{
            id: createItemId(),
            projectId: draft.projectId,
            image: draft.image,
            label: buildDefaultLabel(draft.label, draft.prompt, now),
            prompt: draft.prompt?.trim() || undefined,
            sourceMediaId: draft.sourceMediaId,
            sourceElementId: draft.sourceElementId,
            createdAt: now,
            lastUsedAt: now,
        }, ...current].slice(0, MAX_ITEMS);

    writeItems(referenceLibraryStoreConfig, draft.projectId, next);
    return next;
}

export function replaceProjectReferenceLibrary(projectId: string, items: ProjectReferenceImageItem[]): ProjectReferenceImageItem[] {
    if (typeof window === 'undefined' || !projectId) {
        return [];
    }

    const next = normalizeItems(referenceLibraryStoreConfig, projectId, items);
    writeItems(referenceLibraryStoreConfig, projectId, next);
    return next;
}

export function touchProjectReferenceImage(projectId: string, id: string): ProjectReferenceImageItem[] {
    return updateItemById(referenceLibraryStoreConfig, projectId, id, { lastUsedAt: Date.now() } as Partial<ProjectReferenceImageItem>);
}

export function removeProjectReferenceImage(projectId: string, id: string): ProjectReferenceImageItem[] {
    return removeItemById(referenceLibraryStoreConfig, projectId, id);
}

export function clearProjectReferenceLibrary(projectId: string) {
    clearItems(referenceLibraryStoreConfig, projectId);
}

export function subscribeProjectReferenceLibrary(projectId: string | null | undefined, listener: () => void): () => void {
    return subscribeItems(referenceLibraryStoreConfig, projectId, listener);
}