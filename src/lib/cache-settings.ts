'use client';

export interface CdnCacheSettings {
  defaultDirectory: string;
  effectiveDirectory: string;
  configuredDirectory: string | null;
  isCustomDirectory: boolean;
  exists: boolean;
  writable: boolean;
  usageBytes: number;
  fileCount: number;
}

export interface CdnCacheClearResult extends CdnCacheSettings {
  clearedBytes: number;
  clearedFiles: number;
}

export const CDN_CACHE_SETTINGS_CHANGED_EVENT = 'lovart:cdn-cache-settings-changed';

export async function getCdnCacheSettings(): Promise<CdnCacheSettings> {
  return requestJson<CdnCacheSettings>('/api/cdn-cache/settings', {
    cache: 'no-store',
  });
}

export async function saveCdnCacheDirectory(directory: string): Promise<CdnCacheSettings> {
  const result = await requestJson<CdnCacheSettings>('/api/cdn-cache/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ directory }),
  });
  notifyCdnCacheSettingsChanged();
  return result;
}

export async function resetCdnCacheDirectory(): Promise<CdnCacheSettings> {
  const result = await requestJson<CdnCacheSettings>('/api/cdn-cache/settings', {
    method: 'DELETE',
  });
  notifyCdnCacheSettingsChanged();
  return result;
}

export async function clearCdnCacheDirectory(): Promise<CdnCacheClearResult> {
  const result = await requestJson<CdnCacheClearResult>('/api/cdn-cache/clear', {
    method: 'POST',
  });
  notifyCdnCacheSettingsChanged();
  return result;
}

export function subscribeCdnCacheSettingsChange(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustomEvent = () => listener();
  window.addEventListener(CDN_CACHE_SETTINGS_CHANGED_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener(CDN_CACHE_SETTINGS_CHANGED_EVENT, handleCustomEvent);
  };
}

function notifyCdnCacheSettingsChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(CDN_CACHE_SETTINGS_CHANGED_EVENT));
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => ({})) as { error?: unknown } & T;

  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `请求失败 (${response.status})`);
  }

  return payload;
}