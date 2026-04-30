'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ProjectAssetStoreConfig } from '@/lib/project-asset-store';
import { buildStorageKey, normalizeItems, subscribeItems } from '@/lib/project-asset-store';

const EMPTY_PROJECT_ASSET_ITEMS: never[] = [];

/**
 * React hook that reads a project-scoped asset collection and subscribes to
 * changes (both same-tab CustomEvent and cross-tab StorageEvent).
 *
 * Replaces the duplicated useEffect pattern previously inlined in page.tsx
 * for both project-reference-library and project-media-history.
 */
export function useProjectAssetCollection<TItem>(
    config: ProjectAssetStoreConfig<TItem>,
    projectId: string | null | undefined,
): TItem[] {
    const subscribe = useCallback(
        (listener: () => void) => subscribeItems(config, projectId, listener),
        [config, projectId],
    );
    const getSnapshot = useCallback(() => {
        if (typeof window === 'undefined' || !projectId) {
            return null;
        }

        return window.localStorage.getItem(buildStorageKey(config.storageKeyPrefix, projectId));
    }, [config.storageKeyPrefix, projectId]);

    const rawSnapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);

    return useMemo(() => {
        if (!rawSnapshot || !projectId) {
            return EMPTY_PROJECT_ASSET_ITEMS as TItem[];
        }

        try {
            return normalizeItems(config, projectId, JSON.parse(rawSnapshot) as unknown);
        } catch {
            return EMPTY_PROJECT_ASSET_ITEMS as TItem[];
        }
    }, [config, projectId, rawSnapshot]);
}
