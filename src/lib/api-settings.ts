/**
 * API Settings utility — stores selected AI provider credentials in localStorage
 * and provides helpers to inject them into fetch headers.
 */

import {
    AI_PROVIDERS,
    DEFAULT_AI_PROVIDER_ID,
    getAiProvider,
    getProviderAllowedPublicPatterns,
    normalizeAiProviderId,
    type AiProviderId,
} from './ai-providers';
import { validateAiGatewayBaseUrl } from './network-policy';

const STORAGE_KEY_BASE_URL = 'lovart_api_base_url';
const STORAGE_KEY_API_KEY = 'lovart_api_key';
const STORAGE_KEY_PROVIDER = 'lovart_ai_provider';
const STORAGE_KEY_PROVIDER_SETTINGS = 'lovart_ai_provider_settings';
export const API_SETTINGS_CHANGED_EVENT = 'lovart:api-settings-changed';

export interface ApiProviderSettings {
    baseUrl: string;
    apiKey: string;
}

export interface ApiSettings {
    providerId: AiProviderId;
    baseUrl: string;
    apiKey: string;
    providers: Record<AiProviderId, ApiProviderSettings>;
}

export type SaveApiSettingsInput = {
    providerId?: AiProviderId;
    baseUrl: string;
    apiKey: string;
    providers?: Partial<Record<AiProviderId, Partial<ApiProviderSettings>>>;
};

function notifyApiSettingsChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(API_SETTINGS_CHANGED_EVENT));
}

function createEmptyProviderSettings(): Record<AiProviderId, ApiProviderSettings> {
    return Object.keys(AI_PROVIDERS).reduce((acc, id) => {
        acc[id as AiProviderId] = { baseUrl: '', apiKey: '' };
        return acc;
    }, {} as Record<AiProviderId, ApiProviderSettings>);
}

function readProviderSettings(): Record<AiProviderId, ApiProviderSettings> {
    const providers = createEmptyProviderSettings();
    providers[DEFAULT_AI_PROVIDER_ID] = {
        baseUrl: localStorage.getItem(STORAGE_KEY_BASE_URL) || '',
        apiKey: localStorage.getItem(STORAGE_KEY_API_KEY) || '',
    };

    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_PROVIDER_SETTINGS) || '{}') as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return providers;
        }

        for (const [rawProviderId, rawSettings] of Object.entries(parsed as Record<string, unknown>)) {
            const providerId = normalizeAiProviderId(rawProviderId);
            if (!rawSettings || typeof rawSettings !== 'object') {
                continue;
            }

            const record = rawSettings as Record<string, unknown>;
            providers[providerId] = {
                baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : providers[providerId].baseUrl,
                apiKey: typeof record.apiKey === 'string' ? record.apiKey : providers[providerId].apiKey,
            };
        }
    } catch {
        return providers;
    }

    return providers;
}

function mergeProviderSettings(
    current: Record<AiProviderId, ApiProviderSettings>,
    patch?: Partial<Record<AiProviderId, Partial<ApiProviderSettings>>>,
): Record<AiProviderId, ApiProviderSettings> {
    const next = { ...current };
    if (!patch) {
        return next;
    }

    for (const [rawProviderId, rawSettings] of Object.entries(patch)) {
        const providerId = normalizeAiProviderId(rawProviderId);
        next[providerId] = {
            baseUrl: typeof rawSettings?.baseUrl === 'string' ? rawSettings.baseUrl : next[providerId].baseUrl,
            apiKey: typeof rawSettings?.apiKey === 'string' ? rawSettings.apiKey : next[providerId].apiKey,
        };
    }

    return next;
}

function getSelectedProviderId(providers: Record<AiProviderId, ApiProviderSettings>): AiProviderId {
    const storedProvider = normalizeAiProviderId(localStorage.getItem(STORAGE_KEY_PROVIDER));
    return providers[storedProvider] ? storedProvider : DEFAULT_AI_PROVIDER_ID;
}

function hasCustomProviderSettings(settings: Record<AiProviderId, ApiProviderSettings>): boolean {
    return Object.values(settings).some((providerSettings) => !!providerSettings.baseUrl || !!providerSettings.apiKey);
}

/** Read saved settings from localStorage (client-side only). */
export function getApiSettings(): ApiSettings {
    if (typeof window === 'undefined') {
        return {
            providerId: DEFAULT_AI_PROVIDER_ID,
            baseUrl: '',
            apiKey: '',
            providers: createEmptyProviderSettings(),
        };
    }

    const providers = readProviderSettings();
    const providerId = getSelectedProviderId(providers);
    const activeSettings = providers[providerId] || { baseUrl: '', apiKey: '' };

    return {
        providerId,
        baseUrl: activeSettings.baseUrl,
        apiKey: activeSettings.apiKey,
        providers,
    };
}

/** Persist settings to localStorage. */
export function saveApiSettings(settings: SaveApiSettingsInput) {
    if (typeof window === 'undefined') return;

    const providerId = normalizeAiProviderId(settings.providerId ?? localStorage.getItem(STORAGE_KEY_PROVIDER));
    const providers = mergeProviderSettings(readProviderSettings(), settings.providers);
    providers[providerId] = {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
    };

    localStorage.setItem(STORAGE_KEY_PROVIDER, providerId);
    localStorage.setItem(STORAGE_KEY_PROVIDER_SETTINGS, JSON.stringify(providers));

    if (providerId === DEFAULT_AI_PROVIDER_ID) {
        if (settings.baseUrl) {
            localStorage.setItem(STORAGE_KEY_BASE_URL, settings.baseUrl);
        } else {
            localStorage.removeItem(STORAGE_KEY_BASE_URL);
        }
        if (settings.apiKey) {
            localStorage.setItem(STORAGE_KEY_API_KEY, settings.apiKey);
        } else {
            localStorage.removeItem(STORAGE_KEY_API_KEY);
        }
    }

    notifyApiSettingsChanged();
}

export function getProviderApiSettings(providerId: AiProviderId): ApiProviderSettings {
    if (typeof window === 'undefined') {
        return { baseUrl: '', apiKey: '' };
    }

    return readProviderSettings()[providerId] || { baseUrl: '', apiKey: '' };
}

export function saveSelectedAiProvider(providerId: AiProviderId) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_PROVIDER, providerId);
    notifyApiSettingsChanged();
}

export function hasCustomApiSettings(): boolean {
    if (typeof window === 'undefined') return false;
    const settings = getApiSettings();
    return settings.providerId !== DEFAULT_AI_PROVIDER_ID || hasCustomProviderSettings(settings.providers);
}

export function getEffectiveApiBaseUrl(settings: ApiSettings = getApiSettings()): string {
    const provider = getAiProvider(settings.providerId);
    return getSafeClientBaseUrl(settings.baseUrl, settings.providerId) || provider.defaultBaseUrl;
}

/** Clear saved settings. */
export function clearApiSettings() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_BASE_URL);
    localStorage.removeItem(STORAGE_KEY_API_KEY);
    localStorage.removeItem(STORAGE_KEY_PROVIDER);
    localStorage.removeItem(STORAGE_KEY_PROVIDER_SETTINGS);
    notifyApiSettingsChanged();
}

export function subscribeApiSettingsChange(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const handleCustomEvent = () => listener();
    const handleStorage = (event: StorageEvent) => {
        if (
            event.key === null
            || event.key === STORAGE_KEY_BASE_URL
            || event.key === STORAGE_KEY_API_KEY
            || event.key === STORAGE_KEY_PROVIDER
            || event.key === STORAGE_KEY_PROVIDER_SETTINGS
        ) {
            listener();
        }
    };

    window.addEventListener(API_SETTINGS_CHANGED_EVENT, handleCustomEvent);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(API_SETTINGS_CHANGED_EVENT, handleCustomEvent);
        window.removeEventListener('storage', handleStorage);
    };
}

/**
 * Build extra headers to send client-side API settings to the server.
 * Only adds credential headers if values are non-empty.
 */
export function apiSettingsHeaders(): Record<string, string> {
    const settings = getApiSettings();
    const headers: Record<string, string> = {
        'x-ai-provider': settings.providerId,
    };
    const normalizedBaseUrl = getSafeClientBaseUrl(settings.baseUrl, settings.providerId);
    if (normalizedBaseUrl) headers['x-ai-base-url'] = normalizedBaseUrl;
    if (settings.apiKey) headers['x-ai-api-key'] = settings.apiKey;
    return headers;
}

/**
 * Normalize a user-supplied base URL, returning '' for invalid values.
 * Wraps the network-policy validator with a safe try/catch for client use.
 */
export function getSafeClientBaseUrl(baseUrl: string, providerId: AiProviderId = DEFAULT_AI_PROVIDER_ID): string {
    if (!baseUrl) {
        return '';
    }

    const provider = getAiProvider(providerId);

    try {
        return validateAiGatewayBaseUrl(baseUrl, {
            defaultBaseUrl: provider.defaultBaseUrl,
            allowedPublicPatterns: getProviderAllowedPublicPatterns(providerId),
        }).normalizedBaseUrl;
    } catch {
        return '';
    }
}