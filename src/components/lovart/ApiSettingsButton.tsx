'use client';

import React, { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { getApiSettings, subscribeApiSettingsChange } from '@/lib/api-settings';
import { getCdnCacheSettings, subscribeCdnCacheSettingsChange } from '@/lib/cache-settings';
import { getUpscaleServiceSettings, subscribeUpscaleServiceSettingsChange } from '@/lib/upscale-service-settings';
import { DEFAULT_WORKBENCH_SETTINGS, getWorkbenchSettings, subscribeWorkbenchSettingsChange, type WorkbenchSettings } from '@/lib/workbench-settings';
import { ApiSettingsDialog } from './ApiSettingsDialog';

function hasCustomWorkbenchSettings(settings: WorkbenchSettings) {
    return JSON.stringify(settings) !== JSON.stringify(DEFAULT_WORKBENCH_SETTINGS);
}

export function ApiSettingsButton() {
    const [showDialog, setShowDialog] = useState(false);
    const [hasCustomConfig, setHasCustomConfig] = useState(false);

    useEffect(() => {
        const syncState = () => {
            const apiSettings = getApiSettings();
            const workbenchSettings = getWorkbenchSettings();
            const hasLocalCustomConfig = !!apiSettings.baseUrl || !!apiSettings.apiKey || hasCustomWorkbenchSettings(workbenchSettings);
            setHasCustomConfig(hasLocalCustomConfig);

            void Promise.all([
                getCdnCacheSettings().catch(() => null),
                getUpscaleServiceSettings().catch(() => null),
            ])
                .then(([cacheSettings, serviceSettings]) => {
                    setHasCustomConfig(hasLocalCustomConfig || !!cacheSettings?.isCustomDirectory || !!serviceSettings?.isCustomBaseUrl);
                })
                .catch(() => {
                    // Ignore fetch failures here and keep the local indicator only.
                });
        };

        syncState();
        const unsubscribeApi = subscribeApiSettingsChange(syncState);
        const unsubscribeWorkbench = subscribeWorkbenchSettingsChange(syncState);
        const unsubscribeCdnCache = subscribeCdnCacheSettingsChange(syncState);
        const unsubscribeUpscaleService = subscribeUpscaleServiceSettingsChange(syncState);

        return () => {
            unsubscribeApi();
            unsubscribeWorkbench();
            unsubscribeCdnCache();
            unsubscribeUpscaleService();
        };
    }, []);

    return (
        <>
            <button
                data-testid="settings-open-button"
                onClick={() => setShowDialog(true)}
                className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors ${hasCustomConfig ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'text-gray-500 hover:bg-gray-100'}`}
                title="设置中心"
            >
                <Settings size={16} />
                {hasCustomConfig && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500" />
                )}
            </button>
            {showDialog && <ApiSettingsDialog onClose={() => setShowDialog(false)} />}
        </>
    );
}