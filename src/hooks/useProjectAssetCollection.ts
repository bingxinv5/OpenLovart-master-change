'use client';

import { useState, useEffect } from 'react';
import type { ProjectAssetStoreConfig } from '@/lib/project-asset-store';
import { readItems, subscribeItems } from '@/lib/project-asset-store';

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
    const [items, setItems] = useState<TItem[]>([]);

    useEffect(() => {
        setItems(readItems(config, projectId));
        return subscribeItems(config, projectId, () => {
            setItems(readItems(config, projectId));
        });
    }, [config, projectId]);

    return items;
}
