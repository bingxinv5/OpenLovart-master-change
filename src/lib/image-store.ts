'use client';

import { v4 as uuidv4 } from 'uuid';

/**
 * ImageStore — 独立的图片 Blob 存储系统
 *
 * 核心优化：将大型图片数据从 CanvasElement.content 中分离出来
 * - element.content 只存引用 ID（~40 字节），如 "imgref://abc123"
 * - 实际图片以 Blob 形式独立存储在 IndexedDB 中（每张图一条记录）
 * - 渲染时按需创建 Blob URL，使用 LRU 缓存管理内存
 * - LOD 缩略图生成和图片压缩委托给 Web Worker 线程，不阻塞主线程
 *
 * 内存对比：
 *   旧：10,000 张 4K 图 × ~2 MB base64 = 20 GB（JS 堆爆炸）
 *   新：10,000 个 ref 字符串 × ~40 B = 400 KB + 可见图 Blob URL ≈ 50–200 MB
 */

import {
  generateLOD as workerGenerateLOD,
  workerDataUrlToBlob,
} from './image-worker-bridge';
import { decodeDataUrlBytes } from './data-url';

const DB_NAME = 'lovart_images';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

/** 引用前缀 */
export const IMAGE_REF_PREFIX = 'imgref://';

// ── 判断 / 转换工具 ──────────────────────────────────────────

/** 判断是否为图片引用 */
export function isImageRef(content: string | undefined | null): boolean {
  return !!content && content.startsWith(IMAGE_REF_PREFIX);
}

/** 提取引用 ID */
export function getRefId(ref: string): string {
  return ref.slice(IMAGE_REF_PREFIX.length);
}

/** 生成引用字符串 */
export function makeRef(id: string): string {
  return IMAGE_REF_PREFIX + id;
}

/** 判断是否为 data URL（base64） */
function isDataUrl(s: string): boolean {
  return s.startsWith('data:');
}

/** 判断是否为外部 URL（http / https / blob） */
function isExternalUrl(s: string): boolean {
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('blob:')
  );
}

// ── IndexedDB Connection ──────────────────────────────────

let dbInstance: IDBDatabase | null = null;
let dbReady: Promise<IDBDatabase> | null = null;

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

// ── Blob URL Cache (LRU with memory limit) ────────────────

const _blobUrlCache = new Map<string, string>();
const _blobSizeCache = new Map<string, number>();
const _lruOrder: string[] = [];
let _currentCacheBytes = 0;

/** 最大 Blob URL 缓存 ~500 MB */
const MAX_CACHE_BYTES = 500 * 1024 * 1024;

function touchLRU(id: string): void {
  const idx = _lruOrder.indexOf(id);
  if (idx !== -1) _lruOrder.splice(idx, 1);
  _lruOrder.push(id);
}

function demoteLRU(id: string): void {
  const idx = _lruOrder.indexOf(id);
  if (idx === -1) return;
  _lruOrder.splice(idx, 1);
  _lruOrder.unshift(id);
}

function evictLRU(): void {
  while (_currentCacheBytes > MAX_CACHE_BYTES && _lruOrder.length > 0) {
    const evictId = _lruOrder.shift()!;
    const url = _blobUrlCache.get(evictId);
    if (url) URL.revokeObjectURL(url);
    _blobUrlCache.delete(evictId);
    const size = _blobSizeCache.get(evictId) || 0;
    _currentCacheBytes -= size;
    _blobSizeCache.delete(evictId);
  }
}

// ── Data Conversion ───────────────────────────────────────

/** data URL → Blob */
function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const { bytes, mime } = decodeDataUrlBytes(dataUrl);
    const normalizedBytes = new Uint8Array(bytes.byteLength);
    normalizedBytes.set(bytes);
    return new Blob([normalizedBytes], { type: mime });
  } catch {
    return new Blob([dataUrl], { type: 'application/octet-stream' });
  }
}

/** Blob → data URL（仅用于降级兜底） */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function scheduleBackgroundTask(task: () => Promise<void>): void {
  if (typeof window === 'undefined') {
    void task().catch(() => {});
    return;
  }

  const run = () => {
    void task().catch(() => {});
  };

  const win = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(run, { timeout: 1500 });
    return;
  }

  window.setTimeout(run, 16);
}

async function putBlob(imageId: string, blob: Blob): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(blob, imageId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getBlobByKey(key: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as Blob | undefined) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

function releaseCachedUrl(cacheKey: string): void {
  const cached = _blobUrlCache.get(cacheKey);
  if (cached) {
    URL.revokeObjectURL(cached);
    _blobUrlCache.delete(cacheKey);
    _currentCacheBytes -= _blobSizeCache.get(cacheKey) || 0;
    _blobSizeCache.delete(cacheKey);
  }

  const idx = _lruOrder.indexOf(cacheKey);
  if (idx !== -1) _lruOrder.splice(idx, 1);
}

async function deleteBlobKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const key of keys) {
        store.delete(key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

// ── Public API ────────────────────────────────────────────

/**
 * 保存图片到 ImageStore
 * @param dataUrl — base64 data URL
 * @param id — 可选自定义 ID，默认自动生成
 * @returns 引用字符串 "imgref://..."
 */
export async function saveImage(dataUrl: string, id?: string): Promise<string> {
  if (typeof window === 'undefined') return dataUrl;
  const imageId = id || uuidv4();
  try {
    // 使用 Worker 将 data URL 转换为 Blob（CPU 密集的 atob 解码在后台线程执行）
    let blob: Blob;
    try {
      blob = await workerDataUrlToBlob(dataUrl);
    } catch {
      blob = dataUrlToBlob(dataUrl); // fallback
    }
    await putBlob(imageId, blob);

    // 异步在 Worker 线程生成 LOD 缩略图（不阻塞主线程渲染和交互）
    scheduleBackgroundTask(() => generateLODThumbsViaWorker(imageId, dataUrl));

    return makeRef(imageId);
  } catch (err) {
    console.warn('[ImageStore] save failed, falling back to inline data URL:', err);
    return dataUrl; // 降级：直接返回原始 data URL
  }
}

/**
 * 直接保存原始 Blob/File 到 ImageStore。
 * 用于本地导入时保留 4K 原图，同时异步生成多级 LOD 预览图。
 */
export async function saveImageBlob(blob: Blob, id?: string): Promise<string> {
  if (typeof window === 'undefined') return '';

  const imageId = id || uuidv4();
  try {
    await putBlob(imageId, blob);

    const mime = blob.type || 'image/png';
    scheduleBackgroundTask(async () => {
      const buffer = await blob.arrayBuffer();
      await generateLODThumbsViaWorker(imageId, { buffer, mime });
    });

    return makeRef(imageId);
  } catch (err) {
    console.warn('[ImageStore] blob save failed, falling back to inline data URL:', err);
    try {
      return await blobToDataUrl(blob);
    } catch {
      return '';
    }
  }
}

// ── LOD (Level-of-Detail) Multi-Resolution ────────────────

/** LOD 级别定义：缩略图最长边像素 */
const LOD_LEVELS = [64, 256, 512, 1024, 2048] as const;

/** 各 LOD 级别对应的 JPEG 质量（小缩略图用低质量节省存储，大图用高质量保清晰） */
const LOD_QUALITY: Record<number, number> = { 64: 0.6, 256: 0.75, 512: 0.78, 1024: 0.82, 2048: 0.86 };

/** LOD 缩略图键名后缀 */
function lodKey(imageId: string, maxPx: number): string {
  return `${imageId}__lod_${maxPx}`;
}

/**
 * 返回某个图片引用在当前场景下应尝试读取的键顺序。
 * - 有目标 LOD 时：优先精确 LOD，再尝试更大的 LOD，再尝试原图，最后退到更小的 LOD。
 * - 无目标 LOD 时：优先原图，再从大到小尝试已有 LOD。
 */
export function getImageLookupCandidateKeys(imageId: string, preferredLevel: number | null): string[] {
  if (preferredLevel === null) {
    return [
      imageId,
      ...[...LOD_LEVELS].slice().reverse().map((level) => lodKey(imageId, level)),
    ];
  }

  const higherOrEqualLevels = LOD_LEVELS.filter((level) => level >= preferredLevel);
  const lowerLevels = LOD_LEVELS.filter((level) => level < preferredLevel).slice().reverse();

  return [
    ...higherOrEqualLevels.map((level) => lodKey(imageId, level)),
    imageId,
    ...lowerLevels.map((level) => lodKey(imageId, level)),
  ];
}

/**
 * 通过 Web Worker 生成多级 LOD 缩略图并存储到 IndexedDB。
 * 图片解码、缩放、JPEG 编码全部在 Worker 线程中执行，不阻塞主线程。
 * Worker 不可用时自动 fallback 到主线程 OffscreenCanvas/Canvas。
 */
async function generateLODThumbsViaWorker(
  imageId: string,
  input: string | { buffer: ArrayBuffer; mime: string },
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // 在 Worker 线程中完成：createImageBitmap → OffscreenCanvas 缩放 → JPEG 编码
    const lodResult = await workerGenerateLOD(
      imageId,
      input,
      LOD_LEVELS as unknown as number[],
      LOD_QUALITY,
    );

    if (lodResult.results.length === 0) return;

    // 将 Worker 返回的 ArrayBuffer 缩略图写入 IndexedDB
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const { level, buffer, mime } of lodResult.results) {
      const blob = new Blob([buffer], { type: mime });
      store.put(blob, lodKey(imageId, level));
    }

    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[ImageStore] Worker LOD generation failed:', err);
  }
}

/**
 * 选择合适的 LOD 级别。
 * displayPixels 是元素在屏幕上的实际渲染像素（max(width, height) × scale）。
 * 返回 LOD 最长边，或 null 表示使用原图。
 */
function selectLODLevel(displayPixels: number): number | null {
  for (const level of LOD_LEVELS) {
    if (displayPixels <= level * 1.5) return level; // 1.5x 余量确保清晰
  }
  return null; // 需要原图
}

function getCacheKeyForDisplayPixels(content: string, displayPixels: number): string | null {
  if (!isImageRef(content)) return null;

  const id = getRefId(content);
  const lodLevel = selectLODLevel(displayPixels);
  return lodLevel === null ? id : lodKey(id, lodLevel);
}

function cacheBlobUrl(cacheKey: string, blob: Blob): string {
  const cached = _blobUrlCache.get(cacheKey);
  if (cached) {
    touchLRU(cacheKey);
    return cached;
  }

  const url = URL.createObjectURL(blob);
  _blobUrlCache.set(cacheKey, url);
  _blobSizeCache.set(cacheKey, blob.size);
  _currentCacheBytes += blob.size;
  _lruOrder.push(cacheKey);
  evictLRU();
  return url;
}

function scheduleBaseBlobRepair(imageId: string, resolvedKey: string, blob: Blob): void {
  if (resolvedKey === imageId) return;

  scheduleBackgroundTask(async () => {
    const existingBase = await getBlobByKey(imageId);
    if (existingBase) return;
    await putBlob(imageId, blob);
  });
}

async function resolveStoredBlob(
  imageId: string,
  preferredLevel: number | null,
): Promise<{ key: string; blob: Blob } | null> {
  const candidateKeys = getImageLookupCandidateKeys(imageId, preferredLevel);

  for (const key of candidateKeys) {
    const blob = await getBlobByKey(key);
    if (blob) {
      scheduleBaseBlobRepair(imageId, key, blob);
      return { key, blob };
    }
  }

  return null;
}

export function reprioritizeImageLodCache(
  content: string,
  preferredDisplayPixels: number,
  staleDisplayPixels: number,
): void {
  const preferredKey = getCacheKeyForDisplayPixels(content, preferredDisplayPixels);
  const staleKey = getCacheKeyForDisplayPixels(content, staleDisplayPixels);

  if (!preferredKey || !staleKey || preferredKey === staleKey) {
    return;
  }

  if (_blobUrlCache.has(preferredKey)) {
    touchLRU(preferredKey);
  }

  if (_blobUrlCache.has(staleKey)) {
    demoteLRU(staleKey);
  }
}

/**
 * 获取适合当前显示尺寸的图片 Blob URL。
 * 缩小时自动使用低分辨率缩略图，放大时使用高分辨率。
 * @param content — imgref:// 引用或直接 URL
 * @param displayPixels — 元素在屏幕上的实际像素宽度（elementWidth × scale）
 */
export async function getImageBlobUrlWithLOD(
  content: string,
  displayPixels: number,
): Promise<string | null> {
  if (!content) return null;
  if (!isImageRef(content)) return content; // backward compat

  const id = getRefId(content);
  const lodLevel = selectLODLevel(displayPixels);

  const preferredCacheKey = lodLevel === null ? id : lodKey(id, lodLevel);
  const preferredCached = _blobUrlCache.get(preferredCacheKey);
  if (preferredCached) {
    touchLRU(preferredCacheKey);
    return preferredCached;
  }

  const resolved = await resolveStoredBlob(id, lodLevel);
  if (!resolved) return null;

  return cacheBlobUrl(resolved.key, resolved.blob);
}

/**
 * 获取图片的 Blob URL（用于渲染 <img src>）。
 * 带 LRU 缓存，自动管理内存。
 * 对于非 imgref:// 字符串，原样返回（向后兼容）。
 */
export async function getImageBlobUrl(content: string): Promise<string | null> {
  if (!content) return null;
  if (!isImageRef(content)) return content; // backward compat

  const id = getRefId(content);

  // Check cache first
  const cached = _blobUrlCache.get(id);
  if (cached) {
    touchLRU(id);
    return cached;
  }

  const resolved = await resolveStoredBlob(id, null);
  if (!resolved) return null;

  return cacheBlobUrl(resolved.key === id ? id : resolved.key, resolved.blob);
}

/** 获取图片原始 Blob（用于本地落盘、导出等场景） */
export async function getImageBlob(content: string): Promise<Blob | null> {
  if (!content) return null;
  if (!isImageRef(content)) return null;

  const id = getRefId(content);
  const resolved = await resolveStoredBlob(id, null);
  return resolved?.blob || null;
}

/**
 * 获取图片的 data URL（用于导出、AI 操作等需要完整数据的场景）。
 * ⚠️ 会创建完整的 base64 字符串，仅在必要时使用。
 */
export async function getImageDataUrl(content: string): Promise<string | null> {
  if (!content) return null;
  if (!isImageRef(content)) return content; // backward compat

  const blob = await getImageBlob(content);
  if (!blob) return null;

  try {
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

/**
 * 删除图片
 */
export async function deleteImage(ref: string): Promise<void> {
  if (!isImageRef(ref)) return;
  const id = getRefId(ref);
  const keys = [id, ...LOD_LEVELS.map((level) => lodKey(id, level))];

  for (const key of keys) {
    releaseCachedUrl(key);
  }

  await deleteBlobKeys(keys);
}

/** 清理当前未被任何元素引用的图片及其 LOD 缩略图。 */
export async function cleanupUnusedImages(usedRefs: Iterable<string>): Promise<number> {
  if (typeof window === 'undefined') return 0;

  const usedIds = new Set<string>();
  for (const ref of usedRefs) {
    if (isImageRef(ref)) {
      usedIds.add(getRefId(ref));
    }
  }

  try {
    const db = await openDB();
    const orphanIds = await new Promise<string[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openKeyCursor();
      const keys: string[] = [];

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(keys);
          return;
        }

        const rawKey = String(cursor.primaryKey);
        if (!rawKey.includes('__lod_') && !usedIds.has(rawKey)) {
          keys.push(rawKey);
        }
        cursor.continue();
      };

      req.onerror = () => resolve([]);
    });

    if (orphanIds.length === 0) return 0;

    const keysToDelete = orphanIds.flatMap((id) => [id, ...LOD_LEVELS.map((level) => lodKey(id, level))]);
    for (const key of keysToDelete) {
      releaseCachedUrl(key);
    }
    await deleteBlobKeys(keysToDelete);
    return orphanIds.length;
  } catch {
    return 0;
  }
}

/**
 * 确保 content 是引用形式。
 * - 已经是 imgref:// → 直接返回
 * - data URL / base64 → 保存到 ImageStore 并返回引用
 * - http / https / blob URL → 直接返回（外部资源，不存储）
 * - 空或未知格式 → 原样返回
 */
export async function ensureImageRef(content: string | undefined): Promise<string> {
  if (!content) return content || '';
  if (isImageRef(content)) return content;
  if (isExternalUrl(content)) return content;
  if (isDataUrl(content)) {
    return await saveImage(content);
  }
  return content;
}

/**
 * 批量迁移：将元素数组中的 base64 content 迁移到 ImageStore。
 * 分批处理以避免内存峰值。
 * @returns 迁移后的元素数组（content 字段已替换为 ref）以及迁移数量
 */
export async function migrateElementsToImageStore<
  T extends { id?: string; type?: string; content?: string }
>(
  elements: T[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ elements: T[]; migratedCount: number }> {
  const BATCH_SIZE = 5; // 一次处理 5 张图片
  const result = [...elements];
  const imageElements = result
    .map((el, idx) => ({ el, idx }))
    .filter(
      ({ el }) =>
        el.type === 'image' && el.content && isDataUrl(el.content),
    );

  const total = imageElements.length;
  if (total === 0) return { elements: result, migratedCount: 0 };

  console.log(
    `[ImageStore] Migrating ${total} images from base64 to ImageStore...`,
  );

  for (let i = 0; i < imageElements.length; i += BATCH_SIZE) {
    const batch = imageElements.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ el, idx }) => {
        try {
          if (!el.content) return;
          const ref = await saveImage(el.content, el.id);
          result[idx] = { ...el, content: ref };
        } catch (err) {
          console.warn(`[ImageStore] Failed to migrate image ${el.id}:`, err);
        }
      }),
    );
    onProgress?.(Math.min(i + BATCH_SIZE, total), total);
  }

  console.log(`[ImageStore] Migration complete: ${total} images migrated`);
  return { elements: result, migratedCount: total };
}

// ── Typed kernel facade ───────────────────────────────────

import type { IImageStore } from './editor-kernel';

/**
 * Aggregate object satisfying IImageStore contract.
 * Use this when you need to pass ImageStore as a dependency
 * or when testing with stubs.
 */
export const imageStore: IImageStore = {
  isImageRef,
  getRefId,
  makeRef,
  saveImage,
  saveImageBlob,
  getImageBlobUrlWithLOD,
  getImageBlobUrl,
  getImageBlob,
  getImageDataUrl,
  deleteImage,
  cleanupUnusedImages,
  ensureImageRef,
  migrateElementsToImageStore,
  reprioritizeImageLodCache,
};

