/**
 * API Settings utility — stores selected AI provider credentials in localStorage
 * and provides helpers to inject them into fetch headers.
 */

import {
    AI_PROVIDERS,
    DEFAULT_AI_PROVIDER_ID,
    getAiProvider,
    getProviderAllowedPublicPatterns,
    isAiProviderId,
    normalizeAiProviderId,
    type AiProviderId,
} from './ai-providers';
import { validateAiGatewayBaseUrl } from './network-policy';

const STORAGE_KEY_BASE_URL = 'lovart_api_base_url';
const STORAGE_KEY_API_KEY = 'lovart_api_key';
const STORAGE_KEY_PROVIDER = 'lovart_ai_provider';
const STORAGE_KEY_PROVIDER_SETTINGS = 'lovart_ai_provider_settings';
const STORAGE_KEY_FEATURE_PROVIDERS = 'lovart_ai_feature_providers';
const STORAGE_KEY_FEATURE_SETTINGS = 'lovart_ai_feature_settings';
const STORAGE_KEY_MIGRATION_VERSION = 'lovart_api_settings_migration_version';
const CURRENT_MIGRATION_VERSION = 'apilio-default-base-url-v1';
const LEGACY_DEFAULT_AI_BASE_URLS = ['https://api.bltcy.ai', 'https://api.openai.com'];
export const API_SETTINGS_CHANGED_EVENT = 'lovart:api-settings-changed';

export const AI_FEATURE_IDS = ['chat', 'image', 'video'] as const;
export type AiFeatureId = typeof AI_FEATURE_IDS[number];

export const DEFAULT_AI_FEATURE_PROVIDERS: Record<AiFeatureId, AiProviderId> = {
    chat: 'magicapi',
    image: 'magicapi',
    video: 'laomandi',
};

const LEGACY_AI_FEATURE_PROVIDERS: Record<AiFeatureId, AiProviderId> = {
    chat: 'magicapi',
    image: 'magicapi',
    video: DEFAULT_AI_PROVIDER_ID,
};

export interface ApiProviderSettings {
    baseUrl: string;
    apiKey: string;
}

export interface ApiFeatureSettings extends ApiProviderSettings {
    providerId: AiProviderId;
}

export interface ApiSettings {
    providerId: AiProviderId;
    baseUrl: string;
    apiKey: string;
    providers: Record<AiProviderId, ApiProviderSettings>;
    featureProviders: Record<AiFeatureId, AiProviderId>;
    featureSettings: Record<AiFeatureId, ApiFeatureSettings>;
}

export type SaveApiSettingsInput = {
    providerId?: AiProviderId;
    baseUrl?: string;
    apiKey?: string;
    providers?: Partial<Record<AiProviderId, Partial<ApiProviderSettings>>>;
    featureProviders?: Partial<Record<AiFeatureId, AiProviderId>>;
    featureSettings?: Partial<Record<AiFeatureId, Partial<ApiFeatureSettings>>>;
};

function isAiFeatureId(value: unknown): value is AiFeatureId {
    return value === 'chat' || value === 'image' || value === 'video';
}

function notifyApiSettingsChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(API_SETTINGS_CHANGED_EVENT));
}

function isLegacyDefaultAiBaseUrl(value: unknown): boolean {
    return typeof value === 'string'
        && LEGACY_DEFAULT_AI_BASE_URLS.includes(value.trim().replace(/\/+$/, ''));
}

function migrateLegacyDefaultGatewayBaseUrl() {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY_MIGRATION_VERSION) === CURRENT_MIGRATION_VERSION) return;

    if (isLegacyDefaultAiBaseUrl(localStorage.getItem(STORAGE_KEY_BASE_URL))) {
        localStorage.removeItem(STORAGE_KEY_BASE_URL);
    }

    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_PROVIDER_SETTINGS) || '{}') as Record<string, unknown>;
        const defaultProviderSettings = parsed[DEFAULT_AI_PROVIDER_ID];
        if (defaultProviderSettings && typeof defaultProviderSettings === 'object') {
            const record = defaultProviderSettings as Record<string, unknown>;
            if (isLegacyDefaultAiBaseUrl(record.baseUrl)) {
                parsed[DEFAULT_AI_PROVIDER_ID] = {
                    ...record,
                    baseUrl: '',
                };
                localStorage.setItem(STORAGE_KEY_PROVIDER_SETTINGS, JSON.stringify(parsed));
            }
        }
    } catch {
        // Ignore malformed legacy settings; normal readers will fall back safely.
    }

    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_FEATURE_SETTINGS) || '{}') as Record<string, unknown>;
        let changed = false;
        for (const [featureId, rawSettings] of Object.entries(parsed)) {
            if (!isAiFeatureId(featureId) || !rawSettings || typeof rawSettings !== 'object') {
                continue;
            }

            const record = rawSettings as Record<string, unknown>;
            if (
                normalizeAiProviderId(record.providerId) === DEFAULT_AI_PROVIDER_ID
                && isLegacyDefaultAiBaseUrl(record.baseUrl)
            ) {
                parsed[featureId] = {
                    ...record,
                    baseUrl: '',
                };
                changed = true;
            }
        }

        if (changed) {
            localStorage.setItem(STORAGE_KEY_FEATURE_SETTINGS, JSON.stringify(parsed));
        }
    } catch {
        // Ignore malformed legacy settings; normal readers will fall back safely.
    }

    localStorage.setItem(STORAGE_KEY_MIGRATION_VERSION, CURRENT_MIGRATION_VERSION);
}

function createEmptyProviderSettings(): Record<AiProviderId, ApiProviderSettings> {
    return Object.keys(AI_PROVIDERS).reduce((acc, id) => {
        acc[id as AiProviderId] = { baseUrl: '', apiKey: '' };
        return acc;
    }, {} as Record<AiProviderId, ApiProviderSettings>);
}

function createFeatureSetting(providerId: AiProviderId, settings: ApiProviderSettings = { baseUrl: '', apiKey: '' }): ApiFeatureSettings {
    return {
        providerId,
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
    };
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

function createDefaultFeatureProviders(): Record<AiFeatureId, AiProviderId> {
    return { ...DEFAULT_AI_FEATURE_PROVIDERS };
}

function deriveFeatureProviders(featureSettings: Record<AiFeatureId, ApiFeatureSettings>): Record<AiFeatureId, AiProviderId> {
    return AI_FEATURE_IDS.reduce((acc, featureId) => {
        acc[featureId] = featureSettings[featureId].providerId;
        return acc;
    }, {} as Record<AiFeatureId, AiProviderId>);
}

function createFeatureSettingsFromProviders(
    providers: Record<AiProviderId, ApiProviderSettings>,
    featureProviders: Record<AiFeatureId, AiProviderId>,
): Record<AiFeatureId, ApiFeatureSettings> {
    return AI_FEATURE_IDS.reduce((acc, featureId) => {
        const providerId = featureProviders[featureId] || DEFAULT_AI_FEATURE_PROVIDERS[featureId];
        acc[featureId] = createFeatureSetting(providerId, providers[providerId]);
        return acc;
    }, {} as Record<AiFeatureId, ApiFeatureSettings>);
}

function mergeFeatureProviders(
    current: Record<AiFeatureId, AiProviderId>,
    patch?: Partial<Record<AiFeatureId, AiProviderId>>,
): Record<AiFeatureId, AiProviderId> {
    const next = { ...current };
    if (!patch) {
        return next;
    }

    for (const [rawFeatureId, rawProviderId] of Object.entries(patch)) {
        if (!isAiFeatureId(rawFeatureId)) {
            continue;
        }

        next[rawFeatureId] = normalizeAiProviderId(rawProviderId);
    }

    return next;
}

function isLegacyDefaultFeatureProviders(featureProviders: Record<AiFeatureId, AiProviderId>): boolean {
    return AI_FEATURE_IDS.every((featureId) => featureProviders[featureId] === LEGACY_AI_FEATURE_PROVIDERS[featureId]);
}

function shouldIgnoreLegacyVideoDefaultSetting(
    featureId: AiFeatureId,
    providerId: AiProviderId,
    record: Record<string, unknown>,
    currentSetting: ApiFeatureSettings,
): boolean {
    if (featureId !== 'video' || currentSetting.providerId !== DEFAULT_AI_FEATURE_PROVIDERS.video) {
        return false;
    }

    const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl.trim() : '';
    const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : '';
    return providerId === LEGACY_AI_FEATURE_PROVIDERS.video && !baseUrl && !apiKey;
}

function mergeFeatureSettings(
    current: Record<AiFeatureId, ApiFeatureSettings>,
    patch: Partial<Record<AiFeatureId, Partial<ApiFeatureSettings>>> | undefined,
    providers: Record<AiProviderId, ApiProviderSettings>,
): Record<AiFeatureId, ApiFeatureSettings> {
    const next = { ...current };
    if (!patch) {
        return next;
    }

    for (const [rawFeatureId, rawSettings] of Object.entries(patch)) {
        if (!isAiFeatureId(rawFeatureId) || !rawSettings || typeof rawSettings !== 'object') {
            continue;
        }

        const currentSetting = next[rawFeatureId] || createFeatureSetting(DEFAULT_AI_FEATURE_PROVIDERS[rawFeatureId], providers[DEFAULT_AI_FEATURE_PROVIDERS[rawFeatureId]]);
        const record = rawSettings as Record<string, unknown>;
        const providerId = normalizeAiProviderId(record.providerId ?? currentSetting.providerId);
        const providerFallback = createFeatureSetting(providerId, providers[providerId]);

        next[rawFeatureId] = {
            providerId,
            baseUrl: typeof record.baseUrl === 'string'
                ? record.baseUrl
                : providerId === currentSetting.providerId
                    ? currentSetting.baseUrl
                    : providerFallback.baseUrl,
            apiKey: typeof record.apiKey === 'string'
                ? record.apiKey
                : providerId === currentSetting.providerId
                    ? currentSetting.apiKey
                    : providerFallback.apiKey,
        };
    }

    return next;
}

function buildFeatureSettingsPatch(
    featureProviders?: Partial<Record<AiFeatureId, AiProviderId>>,
    featureSettings?: Partial<Record<AiFeatureId, Partial<ApiFeatureSettings>>>,
): Partial<Record<AiFeatureId, Partial<ApiFeatureSettings>>> | undefined {
    const patch = AI_FEATURE_IDS.reduce((acc, featureId) => {
        const nextFeatureProvider = featureProviders?.[featureId];
        const nextFeatureSettings = featureSettings?.[featureId];
        if (nextFeatureProvider === undefined && nextFeatureSettings === undefined) {
            return acc;
        }

        acc[featureId] = {
            ...(nextFeatureProvider === undefined ? {} : { providerId: nextFeatureProvider }),
            ...(nextFeatureSettings || {}),
        };
        return acc;
    }, {} as Partial<Record<AiFeatureId, Partial<ApiFeatureSettings>>>);

    return Object.keys(patch).length > 0 ? patch : undefined;
}

function readFeatureProviders(): Record<AiFeatureId, AiProviderId> {
    const storedFeatureProviders = localStorage.getItem(STORAGE_KEY_FEATURE_PROVIDERS);
    if (!storedFeatureProviders) {
        const legacyProvider = localStorage.getItem(STORAGE_KEY_PROVIDER);
        if (isAiProviderId(legacyProvider)) {
            return {
                chat: legacyProvider,
                image: legacyProvider,
                video: legacyProvider,
            };
        }

        return createDefaultFeatureProviders();
    }

    try {
        const parsed = JSON.parse(storedFeatureProviders) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return createDefaultFeatureProviders();
        }

        const featureProviders = mergeFeatureProviders(createDefaultFeatureProviders(), parsed as Partial<Record<AiFeatureId, AiProviderId>>);
        return isLegacyDefaultFeatureProviders(featureProviders) ? createDefaultFeatureProviders() : featureProviders;
    } catch {
        return createDefaultFeatureProviders();
    }
}

function readFeatureSettings(
    providers: Record<AiProviderId, ApiProviderSettings>,
    featureProviders: Record<AiFeatureId, AiProviderId>,
): Record<AiFeatureId, ApiFeatureSettings> {
    const fallbackSettings = createFeatureSettingsFromProviders(providers, featureProviders);
    const storedFeatureSettings = localStorage.getItem(STORAGE_KEY_FEATURE_SETTINGS);
    if (!storedFeatureSettings) {
        return fallbackSettings;
    }

    try {
        const parsed = JSON.parse(storedFeatureSettings) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return fallbackSettings;
        }

        return AI_FEATURE_IDS.reduce((acc, featureId) => {
            const rawSettings = (parsed as Record<string, unknown>)[featureId];
            const currentSetting = fallbackSettings[featureId];

            if (!rawSettings || typeof rawSettings !== 'object') {
                acc[featureId] = currentSetting;
                return acc;
            }

            const record = rawSettings as Record<string, unknown>;
            const providerId = normalizeAiProviderId(record.providerId ?? currentSetting.providerId);
            if (shouldIgnoreLegacyVideoDefaultSetting(featureId, providerId, record, currentSetting)) {
                acc[featureId] = currentSetting;
                return acc;
            }

            const providerFallback = createFeatureSetting(providerId, providers[providerId]);

            acc[featureId] = {
                providerId,
                baseUrl: typeof record.baseUrl === 'string'
                    ? record.baseUrl
                    : providerId === currentSetting.providerId
                        ? currentSetting.baseUrl
                        : providerFallback.baseUrl,
                apiKey: typeof record.apiKey === 'string'
                    ? record.apiKey
                    : providerId === currentSetting.providerId
                        ? currentSetting.apiKey
                        : providerFallback.apiKey,
            };
            return acc;
        }, {} as Record<AiFeatureId, ApiFeatureSettings>);
    } catch {
        return fallbackSettings;
    }
}

function getSelectedProviderId(providers: Record<AiProviderId, ApiProviderSettings>): AiProviderId {
    const storedProvider = normalizeAiProviderId(localStorage.getItem(STORAGE_KEY_PROVIDER));
    return providers[storedProvider] ? storedProvider : DEFAULT_AI_PROVIDER_ID;
}

function hasCustomProviderSettings(settings: Record<AiProviderId, ApiProviderSettings>): boolean {
    return Object.values(settings).some((providerSettings) => !!providerSettings.baseUrl || !!providerSettings.apiKey);
}

function hasCustomFeatureProviders(featureProviders: Record<AiFeatureId, AiProviderId>): boolean {
    return AI_FEATURE_IDS.some((featureId) => featureProviders[featureId] !== DEFAULT_AI_FEATURE_PROVIDERS[featureId]);
}

function hasCustomFeatureSettings(featureSettings: Record<AiFeatureId, ApiFeatureSettings>): boolean {
    return AI_FEATURE_IDS.some((featureId) => {
        const settings = featureSettings[featureId];
        return settings.providerId !== DEFAULT_AI_FEATURE_PROVIDERS[featureId]
            || !!settings.baseUrl
            || !!settings.apiKey;
    });
}

/** Read saved settings from localStorage (client-side only). */
export function getApiSettings(): ApiSettings {
    if (typeof window === 'undefined') {
        return {
            providerId: DEFAULT_AI_PROVIDER_ID,
            baseUrl: '',
            apiKey: '',
            providers: createEmptyProviderSettings(),
            featureProviders: createDefaultFeatureProviders(),
            featureSettings: createFeatureSettingsFromProviders(createEmptyProviderSettings(), createDefaultFeatureProviders()),
        };
    }

    migrateLegacyDefaultGatewayBaseUrl();

    const providers = readProviderSettings();
    const providerId = getSelectedProviderId(providers);
    const activeSettings = providers[providerId] || { baseUrl: '', apiKey: '' };
    const storedFeatureProviders = readFeatureProviders();
    const featureSettings = readFeatureSettings(providers, storedFeatureProviders);
    const featureProviders = deriveFeatureProviders(featureSettings);

    return {
        providerId,
        baseUrl: activeSettings.baseUrl,
        apiKey: activeSettings.apiKey,
        providers,
        featureProviders,
        featureSettings,
    };
}

/** Persist settings to localStorage. */
export function saveApiSettings(settings: SaveApiSettingsInput) {
    if (typeof window === 'undefined') return;

    const providerId = normalizeAiProviderId(settings.providerId ?? localStorage.getItem(STORAGE_KEY_PROVIDER));
    const providers = mergeProviderSettings(readProviderSettings(), settings.providers);
    if (settings.baseUrl !== undefined || settings.apiKey !== undefined || settings.providerId !== undefined) {
        providers[providerId] = {
            baseUrl: typeof settings.baseUrl === 'string' ? settings.baseUrl : providers[providerId].baseUrl,
            apiKey: typeof settings.apiKey === 'string' ? settings.apiKey : providers[providerId].apiKey,
        };
    }

    const currentFeatureProviders = mergeFeatureProviders(readFeatureProviders(), settings.featureProviders);
    const currentFeatureSettings = readFeatureSettings(providers, currentFeatureProviders);
    const featureSettings = mergeFeatureSettings(
        currentFeatureSettings,
        buildFeatureSettingsPatch(settings.featureProviders, settings.featureSettings),
        providers,
    );
    const featureProviders = deriveFeatureProviders(featureSettings);

    localStorage.setItem(STORAGE_KEY_PROVIDER, providerId);
    localStorage.setItem(STORAGE_KEY_PROVIDER_SETTINGS, JSON.stringify(providers));
    localStorage.setItem(STORAGE_KEY_FEATURE_PROVIDERS, JSON.stringify(featureProviders));
    localStorage.setItem(STORAGE_KEY_FEATURE_SETTINGS, JSON.stringify(featureSettings));

    if (providerId === DEFAULT_AI_PROVIDER_ID) {
        if (settings.baseUrl) {
            localStorage.setItem(STORAGE_KEY_BASE_URL, settings.baseUrl);
        } else if (settings.baseUrl !== undefined) {
            localStorage.removeItem(STORAGE_KEY_BASE_URL);
        }
        if (settings.apiKey) {
            localStorage.setItem(STORAGE_KEY_API_KEY, settings.apiKey);
        } else if (settings.apiKey !== undefined) {
            localStorage.removeItem(STORAGE_KEY_API_KEY);
        }
    }

    notifyApiSettingsChanged();
}

export function getProviderApiSettings(providerId: AiProviderId): ApiProviderSettings {
    if (typeof window === 'undefined') {
        return { baseUrl: '', apiKey: '' };
    }

    migrateLegacyDefaultGatewayBaseUrl();

    return readProviderSettings()[providerId] || { baseUrl: '', apiKey: '' };
}

export function saveSelectedAiProvider(providerId: AiProviderId) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_PROVIDER, providerId);
    notifyApiSettingsChanged();
}

export function saveFeatureAiProvider(featureId: AiFeatureId, providerId: AiProviderId) {
    if (typeof window === 'undefined') return;
    saveApiSettings({
        featureSettings: {
            [featureId]: {
                providerId,
                baseUrl: '',
                apiKey: '',
            },
        },
    });
}

export function hasCustomApiSettings(): boolean {
    if (typeof window === 'undefined') return false;
    const settings = getApiSettings();
    return settings.providerId !== DEFAULT_AI_PROVIDER_ID
        || hasCustomProviderSettings(settings.providers)
        || hasCustomFeatureProviders(settings.featureProviders)
        || hasCustomFeatureSettings(settings.featureSettings);
}

export function getEffectiveApiBaseUrl(settings: ApiSettings = getApiSettings()): string {
    const provider = getAiProvider(settings.providerId);
    return getSafeClientBaseUrl(settings.baseUrl, settings.providerId) || provider.defaultBaseUrl;
}

export function getApiProviderForFeature(featureId: AiFeatureId, settings: ApiSettings = getApiSettings()): AiProviderId {
    return settings.featureProviders[featureId] || DEFAULT_AI_FEATURE_PROVIDERS[featureId];
}

export function getFeatureApiSettings(
    featureId: AiFeatureId,
    settings: ApiSettings = getApiSettings(),
): ApiProviderSettings & { providerId: AiProviderId } {
    const featureSettings = settings.featureSettings[featureId];
    if (featureSettings) {
        return featureSettings;
    }

    const providerId = getApiProviderForFeature(featureId, settings);
    return createFeatureSetting(providerId, settings.providers[providerId]);
}

export function getEffectiveProviderApiBaseUrl(
    providerId: AiProviderId,
    settings: ApiProviderSettings = getProviderApiSettings(providerId),
): string {
    const provider = getAiProvider(providerId);
    return getSafeClientBaseUrl(settings.baseUrl, providerId) || provider.defaultBaseUrl;
}

/** Clear saved settings. */
export function clearApiSettings() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_BASE_URL);
    localStorage.removeItem(STORAGE_KEY_API_KEY);
    localStorage.removeItem(STORAGE_KEY_PROVIDER);
    localStorage.removeItem(STORAGE_KEY_PROVIDER_SETTINGS);
    localStorage.removeItem(STORAGE_KEY_FEATURE_PROVIDERS);
    localStorage.removeItem(STORAGE_KEY_FEATURE_SETTINGS);
    localStorage.setItem(STORAGE_KEY_MIGRATION_VERSION, CURRENT_MIGRATION_VERSION);
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
            || event.key === STORAGE_KEY_FEATURE_PROVIDERS
            || event.key === STORAGE_KEY_FEATURE_SETTINGS
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
export function apiSettingsHeaders(featureId?: AiFeatureId): Record<string, string> {
    const settings = getApiSettings();
    const activeSettings = featureId ? getFeatureApiSettings(featureId, settings) : settings;
    const providerId = activeSettings.providerId;
    const headers: Record<string, string> = {
        'x-ai-provider': providerId,
    };
    const normalizedBaseUrl = getSafeClientBaseUrl(activeSettings.baseUrl, providerId);
    if (normalizedBaseUrl) headers['x-ai-base-url'] = normalizedBaseUrl;
    if (activeSettings.apiKey) headers['x-ai-api-key'] = activeSettings.apiKey;
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
