import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_AI_FEATURE_PROVIDERS,
  apiSettingsHeaders,
  clearApiSettings,
  getEffectiveProviderApiBaseUrl,
  getApiSettings,
  saveApiSettings,
} from './api-settings';
import { AI_PROVIDER_OPTIONS } from './ai-providers';

function createLocalStorageMock(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function installBrowserStorage(initial: Record<string, string> = {}) {
  const localStorageMock = createLocalStorageMock(initial);
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('window', {
    localStorage: localStorageMock,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('CustomEvent', class CustomEventMock {
    type: string;

    constructor(type: string) {
      this.type = type;
    }
  });
  return localStorageMock;
}

describe('api-settings feature providers', () => {
  beforeEach(() => {
    installBrowserStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults chat and image to MagicAPI while defaulting video to Laomandi', () => {
    expect(getApiSettings().featureProviders).toEqual(DEFAULT_AI_FEATURE_PROVIDERS);
    expect(apiSettingsHeaders('chat')['x-ai-provider']).toBe('magicapi');
    expect(apiSettingsHeaders('image')['x-ai-provider']).toBe('magicapi');
    expect(apiSettingsHeaders('video')['x-ai-provider']).toBe('laomandi');
  });

  it('defaults the default AI gateway to Apilio while still allowing the legacy bltcy base URL', () => {
    expect(getEffectiveProviderApiBaseUrl('bltcy')).toBe('https://api.apilio.ai');
    expect(getEffectiveProviderApiBaseUrl('bltcy', {
      baseUrl: 'https://api.bltcy.ai',
      apiKey: '',
    })).toBe('https://api.bltcy.ai');
    expect(getEffectiveProviderApiBaseUrl('bltcy', {
      baseUrl: 'https://api.apilio.ai',
      apiKey: '',
    })).toBe('https://api.apilio.ai');
    expect(getEffectiveProviderApiBaseUrl('bltcy', {
      baseUrl: 'https://api.openai.com',
      apiKey: '',
    })).toBe('https://api.apilio.ai');
  });

  it('migrates previously saved default gateway URLs so they fall back to the new Apilio default', () => {
    localStorage.setItem('lovart_api_base_url', 'https://api.openai.com');
    localStorage.setItem('lovart_ai_feature_providers', JSON.stringify({
      chat: 'magicapi',
      image: 'bltcy',
      video: 'laomandi',
    }));
    localStorage.setItem('lovart_ai_feature_settings', JSON.stringify({
      chat: { providerId: 'magicapi', baseUrl: '', apiKey: '' },
      image: { providerId: 'bltcy', baseUrl: 'https://api.openai.com', apiKey: 'image-key' },
      video: { providerId: 'laomandi', baseUrl: '', apiKey: '' },
    }));

    const settings = getApiSettings();

    expect(settings.providers.bltcy.baseUrl).toBe('');
    expect(settings.featureSettings.image).toMatchObject({
      providerId: 'bltcy',
      baseUrl: '',
      apiKey: 'image-key',
    });
    expect(getEffectiveProviderApiBaseUrl('bltcy')).toBe('https://api.apilio.ai');
  });

  it('keeps bltcy when it is explicitly saved after the Apilio default migration', () => {
    getApiSettings();

    saveApiSettings({
      featureSettings: {
        image: {
          providerId: 'bltcy',
          baseUrl: 'https://api.bltcy.ai',
          apiKey: 'image-key',
        },
      },
    });

    expect(apiSettingsHeaders('image')).toMatchObject({
      'x-ai-provider': 'bltcy',
      'x-ai-base-url': 'https://api.bltcy.ai',
      'x-ai-api-key': 'image-key',
    });
  });

  it('migrates a legacy global provider to all features when feature providers are absent', () => {
    localStorage.setItem('lovart_ai_provider', 'vapi');

    expect(getApiSettings().featureProviders).toEqual({
      chat: 'vapi',
      image: 'vapi',
      video: 'vapi',
    });
  });

  it('migrates the old saved empty video default to Laomandi', () => {
    localStorage.setItem('lovart_ai_feature_providers', JSON.stringify({
      chat: 'magicapi',
      image: 'magicapi',
      video: 'bltcy',
    }));
    localStorage.setItem('lovart_ai_feature_settings', JSON.stringify({
      chat: { providerId: 'magicapi', baseUrl: '', apiKey: '' },
      image: { providerId: 'magicapi', baseUrl: '', apiKey: '' },
      video: { providerId: 'bltcy', baseUrl: '', apiKey: '' },
    }));

    expect(getApiSettings().featureProviders.video).toBe('laomandi');
    expect(apiSettingsHeaders('video')['x-ai-provider']).toBe('laomandi');
  });

  it('keeps a saved video provider when it has custom credentials', () => {
    localStorage.setItem('lovart_ai_feature_providers', JSON.stringify({
      chat: 'magicapi',
      image: 'magicapi',
      video: 'bltcy',
    }));
    localStorage.setItem('lovart_ai_feature_settings', JSON.stringify({
      chat: { providerId: 'magicapi', baseUrl: '', apiKey: '' },
      image: { providerId: 'magicapi', baseUrl: '', apiKey: '' },
      video: { providerId: 'bltcy', baseUrl: 'https://api.bltcy.ai/v1', apiKey: 'video-key' },
    }));

    expect(apiSettingsHeaders('video')).toMatchObject({
      'x-ai-provider': 'bltcy',
      'x-ai-base-url': 'https://api.bltcy.ai/v1',
      'x-ai-api-key': 'video-key',
    });
  });

  it('builds feature headers from per-feature credentials even when features share a provider', () => {
    saveApiSettings({
      featureSettings: {
        chat: {
          providerId: 'magicapi',
          baseUrl: 'https://www.geeknow.top',
          apiKey: 'chat-key',
        },
        image: {
          providerId: 'magicapi',
          baseUrl: 'https://api.geeknow.top',
          apiKey: 'image-key',
        },
        video: {
          providerId: 'mkeai',
          baseUrl: 'https://api.mkeai.com',
          apiKey: 'video-key',
        },
      },
    });

    expect(apiSettingsHeaders('chat')).toMatchObject({
      'x-ai-provider': 'magicapi',
      'x-ai-base-url': 'https://www.geeknow.top',
      'x-ai-api-key': 'chat-key',
    });
    expect(apiSettingsHeaders('image')).toMatchObject({
      'x-ai-provider': 'magicapi',
      'x-ai-base-url': 'https://api.geeknow.top',
      'x-ai-api-key': 'image-key',
    });
    expect(apiSettingsHeaders('video')).toMatchObject({
      'x-ai-provider': 'mkeai',
      'x-ai-base-url': 'https://api.mkeai.com',
      'x-ai-api-key': 'video-key',
    });
  });

  it('allows Laomandi only as a video API provider with independent credentials', () => {
    saveApiSettings({
      featureSettings: {
        video: {
          providerId: 'laomandi',
          baseUrl: 'https://api.laomandi.com',
          apiKey: 'video-key',
        },
      },
    });

    expect(AI_PROVIDER_OPTIONS.filter((provider) => provider.capabilities.chat).map((provider) => provider.id)).not.toContain('laomandi');
    expect(AI_PROVIDER_OPTIONS.filter((provider) => provider.capabilities.image).map((provider) => provider.id)).not.toContain('laomandi');
    expect(AI_PROVIDER_OPTIONS.filter((provider) => provider.capabilities.video).map((provider) => provider.id)).toContain('laomandi');
    expect(apiSettingsHeaders('video')).toMatchObject({
      'x-ai-provider': 'laomandi',
      'x-ai-base-url': 'https://api.laomandi.com',
      'x-ai-api-key': 'video-key',
    });
  });

  it('allows the Ark official video base URL for Laomandi video settings', () => {
    saveApiSettings({
      featureSettings: {
        video: {
          providerId: 'laomandi',
          baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          apiKey: 'video-key',
        },
      },
    });

    expect(apiSettingsHeaders('video')).toMatchObject({
      'x-ai-provider': 'laomandi',
      'x-ai-base-url': 'https://ark.cn-beijing.volces.com/api/v3',
      'x-ai-api-key': 'video-key',
    });
  });

  it('clears feature providers back to the new defaults', () => {
    saveApiSettings({
      providerId: 'jiekou',
      baseUrl: 'https://api.jiekou.ai',
      apiKey: 'jiekou-key',
      featureProviders: {
        chat: 'jiekou',
        image: 'jiekou',
        video: 'jiekou',
      },
    });

    clearApiSettings();

    expect(getApiSettings().featureProviders).toEqual(DEFAULT_AI_FEATURE_PROVIDERS);
  });
});
