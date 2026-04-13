'use client';

export interface UpscaleServiceHealth {
  ok: boolean;
  gpu?: string;
  error?: string;
  details?: string;
}

export interface UpscaleServiceSettings {
  defaultBaseUrl: string;
  effectiveBaseUrl: string;
  configuredBaseUrl: string | null;
  isCustomBaseUrl: boolean;
  health: UpscaleServiceHealth;
}

export const UPSCALE_SERVICE_SETTINGS_CHANGED_EVENT = 'lovart:upscale-service-settings-changed';

export async function getUpscaleServiceSettings(): Promise<UpscaleServiceSettings> {
  return requestJson<UpscaleServiceSettings>('/api/upscale/settings', {
    cache: 'no-store',
  });
}

export async function saveUpscaleServiceBaseUrl(baseUrl: string): Promise<UpscaleServiceSettings> {
  const result = await requestJson<UpscaleServiceSettings>('/api/upscale/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ baseUrl }),
  });
  notifyUpscaleServiceSettingsChanged();
  return result;
}

export async function resetUpscaleServiceBaseUrl(): Promise<UpscaleServiceSettings> {
  const result = await requestJson<UpscaleServiceSettings>('/api/upscale/settings', {
    method: 'DELETE',
  });
  notifyUpscaleServiceSettingsChanged();
  return result;
}

export function subscribeUpscaleServiceSettingsChange(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustomEvent = () => listener();
  window.addEventListener(UPSCALE_SERVICE_SETTINGS_CHANGED_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener(UPSCALE_SERVICE_SETTINGS_CHANGED_EVENT, handleCustomEvent);
  };
}

function notifyUpscaleServiceSettingsChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(UPSCALE_SERVICE_SETTINGS_CHANGED_EVENT));
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => ({})) as { error?: unknown } & T;

  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `请求失败 (${response.status})`);
  }

  return payload;
}