/**
 * API Settings utility — stores AI_API_BASE_URL & AI_API_KEY in localStorage
 * and provides helpers to inject them into fetch headers.
 */

import { DEFAULT_AI_BASE_URL, validateAiGatewayBaseUrl } from './network-policy';

const STORAGE_KEY_BASE_URL = 'lovart_api_base_url';
const STORAGE_KEY_API_KEY = 'lovart_api_key';
export const API_SETTINGS_CHANGED_EVENT = 'lovart:api-settings-changed';

export interface ApiSettings {
    baseUrl: string;
    apiKey: string;
}

function notifyApiSettingsChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(API_SETTINGS_CHANGED_EVENT));
}

/** Read saved settings from localStorage (client-side only) */
export function getApiSettings(): ApiSettings {
    if (typeof window === 'undefined') return { baseUrl: '', apiKey: '' };
    return {
        baseUrl: localStorage.getItem(STORAGE_KEY_BASE_URL) || '',
        apiKey: localStorage.getItem(STORAGE_KEY_API_KEY) || '',
    };
}

/** Persist settings to localStorage */
export function saveApiSettings(settings: ApiSettings) {
    if (typeof window === 'undefined') return;
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
    notifyApiSettingsChanged();
}

/** Clear saved settings */
export function clearApiSettings() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_BASE_URL);
    localStorage.removeItem(STORAGE_KEY_API_KEY);
    notifyApiSettingsChanged();
} 

export function subscribeApiSettingsChange(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const handleCustomEvent = () => listener();
    const handleStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === STORAGE_KEY_BASE_URL || event.key === STORAGE_KEY_API_KEY) {
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
 * Only adds headers if values are non-empty.
 */ 
export function apiSettingsHeaders(): Record<string, string> {
    const settings = getApiSettings();
    const headers: Record<string, string> = {};
    const normalizedBaseUrl = getSafeClientBaseUrl(settings.baseUrl);
    if (normalizedBaseUrl) headers['x-ai-base-url'] = normalizedBaseUrl;
    if (settings.apiKey) headers['x-ai-api-key'] = settings.apiKey;
    return headers;
}

/**
 * Normalize a user-supplied base URL, returning '' for invalid values.
 * Wraps the network-policy validator with a safe try/catch for client use.
 */
export function getSafeClientBaseUrl(baseUrl: string): string {
    if (!baseUrl) {
        return '';
    }

    try {
        return validateAiGatewayBaseUrl(baseUrl, {
            defaultBaseUrl: DEFAULT_AI_BASE_URL,
        }).normalizedBaseUrl;
    } catch {
        return '';
    }
}
