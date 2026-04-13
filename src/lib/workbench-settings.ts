'use client';

export interface WorkbenchSettings {
  autoSaveGenerated: boolean;
  warnOnHighStorage: boolean;
  defaultImageFit: 'contain' | 'cover';
  defaultImageSurface: 'checker' | 'light' | 'dark';
  imageDefaults: ImageGenerationDefaults;
  videoDefaults: VideoGenerationDefaults;
}

export const VIDEO_DURATION_OPTIONS = ['4s', '5s', '6s', '7s', '8s', '9s', '10s', '11s', '12s', '13s', '14s', '15s'] as const;
export type VideoDuration = typeof VIDEO_DURATION_OPTIONS[number];

export interface ImageGenerationDefaults {
  model: 'gemini-3.1-flash-image-preview' | 'nano-banana-2' | 'grok-4.2-image' | 'doubao-seedream-5-0-260128';
  aspectRatio: 'auto' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2' | '4:5' | '5:4' | '21:9';
  imageSize: '1K' | '2K' | '4K';
  generateCount: 1 | 2 | 3 | 4;
}

export interface VideoGenerationDefaults {
  model: 'veo3.1' | 'veo3.1-fast' | 'veo3.1-components' | 'doubao-seedance-2-0-260128';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  duration: VideoDuration;
  enhancePrompt: boolean;
}

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
  defaultImageFit: 'contain',
  defaultImageSurface: 'checker',
  imageDefaults: {
    model: 'gemini-3.1-flash-image-preview',
    aspectRatio: '21:9',
    imageSize: '4K',
    generateCount: 1,
  },
  videoDefaults: {
    model: 'veo3.1',
    aspectRatio: '16:9',
    duration: '5s',
    enhancePrompt: true,
  },
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

function sanitizeImageDefaults(value: unknown): ImageGenerationDefaults {
  const parsed = isObject(value) ? value : {};
  const model = parsed.model === 'nano-banana-2' || parsed.model === 'grok-4.2-image' || parsed.model === 'doubao-seedream-5-0-260128'
    ? parsed.model
    : DEFAULT_WORKBENCH_SETTINGS.imageDefaults.model;
  const aspectRatio = parsed.aspectRatio === 'auto'
    || parsed.aspectRatio === '1:1'
    || parsed.aspectRatio === '4:3'
    || parsed.aspectRatio === '3:4'
    || parsed.aspectRatio === '16:9'
    || parsed.aspectRatio === '9:16'
    || parsed.aspectRatio === '2:3'
    || parsed.aspectRatio === '3:2'
    || parsed.aspectRatio === '4:5'
    || parsed.aspectRatio === '5:4'
    || parsed.aspectRatio === '21:9'
    ? parsed.aspectRatio
    : DEFAULT_WORKBENCH_SETTINGS.imageDefaults.aspectRatio;
  const imageSize = parsed.imageSize === '1K' || parsed.imageSize === '2K' || parsed.imageSize === '4K'
    ? parsed.imageSize
    : DEFAULT_WORKBENCH_SETTINGS.imageDefaults.imageSize;
  const generateCount = parsed.generateCount === 1 || parsed.generateCount === 2 || parsed.generateCount === 3 || parsed.generateCount === 4
    ? parsed.generateCount
    : DEFAULT_WORKBENCH_SETTINGS.imageDefaults.generateCount;

  return {
    model,
    aspectRatio,
    imageSize,
    generateCount,
  };
}

function sanitizeVideoDefaults(value: unknown): VideoGenerationDefaults {
  const parsed = isObject(value) ? value : {};
  const model = parsed.model === 'veo3.1'
    || parsed.model === 'veo3.1-fast'
    || parsed.model === 'veo3.1-components'
    || parsed.model === 'doubao-seedance-2-0-260128'
    ? parsed.model
    : DEFAULT_WORKBENCH_SETTINGS.videoDefaults.model;
  const aspectRatio = parsed.aspectRatio === '16:9'
    || parsed.aspectRatio === '9:16'
    || parsed.aspectRatio === '1:1'
    || parsed.aspectRatio === '4:3'
    || parsed.aspectRatio === '3:4'
    ? parsed.aspectRatio
    : DEFAULT_WORKBENCH_SETTINGS.videoDefaults.aspectRatio;
  const duration = typeof parsed.duration === 'string' && (VIDEO_DURATION_OPTIONS as readonly string[]).includes(parsed.duration)
    ? parsed.duration as VideoDuration
    : DEFAULT_WORKBENCH_SETTINGS.videoDefaults.duration;

  return {
    model,
    aspectRatio,
    duration,
    enhancePrompt:
      typeof parsed.enhancePrompt === 'boolean'
        ? parsed.enhancePrompt
        : DEFAULT_WORKBENCH_SETTINGS.videoDefaults.enhancePrompt,
  };
}

export function normalizeWorkbenchSettings(value: unknown): WorkbenchSettings {
  const parsed = isObject(value) ? value : {};

  return {
    autoSaveGenerated:
      typeof parsed.autoSaveGenerated === 'boolean'
        ? parsed.autoSaveGenerated
        : DEFAULT_WORKBENCH_SETTINGS.autoSaveGenerated,
    warnOnHighStorage:
      typeof parsed.warnOnHighStorage === 'boolean'
        ? parsed.warnOnHighStorage
        : DEFAULT_WORKBENCH_SETTINGS.warnOnHighStorage,
    defaultImageFit:
      parsed.defaultImageFit === 'cover' || parsed.defaultImageFit === 'contain'
        ? parsed.defaultImageFit
        : DEFAULT_WORKBENCH_SETTINGS.defaultImageFit,
    defaultImageSurface:
      parsed.defaultImageSurface === 'checker' || parsed.defaultImageSurface === 'light' || parsed.defaultImageSurface === 'dark'
        ? parsed.defaultImageSurface
        : DEFAULT_WORKBENCH_SETTINGS.defaultImageSurface,
    imageDefaults: sanitizeImageDefaults(parsed.imageDefaults),
    videoDefaults: sanitizeVideoDefaults(parsed.videoDefaults),
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
