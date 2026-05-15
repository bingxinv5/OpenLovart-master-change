import { DEFAULT_AI_BASE_URL } from './network-policy';

export type AiProviderId = 'bltcy' | 'magicapi' | 'jiekou' | 'vapi';

export type AiProviderBaseUrlOption = {
  label: string;
  value: string;
};

export type AiProviderDefinition = {
  id: AiProviderId;
  label: string;
  description: string;
  defaultBaseUrl: string;
  allowedPublicPatterns: string[];
  apiKeyEnv: string;
  baseUrlEnv: string;
  baseUrlOptions?: AiProviderBaseUrlOption[];
  capabilities: {
    chat: boolean;
    image: boolean;
    video: boolean;
    geminiNativeImage?: boolean;
  };
  models: {
    chat: string[];
    image: string[];
    video: string[];
  };
};

export const DEFAULT_AI_PROVIDER_ID: AiProviderId = 'bltcy';

export const AI_PROVIDERS: Record<AiProviderId, AiProviderDefinition> = {
  bltcy: {
    id: 'bltcy',
    label: '默认 AI 网关',
    description: '当前 OpenLovart 默认接入，保持原有图片、视频、聊天链路。',
    defaultBaseUrl: DEFAULT_AI_BASE_URL,
    allowedPublicPatterns: ['api.bltcy.ai'],
    apiKeyEnv: 'AI_API_KEY',
    baseUrlEnv: 'AI_API_BASE_URL',
    capabilities: {
      chat: true,
      image: true,
      video: true,
    },
    models: {
      chat: [
        'gemini-3.1-pro-preview',
        'gemini-3-pro-preview',
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'gpt-5.4',
        'gpt-5.4-pro',
      ],
      image: [
        'gemini-3.1-flash-image-preview',
        'nano-banana-2',
        'gpt-image-2',
        'grok-4.2-image',
        'doubao-seedream-5-0-260128',
      ],
      video: ['veo3.1', 'veo3.1-fast', 'veo3.1-components', 'doubao-seedance-2-0-260128'],
    },
  },
  magicapi: {
    id: 'magicapi',
    label: 'MagicAPI / GeekNow',
    description: '独立第三方平台，按 MagicAPI 文档和 GeekNow 插件样本适配 OpenAI/Gemini/视频接口。',
    defaultBaseUrl: 'https://api.geeknow.top',
    allowedPublicPatterns: ['api.geeknow.top', 'www.geeknow.top', 'geek.closeai.icu'],
    apiKeyEnv: 'MAGICAPI_API_KEY',
    baseUrlEnv: 'MAGICAPI_API_BASE_URL',
    baseUrlOptions: [
      { label: 'CDN 服务', value: 'https://api.geeknow.top' },
      { label: '海外 CN2 服务', value: 'https://www.geeknow.top' },
      { label: '国内服务器', value: 'https://geek.closeai.icu' },
    ],
    capabilities: {
      chat: true,
      image: true,
      video: true,
      geminiNativeImage: true,
    },
    models: {
      chat: [
        'gemini-3.1-pro-preview',
        'gemini-3-pro-preview',
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'gpt-5.4',
        'gpt-5.4-pro',
      ],
      image: [
        'gemini-3-pro-image-preview',
        'gemini-3.1-flash-image-preview',
        'doubao-seedream-5-0-260128',
        'grok-4-2-image',
        'gpt-image-2',
        'gpt-image-2-pro',
      ],
      video: [
        'sora-2',
        'grok-video-3-pro',
        'doubao-seed-2-0-pro-260215',
        'veo_3_1',
        'veo_3_1-fast',
        'veo_3_1-components',
      ],
    },
  },
  jiekou: {
    id: 'jiekou',
    label: 'JieKou AI',
    description: '独立第三方接口 AI 平台，支持聊天、图片生成和 Sora 2 / Veo 3.1 视频生成。',
    defaultBaseUrl: 'https://api.jiekou.ai',
    allowedPublicPatterns: ['api.jiekou.ai'],
    apiKeyEnv: 'JIEKOU_API_KEY',
    baseUrlEnv: 'JIEKOU_API_BASE_URL',
    capabilities: {
      chat: true,
      image: true,
      video: true,
    },
    models: {
      chat: [
        'gemini-3.1-pro-preview',
        'gemini-3-pro-preview',
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'gpt-5.4',
        'gpt-5.4-pro',
      ],
      image: [
        'gemini-3-pro-image',
        'nano-banana-2',
        'gpt-image-2',
      ],
      video: [
        'jiekou-sora-2',
        'jiekou-veo-3.1',
      ],
    },
  },
  vapi: {
    id: 'vapi',
    label: 'V-API',
    description: '独立第三方 API 平台，支持聊天、图片生成和 Sora 2 视频生成。',
    defaultBaseUrl: 'https://api.vveai.com',
    allowedPublicPatterns: ['api.vveai.com'],
    apiKeyEnv: 'VAPI_API_KEY',
    baseUrlEnv: 'VAPI_API_BASE_URL',
    capabilities: {
      chat: true,
      image: true,
      video: true,
    },
    models: {
      chat: [
        'gemini-3.1-pro-preview',
        'gemini-3-pro-preview',
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'gpt-5.4',
        'gpt-5.4-pro',
      ],
      image: [
        'gemini-3.1-flash-image-preview',
        'nano-banana-pro',
        'gpt-image-2',
      ],
      video: [
        'sora-2_1280x720',
        'ssora-2-pro_1280x720',
        'sora-2-pro_1792x1024',
      ],
    },
  },
};

export const AI_PROVIDER_OPTIONS = Object.values(AI_PROVIDERS);

export function isAiProviderId(value: unknown): value is AiProviderId {
  return value === 'bltcy' || value === 'magicapi' || value === 'jiekou' || value === 'vapi';
}

export function normalizeAiProviderId(value: unknown): AiProviderId {
  return isAiProviderId(value) ? value : DEFAULT_AI_PROVIDER_ID;
}

export function getAiProvider(providerId: unknown): AiProviderDefinition {
  return AI_PROVIDERS[normalizeAiProviderId(providerId)];
}

export function isMagicApiProvider(providerId: unknown): boolean {
  return normalizeAiProviderId(providerId) === 'magicapi';
}

export function isJieKouProvider(providerId: unknown): boolean {
  return normalizeAiProviderId(providerId) === 'jiekou';
}

export function isVApiProvider(providerId: unknown): boolean {
  return normalizeAiProviderId(providerId) === 'vapi';
}

export function getProviderImageModels(providerId: unknown): string[] {
  return [...getAiProvider(providerId).models.image];
}

export function getProviderVideoModels(providerId: unknown): string[] {
  return [...getAiProvider(providerId).models.video];
}

export function getProviderAllowedPublicPatterns(providerId: unknown): string[] {
  return [...getAiProvider(providerId).allowedPublicPatterns];
}