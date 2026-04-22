"use client";

import { isImageRef } from './editor-kernel';

const PROJECT_MEDIA_HISTORY_PREFIX = 'lovart_project_media_history:';
const PROJECT_REFERENCE_LIBRARY_PREFIX = 'lovart_project_reference_library:';
const IMAGE_HISTORY_KEY = 'lovart_image_generation_history';
const FAVORITE_REFERENCES_KEY = 'lovart_favorite_reference_images';

function pushIfImageRef(target: Set<string>, value: unknown) {
    if (typeof value === 'string' && isImageRef(value)) {
        target.add(value);
    }
}

function readJsonArray(key: string): unknown[] {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function visitProjectMediaHistoryRefs(target: Set<string>) {
    if (typeof window === 'undefined') {
        return;
    }

    for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith(PROJECT_MEDIA_HISTORY_PREFIX)) {
            continue;
        }

        for (const item of readJsonArray(key)) {
            if (!item || typeof item !== 'object') {
                continue;
            }

            const record = item as { kind?: unknown; content?: unknown };
            if (record.kind === 'image') {
                pushIfImageRef(target, record.content);
            }
        }
    }
}

function visitProjectReferenceLibraryRefs(target: Set<string>) {
    if (typeof window === 'undefined') {
        return;
    }

    for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith(PROJECT_REFERENCE_LIBRARY_PREFIX)) {
            continue;
        }

        for (const item of readJsonArray(key)) {
            if (!item || typeof item !== 'object') {
                continue;
            }

            pushIfImageRef(target, (item as { image?: unknown }).image);
        }
    }
}

function visitImageGenerationHistoryRefs(target: Set<string>) {
    for (const item of readJsonArray(IMAGE_HISTORY_KEY)) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        const referenceImages = (item as { referenceImages?: unknown }).referenceImages;
        if (!Array.isArray(referenceImages)) {
            continue;
        }

        for (const image of referenceImages) {
            pushIfImageRef(target, image);
        }
    }
}

function visitFavoriteReferenceRefs(target: Set<string>) {
    for (const item of readJsonArray(FAVORITE_REFERENCES_KEY)) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        pushIfImageRef(target, (item as { image?: unknown }).image);
    }
}

export function collectRetainedLocalImageRefs(): string[] {
    if (typeof window === 'undefined') {
        return [];
    }

    const refs = new Set<string>();
    visitProjectMediaHistoryRefs(refs);
    visitProjectReferenceLibraryRefs(refs);
    visitImageGenerationHistoryRefs(refs);
    visitFavoriteReferenceRefs(refs);
    return Array.from(refs);
}