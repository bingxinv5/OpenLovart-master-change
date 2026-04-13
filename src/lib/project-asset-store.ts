"use client";

/**
 * Shared localStorage-backed project-scoped collection infrastructure.
 * Used by project-reference-library and project-media-history.
 *
 * Each collection is a localStorage array keyed by project ID,
 * with CustomEvent + StorageEvent based change notification.
 */

export interface ProjectAssetStoreConfig<TItem> {
    storageKeyPrefix: string;
    storageEventPrefix: string;
    maxItems: number;
    sanitizeItem: (value: unknown, projectId: string) => TItem | null;
    sortComparator: (a: TItem, b: TItem) => number;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export { isObject as isPlainObject };

export function buildStorageKey(prefix: string, projectId: string): string {
    return `${prefix}${projectId}`;
}

export function buildStorageEvent(prefix: string, projectId: string): string {
    return `${prefix}${projectId}`;
}

export function createTimestampId(prefix: string): string {
    return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function requiredString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}

export function safeTimestamp(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

export function normalizeItems<TItem>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string,
    value: unknown,
): TItem[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => config.sanitizeItem(item, projectId))
        .filter((item): item is TItem => !!item)
        .sort(config.sortComparator)
        .slice(0, config.maxItems);
}

export function writeItems<TItem>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string,
    items: TItem[],
): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
        buildStorageKey(config.storageKeyPrefix, projectId),
        JSON.stringify(items),
    );
    window.dispatchEvent(
        new CustomEvent(buildStorageEvent(config.storageEventPrefix, projectId)),
    );
}

export function readItems<TItem>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string | null | undefined,
): TItem[] {
    if (typeof window === 'undefined' || !projectId) return [];

    try {
        const raw = window.localStorage.getItem(
            buildStorageKey(config.storageKeyPrefix, projectId),
        );
        if (!raw) return [];
        return normalizeItems(config, projectId, JSON.parse(raw) as unknown);
    } catch {
        return [];
    }
}

export function clearItems<TItem>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string,
): void {
    if (typeof window === 'undefined' || !projectId) return;
    window.localStorage.removeItem(
        buildStorageKey(config.storageKeyPrefix, projectId),
    );
    window.dispatchEvent(
        new CustomEvent(buildStorageEvent(config.storageEventPrefix, projectId)),
    );
}

export function subscribeItems<TItem>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string | null | undefined,
    listener: () => void,
): () => void {
    if (typeof window === 'undefined' || !projectId) return () => {};

    const eventName = buildStorageEvent(config.storageEventPrefix, projectId);
    const storageKey = buildStorageKey(config.storageKeyPrefix, projectId);
    const handleCustom = () => listener();
    const handleStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === storageKey) {
            listener();
        }
    };

    window.addEventListener(eventName, handleCustom);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(eventName, handleCustom);
        window.removeEventListener('storage', handleStorage);
    };
}

// ---------------------------------------------------------------------------
// Shared repository-level mutation helpers
// ---------------------------------------------------------------------------

/** Find a single item by id. */
export function findItemById<TItem extends { id: string }>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string | null | undefined,
    id: string,
): TItem | undefined {
    return readItems(config, projectId).find((item) => item.id === id);
}

/** Remove a single item by id. */
export function removeItemById<TItem extends { id: string }>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string,
    id: string,
): TItem[] {
    const current = readItems(config, projectId);
    const next = current.filter((item) => item.id !== id);
    if (next.length !== current.length) {
        writeItems(config, projectId, next);
    }
    return next;
}

/** Update a single item by id with a partial patch. */
export function updateItemById<TItem extends { id: string }>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string,
    id: string,
    patch: Partial<TItem>,
): TItem[] {
    const current = readItems(config, projectId);
    const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
    writeItems(config, projectId, next);
    return next;
}

/** Remove multiple items by id set. */
export function removeItemsByIds<TItem extends { id: string }>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string,
    ids: string[],
): TItem[] {
    const idSet = new Set(ids);
    const current = readItems(config, projectId);
    const next = current.filter((item) => !idSet.has(item.id));
    if (next.length !== current.length) {
        writeItems(config, projectId, next);
    }
    return next;
}

/** Prepend a new item, optionally deduplicating by a key function. */
export function prependItem<TItem>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string,
    item: TItem,
    deduplicateKey?: (existing: TItem) => boolean,
): TItem[] {
    const current = readItems(config, projectId);
    const deduped = deduplicateKey ? current.filter((existing) => !deduplicateKey(existing)) : current;
    const next = [item, ...deduped].slice(0, config.maxItems);
    writeItems(config, projectId, next);
    return next;
}

/** Return the number of items in a collection. */
export function countItems<TItem>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string | null | undefined,
): number {
    return readItems(config, projectId).length;
}
