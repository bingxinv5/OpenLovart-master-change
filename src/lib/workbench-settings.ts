'use client';

import {
  MAGICAPI_GPT_IMAGE_ASPECT_RATIO_OPTIONS,
  MAGICAPI_IMAGE_ASPECT_RATIO_OPTIONS,
  getMagicApiGeminiImageSizeOptions,
  getMagicApiGptImageSizeOptions,
  isOpenAiGptImageModel,
  isGeminiNativeImageModel,
  isJieKouGptImageModel,
  isJieKouImageAspectRatio,
  resolveJieKouGptImageQuality,
  resolveJieKouGptImageSize,
  resolveJieKouStandardImageSize,
  resolveOpenAiGptImageQuality,
  isStandardImageSize,
  resolveMagicApiOpenAiStyleImageSize,
  resolveOpenAiGptImageAspectRatio,
  resolveOpenAiGptImageSize,
} from './image-generation-models';
import type { OpenAiGptImageQuality } from './image-generation-models';
import {
  AI_PROVIDER_OPTIONS,
  DEFAULT_AI_PROVIDER_ID,
  getProviderImageModels,
  getProviderVideoModels,
  isJieKouProvider,
  isMagicApiProvider,
  normalizeAiProviderId,
  type AiProviderId,
} from './ai-providers';
import {
  VIDEO_DURATION_OPTIONS,
  getDefaultVideoModelForProvider,
  getVideoAspectRatioOptions,
  getVideoDurationOptions,
  isVideoModel,
  type VideoAspectRatio,
  type VideoDuration,
  type VideoModel,
} from './video-generation-models';

export { VIDEO_DURATION_OPTIONS } from './video-generation-models';
export type { VideoDuration } from './video-generation-models';

export interface WorkbenchSettings {
  autoSaveGenerated: boolean;
  warnOnHighStorage: boolean;
  canvasTheme: 'light' | 'dark';
  defaultImageFit: 'contain' | 'cover';
  defaultImageSurface: 'checker' | 'light' | 'dark';
  imageDefaults: ImageGenerationDefaults;
  imageProviderDefaults: Record<AiProviderId, ImageGenerationDefaults>;
  videoDefaults: VideoGenerationDefaults;
  videoProviderDefaults: Record<AiProviderId, VideoGenerationDefaults>;
}

export const IMAGE_DEFAULT_MODEL_OPTIONS = [
  'gemini-3.1-flash-image-preview',
  'nano-banana-pro',
  'nano-banana-2',
  'gpt-image-2',
  'grok-4.2-image',
  'doubao-seedream-5-0-260128',
  'gemini-3-pro-image',
  'gemini-3-pro-image-preview',
  'grok-4-2-image',
  'gpt-image-2-pro',
] as const;
export type ImageDefaultModel = typeof IMAGE_DEFAULT_MODEL_OPTIONS[number];

export interface ImageGenerationDefaults {
  model: ImageDefaultModel;
  aspectRatio: 'auto' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2' | '4:5' | '5:4' | '21:9' | '9:21';
  imageSize: string;
  quality: OpenAiGptImageQuality;
  generateCount: 1 | 2 | 3 | 4;
}

export interface VideoGenerationDefaults {
  model: VideoModel;
  aspectRatio: VideoAspectRatio;
  duration: VideoDuration;
  enhancePrompt: boolean;
}

export const DEFAULT_IMAGE_PROVIDER_DEFAULTS: Record<AiProviderId, ImageGenerationDefaults> = {
  bltcy: {
    model: 'gemini-3.1-flash-image-preview',
    aspectRatio: '21:9',
    imageSize: '2K',
    quality: 'auto',
    generateCount: 1,
  },
  magicapi: {
    model: 'gemini-3-pro-image-preview',
    aspectRatio: '21:9',
    imageSize: '2K',
    quality: 'auto',
    generateCount: 1,
  },
  jiekou: {
    model: 'gemini-3-pro-image',
    aspectRatio: '1:1',
    imageSize: '1K',
    quality: 'auto',
    generateCount: 1,
  },
  vapi: {
    model: 'gemini-3.1-flash-image-preview',
    aspectRatio: '1:1',
    imageSize: '1K',
    quality: 'auto',
    generateCount: 1,
  },
  mkeai: {
    model: 'gemini-3.1-flash-image-preview',
    aspectRatio: '1:1',
    imageSize: '1K',
    quality: 'auto',
    generateCount: 1,
  },
};

export const DEFAULT_VIDEO_PROVIDER_DEFAULTS: Record<AiProviderId, VideoGenerationDefaults> = {
  bltcy: {
    model: 'veo3.1',
    aspectRatio: '16:9',
    duration: '5s',
    enhancePrompt: true,
  },
  magicapi: {
    model: 'sora-2',
    aspectRatio: '16:9',
    duration: '10s',
    enhancePrompt: false,
  },
  jiekou: {
    model: 'jiekou-sora-2',
    aspectRatio: '16:9',
    duration: '8s',
    enhancePrompt: true,
  },
  vapi: {
    model: 'sora-2_1280x720',
    aspectRatio: '16:9',
    duration: '8s',
    enhancePrompt: false,
  },
  mkeai: {
    model: 'mkeai-sora-2',
    aspectRatio: '16:9',
    duration: '8s',
    enhancePrompt: false,
  },
};

export interface StorageEstimateInfo {
  usageBytes: number;
  quotaBytes: number;
  usageRatio: number;
  persisted: boolean;
}

const STORAGE_KEY = 'lovart_workbench_settings';
export const WORKBENCH_SETTINGS_CHANGED_EVENT = 'lovart:workbench-settings-changed';
const DB_NAME = 'lovart_workbench_settings';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const DIRECTORY_HANDLE_KEY = 'autosave-directory-handle';

export const DEFAULT_WORKBENCH_SETTINGS: WorkbenchSettings = {
  autoSaveGenerated: false,
  warnOnHighStorage: true,
  canvasTheme: 'light',
  defaultImageFit: 'contain',
  defaultImageSurface: 'checker',
  imageDefaults: DEFAULT_IMAGE_PROVIDER_DEFAULTS.bltcy,
  imageProviderDefaults: DEFAULT_IMAGE_PROVIDER_DEFAULTS,
  videoDefaults: DEFAULT_VIDEO_PROVIDER_DEFAULTS.bltcy,
  videoProviderDefaults: DEFAULT_VIDEO_PROVIDER_DEFAULTS,
};

let dbInstance: IDBDatabase | null = null;
let dbReady: Promise<IDBDatabase> | null = null;

type PermissionState = 'granted' | 'denied' | 'prompt';

interface DirectoryHandleWithPermission extends FileSystemDirectoryHandle {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbReady) return dbReady;

  dbReady = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onclose = () => {
        dbInstance = null;
        dbReady = null;
      };
      resolve(dbInstance);
    };
    req.onerror = () => reject(req.error);
  });

  return dbReady;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isImageDefaultModel(value: unknown): value is ImageDefaultModel {
  return typeof value === 'string' && (IMAGE_DEFAULT_MODEL_OPTIONS as readonly string[]).includes(value);
}

function isImageDefaultAspectRatio(value: unknown): value is ImageGenerationDefaults['aspectRatio'] {
  return value === 'auto'
    || value === '1:1'
    || value === '4:3'
    || value === '3:4'
    || value === '16:9'
    || value === '9:16'
    || value === '2:3'
    || value === '3:2'
    || value === '4:5'
    || value === '5:4'
    || value === '9:21'
    || value === '21:9';
}

function getDefaultImageDefaultsForProvider(providerId: AiProviderId): ImageGenerationDefaults {
  return { ...DEFAULT_IMAGE_PROVIDER_DEFAULTS[normalizeAiProviderId(providerId)] };
}

function getImageDefaultModelsForProvider(providerId: AiProviderId): ImageDefaultModel[] {
  const providerModels = getProviderImageModels(providerId).filter(isImageDefaultModel);
  return providerModels.length > 0 ? providerModels : [...IMAGE_DEFAULT_MODEL_OPTIONS];
}

function getFallbackModelForProvider(providerId: AiProviderId, fallback: ImageGenerationDefaults): ImageDefaultModel {
  const providerModels = getImageDefaultModelsForProvider(providerId);
  return providerModels.includes(fallback.model) ? fallback.model : providerModels[0] || DEFAULT_IMAGE_PROVIDER_DEFAULTS.bltcy.model;
}

function resolveMagicApiDefaultImageSize(
  model: ImageDefaultModel,
  rawImageSize: unknown,
  aspectRatio: ImageGenerationDefaults['aspectRatio'],
  fallbackImageSize: string,
): string {
  if (isOpenAiGptImageModel(model)) {
    const options = getMagicApiGptImageSizeOptions(model);
    if (typeof rawImageSize === 'string' && options.includes(rawImageSize.trim() as (typeof options)[number])) {
      return rawImageSize.trim();
    }
    if (options.includes(fallbackImageSize as (typeof options)[number])) {
      return fallbackImageSize;
    }
    return options[0] || '1024x1024';
  }

  if (isGeminiNativeImageModel(model)) {
    const options = getMagicApiGeminiImageSizeOptions(model);
    if (isStandardImageSize(rawImageSize) && options.includes(rawImageSize)) {
      return rawImageSize;
    }
    if (isStandardImageSize(fallbackImageSize) && options.includes(fallbackImageSize)) {
      return fallbackImageSize;
    }
    return options[0] || '1K';
  }

  return resolveMagicApiOpenAiStyleImageSize(
    model,
    aspectRatio === 'auto' ? '16:9' : aspectRatio,
    rawImageSize,
  );
}

function resolveDefaultImageSize(
  providerId: AiProviderId,
  model: ImageDefaultModel,
  rawImageSize: unknown,
  aspectRatio: ImageGenerationDefaults['aspectRatio'],
  fallbackImageSize: string,
): string {
  if (isMagicApiProvider(providerId)) {
    return resolveMagicApiDefaultImageSize(model, rawImageSize, aspectRatio, fallbackImageSize);
  }

  if (isJieKouProvider(providerId)) {
    if (isJieKouGptImageModel(model)) {
      return resolveJieKouGptImageSize(rawImageSize, aspectRatio);
    }

    if (isStandardImageSize(rawImageSize)) {
      return rawImageSize;
    }

    return resolveJieKouStandardImageSize(fallbackImageSize);
  }

  if (isOpenAiGptImageModel(model)) {
    return resolveOpenAiGptImageSize(rawImageSize, aspectRatio);
  }

  return isStandardImageSize(rawImageSize)
    ? rawImageSize
    : isStandardImageSize(fallbackImageSize)
      ? fallbackImageSize
      : DEFAULT_IMAGE_PROVIDER_DEFAULTS.bltcy.imageSize;
}

function resolveDefaultAspectRatio(
  providerId: AiProviderId,
  model: ImageDefaultModel,
  imageSize: string,
  parsedAspectRatio: ImageGenerationDefaults['aspectRatio'],
  fallbackAspectRatio: ImageGenerationDefaults['aspectRatio'],
): ImageGenerationDefaults['aspectRatio'] {
  if (isMagicApiProvider(providerId)) {
    const allowedAspectRatios = isOpenAiGptImageModel(model)
      ? (MAGICAPI_GPT_IMAGE_ASPECT_RATIO_OPTIONS as readonly string[])
      : (MAGICAPI_IMAGE_ASPECT_RATIO_OPTIONS as readonly string[]);

    if (allowedAspectRatios.includes(parsedAspectRatio)) {
      return parsedAspectRatio;
    }
    return allowedAspectRatios.includes(fallbackAspectRatio)
      ? fallbackAspectRatio
      : '21:9';
  }

  if (isJieKouProvider(providerId)) {
    if (isJieKouImageAspectRatio(parsedAspectRatio)) {
      return parsedAspectRatio;
    }
    if (isJieKouImageAspectRatio(fallbackAspectRatio)) {
      return fallbackAspectRatio;
    }
    return '1:1';
  }

  if (isOpenAiGptImageModel(model)) {
    return resolveOpenAiGptImageAspectRatio(imageSize, parsedAspectRatio);
  }

  return parsedAspectRatio === '9:21' ? '9:16' : parsedAspectRatio;
}

function resolveDefaultQuality(providerId: AiProviderId, model: ImageDefaultModel, rawQuality: unknown): OpenAiGptImageQuality {
  if (isOpenAiGptImageModel(model)) {
    if (isJieKouProvider(providerId)) {
      return resolveJieKouGptImageQuality(rawQuality);
    }

    return isMagicApiProvider(providerId) ? 'high' : resolveOpenAiGptImageQuality(rawQuality);
  }

  return 'auto';
}

function sanitizeImageDefaults(
  value: unknown,
  options: { providerId?: AiProviderId; fallback?: ImageGenerationDefaults } = {},
): ImageGenerationDefaults {
  const providerId = normalizeAiProviderId(options.providerId || DEFAULT_AI_PROVIDER_ID);
  const fallback = options.fallback || getDefaultImageDefaultsForProvider(providerId);
  const parsed = isObject(value) ? value : {};
  const allowedModels = getImageDefaultModelsForProvider(providerId);
  const fallbackModel = getFallbackModelForProvider(providerId, fallback);
  const model = isImageDefaultModel(parsed.model) && allowedModels.includes(parsed.model)
    ? parsed.model
    : fallbackModel;
  const parsedAspectRatio = isImageDefaultAspectRatio(parsed.aspectRatio)
    ? parsed.aspectRatio
    : fallback.aspectRatio;
  const imageSize = resolveDefaultImageSize(providerId, model, parsed.imageSize, parsedAspectRatio, fallback.imageSize);
  const quality = resolveDefaultQuality(providerId, model, parsed.quality ?? fallback.quality);
  const aspectRatio = resolveDefaultAspectRatio(providerId, model, imageSize, parsedAspectRatio, fallback.aspectRatio);
  const generateCount = parsed.generateCount === 1 || parsed.generateCount === 2 || parsed.generateCount === 3 || parsed.generateCount === 4
    ? parsed.generateCount
    : fallback.generateCount;

  return {
    model,
    aspectRatio,
    imageSize,
    quality,
    generateCount,
  };
}

function sanitizeImageProviderDefaults(value: unknown, legacyImageDefaults: ImageGenerationDefaults): Record<AiProviderId, ImageGenerationDefaults> {
  const parsed = isObject(value) ? value : {};
  return AI_PROVIDER_OPTIONS.reduce((acc, provider) => {
    const providerId = provider.id;
    const fallback = providerId === DEFAULT_AI_PROVIDER_ID
      ? legacyImageDefaults
      : getDefaultImageDefaultsForProvider(providerId);
    acc[providerId] = parsed[providerId] === undefined
      ? fallback
      : sanitizeImageDefaults(parsed[providerId], { providerId, fallback });
    return acc;
  }, {} as Record<AiProviderId, ImageGenerationDefaults>);
}

function getDefaultVideoDefaultsForProvider(providerId: AiProviderId): VideoGenerationDefaults {
  return { ...DEFAULT_VIDEO_PROVIDER_DEFAULTS[normalizeAiProviderId(providerId)] };
}

function getVideoDefaultModelsForProvider(providerId: AiProviderId): VideoModel[] {
  const providerModels = getProviderVideoModels(providerId).filter(isVideoModel);
  return providerModels.length > 0 ? providerModels : [getDefaultVideoModelForProvider(providerId)];
}

function getFallbackVideoModelForProvider(providerId: AiProviderId, fallback: VideoGenerationDefaults): VideoModel {
  const providerModels = getVideoDefaultModelsForProvider(providerId);
  return providerModels.includes(fallback.model) ? fallback.model : providerModels[0] || DEFAULT_VIDEO_PROVIDER_DEFAULTS.bltcy.model;
}

function isVideoDefaultAspectRatio(value: unknown): value is VideoAspectRatio {
  return value === '16:9'
    || value === '9:16'
    || value === '1:1'
    || value === '4:3'
    || value === '3:4'
    || value === '3:2'
    || value === '2:3'
    || value === '21:9';
}

function sanitizeVideoDefaults(
  value: unknown,
  options: { providerId?: AiProviderId; fallback?: VideoGenerationDefaults } = {},
): VideoGenerationDefaults {
  const providerId = normalizeAiProviderId(options.providerId || DEFAULT_AI_PROVIDER_ID);
  const fallback = options.fallback || getDefaultVideoDefaultsForProvider(providerId);
  const parsed = isObject(value) ? value : {};
  const allowedModels = getVideoDefaultModelsForProvider(providerId);
  const fallbackModel = getFallbackVideoModelForProvider(providerId, fallback);
  const model = isVideoModel(parsed.model) && allowedModels.includes(parsed.model)
    ? parsed.model
    : fallbackModel;
  const aspectRatioOptions = getVideoAspectRatioOptions(model);
  const aspectRatio = isVideoDefaultAspectRatio(parsed.aspectRatio) && aspectRatioOptions.includes(parsed.aspectRatio)
    ? parsed.aspectRatio
    : aspectRatioOptions.includes(fallback.aspectRatio)
      ? fallback.aspectRatio
      : aspectRatioOptions[0] || '16:9';
  const durationOptions = getVideoDurationOptions(model);
  const duration = typeof parsed.duration === 'string' && (VIDEO_DURATION_OPTIONS as readonly string[]).includes(parsed.duration)
    && durationOptions.includes(parsed.duration as VideoDuration)
    ? parsed.duration as VideoDuration
    : durationOptions.includes(fallback.duration)
      ? fallback.duration
      : durationOptions[0] || '5s';

  return {
    model,
    aspectRatio,
    duration,
    enhancePrompt:
      typeof parsed.enhancePrompt === 'boolean'
        ? parsed.enhancePrompt
        : fallback.enhancePrompt,
  };
}

function sanitizeVideoProviderDefaults(value: unknown, legacyVideoDefaults: VideoGenerationDefaults): Record<AiProviderId, VideoGenerationDefaults> {
  const parsed = isObject(value) ? value : {};
  return AI_PROVIDER_OPTIONS.reduce((acc, provider) => {
    const providerId = provider.id;
    const fallback = providerId === DEFAULT_AI_PROVIDER_ID
      ? legacyVideoDefaults
      : getDefaultVideoDefaultsForProvider(providerId);
    acc[providerId] = parsed[providerId] === undefined
      ? fallback
      : sanitizeVideoDefaults(parsed[providerId], { providerId, fallback });
    return acc;
  }, {} as Record<AiProviderId, VideoGenerationDefaults>);
}

export function normalizeWorkbenchSettings(value: unknown): WorkbenchSettings {
  const parsed = isObject(value) ? value : {};
  const imageDefaults = sanitizeImageDefaults(parsed.imageDefaults, { providerId: DEFAULT_AI_PROVIDER_ID });
  const imageProviderDefaults = sanitizeImageProviderDefaults(parsed.imageProviderDefaults, imageDefaults);
  const videoDefaults = sanitizeVideoDefaults(parsed.videoDefaults, { providerId: DEFAULT_AI_PROVIDER_ID });
  const videoProviderDefaults = sanitizeVideoProviderDefaults(parsed.videoProviderDefaults, videoDefaults);

  return {
    autoSaveGenerated:
      typeof parsed.autoSaveGenerated === 'boolean'
        ? parsed.autoSaveGenerated
        : DEFAULT_WORKBENCH_SETTINGS.autoSaveGenerated,
    warnOnHighStorage:
      typeof parsed.warnOnHighStorage === 'boolean'
        ? parsed.warnOnHighStorage
        : DEFAULT_WORKBENCH_SETTINGS.warnOnHighStorage,
    canvasTheme:
      parsed.canvasTheme === 'light' || parsed.canvasTheme === 'dark'
        ? parsed.canvasTheme
        : DEFAULT_WORKBENCH_SETTINGS.canvasTheme,
    defaultImageFit:
      parsed.defaultImageFit === 'cover' || parsed.defaultImageFit === 'contain'
        ? parsed.defaultImageFit
        : DEFAULT_WORKBENCH_SETTINGS.defaultImageFit,
    defaultImageSurface:
      parsed.defaultImageSurface === 'checker' || parsed.defaultImageSurface === 'light' || parsed.defaultImageSurface === 'dark'
        ? parsed.defaultImageSurface
        : DEFAULT_WORKBENCH_SETTINGS.defaultImageSurface,
    imageDefaults: imageProviderDefaults[DEFAULT_AI_PROVIDER_ID],
    imageProviderDefaults,
    videoDefaults: videoProviderDefaults[DEFAULT_AI_PROVIDER_ID],
    videoProviderDefaults,
  };
}

export function getImageDefaultsForProvider(settings: WorkbenchSettings, providerId: unknown): ImageGenerationDefaults {
  const normalizedProviderId = normalizeAiProviderId(providerId);
  return settings.imageProviderDefaults?.[normalizedProviderId]
    || getDefaultImageDefaultsForProvider(normalizedProviderId);
}

export function setImageDefaultsForProvider(
  settings: WorkbenchSettings,
  providerId: unknown,
  imageDefaults: ImageGenerationDefaults,
): WorkbenchSettings {
  const normalizedProviderId = normalizeAiProviderId(providerId);
  const currentProviderDefaults = getImageDefaultsForProvider(settings, normalizedProviderId);
  const nextProviderDefaults = sanitizeImageDefaults(imageDefaults, {
    providerId: normalizedProviderId,
    fallback: currentProviderDefaults,
  });
  const imageProviderDefaults = {
    ...settings.imageProviderDefaults,
    [normalizedProviderId]: nextProviderDefaults,
  };

  return {
    ...settings,
    imageDefaults: imageProviderDefaults[DEFAULT_AI_PROVIDER_ID],
    imageProviderDefaults,
  };
}

export function getVideoDefaultsForProvider(settings: WorkbenchSettings, providerId: unknown): VideoGenerationDefaults {
  const normalizedProviderId = normalizeAiProviderId(providerId);
  return settings.videoProviderDefaults?.[normalizedProviderId]
    || getDefaultVideoDefaultsForProvider(normalizedProviderId);
}

export function setVideoDefaultsForProvider(
  settings: WorkbenchSettings,
  providerId: unknown,
  videoDefaults: VideoGenerationDefaults,
): WorkbenchSettings {
  const normalizedProviderId = normalizeAiProviderId(providerId);
  const currentProviderDefaults = getVideoDefaultsForProvider(settings, normalizedProviderId);
  const nextProviderDefaults = sanitizeVideoDefaults(videoDefaults, {
    providerId: normalizedProviderId,
    fallback: currentProviderDefaults,
  });
  const videoProviderDefaults = {
    ...settings.videoProviderDefaults,
    [normalizedProviderId]: nextProviderDefaults,
  };

  return {
    ...settings,
    videoDefaults: videoProviderDefaults[DEFAULT_AI_PROVIDER_ID],
    videoProviderDefaults,
  };
}

export function getWorkbenchSettings(): WorkbenchSettings {
  if (typeof window === 'undefined') return DEFAULT_WORKBENCH_SETTINGS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WORKBENCH_SETTINGS;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeWorkbenchSettings(parsed);
  } catch {
    return DEFAULT_WORKBENCH_SETTINGS;
  }
}

export function saveWorkbenchSettings(settings: WorkbenchSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeWorkbenchSettings(settings)));
  window.dispatchEvent(new CustomEvent(WORKBENCH_SETTINGS_CHANGED_EVENT));
}

export function subscribeWorkbenchSettingsChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = () => listener();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener(WORKBENCH_SETTINGS_CHANGED_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(WORKBENCH_SETTINGS_CHANGED_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorage);
  };
}

async function setKV<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getKV<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setAutoSaveDirectoryHandle(
  handle: FileSystemDirectoryHandle | null,
): Promise<void> {
  if (handle) {
    await setKV(DIRECTORY_HANDLE_KEY, handle);
    return;
  }

  const db = await openDB();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(DIRECTORY_HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

export function hasDirectoryPickerSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function getAutoSaveDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return getKV<FileSystemDirectoryHandle>(DIRECTORY_HANDLE_KEY);
}

export async function requestAutoSaveDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === 'undefined') return null;
  const win = window as Window & {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  };

  if (typeof win.showDirectoryPicker !== 'function') return null;
  const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
  await setAutoSaveDirectoryHandle(handle);
  return handle;
}

export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    const permissionHandle = handle as DirectoryHandleWithPermission;
    const readwrite = { mode: 'readwrite' as const };
    if (typeof permissionHandle.queryPermission === 'function') {
      if ((await permissionHandle.queryPermission(readwrite)) === 'granted') return true;
    }
    if (typeof permissionHandle.requestPermission === 'function') {
      return (await permissionHandle.requestPermission(readwrite)) === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

export async function saveBlobToAutoSaveDirectory(
  blob: Blob,
  filename: string,
): Promise<boolean> {
  const handle = await getAutoSaveDirectoryHandle();
  if (!handle) return false;
  const granted = await ensureDirectoryPermission(handle);
  if (!granted) return false;

  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

export async function getStorageEstimateInfo(): Promise<StorageEstimateInfo | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;

  try {
    const estimate = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted
      ? await navigator.storage.persisted()
      : false;

    return {
      usageBytes: estimate.usage ?? 0,
      quotaBytes: estimate.quota ?? 0,
      usageRatio:
        estimate.quota && estimate.quota > 0
          ? (estimate.usage ?? 0) / estimate.quota
          : 0,
      persisted,
    };
  } catch {
    return null;
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
