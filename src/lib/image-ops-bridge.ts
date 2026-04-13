'use client';

/**
 * Image Operations Bridge — 图片压缩、LOD、裁剪、标注的 Worker/主线程双模式实现
 *
 * 每个操作优先通过 Worker 执行，Worker 不可用时 fallback 到主线程。
 */

import { decodeDataUrlArrayBuffer } from './data-url';
import { MAX_CROP_SOURCE_PIXELS } from './image-processing-constants';
import { clamp } from './number-utils';
import {
  _workerSupported,
  isWorkerForcedOff,
  isWorkerCancelledError,
  postToWorker,
  setLastWorkerMode,
  setLastWorkerError,
} from './worker-transport';

// ── 类型定义 ──────────────────────────────────────────

export interface CompressImageResult {
  buffer: ArrayBuffer;
  mime: string;
  width: number;
  height: number;
}

export interface LODResult {
  imageId: string;
  results: Array<{
    level: number;
    buffer: ArrayBuffer;
    mime: string;
  }>;
}

interface CropRectInput {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropWorkerOptions {
  aspectRatio?: 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
  zoom?: number;
  focusX?: number;
  focusY?: number;
  cropRect?: CropRectInput;
}

interface CropWorkerResult {
  buffer: ArrayBuffer;
  mime: string;
  width: number;
  height: number;
}

interface AnnotateWorkerOptions {
  label: string;
  note?: string;
  markerNumber?: number;
  position: 'top' | 'bottom';
  accentColor: string;
  namePrefix?: string;
}

// ── 主线程 fallback 辅助 ──────────────────────────────

async function decodeImageSource(blob: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement decoding below.
    }
  }

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}

function getAspectRatioValue(
  preset: CropWorkerOptions['aspectRatio'],
  fallback: number,
) {
  switch (preset) {
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    case '3:4':
      return 3 / 4;
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case 'free':
    default:
      return fallback;
  }
}

function sanitizeCropRect(rect: CropRectInput | undefined): CropRectInput | null {
  if (!rect) return null;
  const x = clamp(rect.x, 0, 1);
  const y = clamp(rect.y, 0, 1);
  const width = clamp(rect.width, 0.0001, 1);
  const height = clamp(rect.height, 0.0001, 1);
  const maxWidth = Math.max(0.0001, 1 - x);
  const maxHeight = Math.max(0.0001, 1 - y);

  return {
    x,
    y,
    width: Math.min(width, maxWidth),
    height: Math.min(height, maxHeight),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(type === 'image/png' ? '导出结果失败' : '导出图片失败'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function canvasToBlobWithFallback(
  canvas: HTMLCanvasElement,
  preferredType: string,
  quality: number,
  fallbackType = 'image/jpeg',
): Promise<Blob> {
  try {
    const preferredBlob = await canvasToBlob(canvas, preferredType, quality);
    if (preferredBlob.size > 0) {
      return preferredBlob;
    }
  } catch {
    // Fall through to the fallback encoder.
  }

  if (preferredType === fallbackType) {
    return canvasToBlob(canvas, fallbackType, quality);
  }

  return canvasToBlob(canvas, fallbackType, quality);
}

// ── Fallback 实现 ─────────────────────────────────────

async function fallbackCompressImage(
  buffer: ArrayBuffer,
  mime: string,
  maxResolution: number,
  quality: number,
): Promise<CompressImageResult> {
  const blob = new Blob([buffer], { type: mime });
  const decoded = await decodeImageSource(blob);
  const natW = decoded.width;
  const natH = decoded.height;

  let sw = natW;
  let sh = natH;
  if (sw > maxResolution || sh > maxResolution) {
    if (sw >= sh) {
      sh = Math.round(sh * (maxResolution / sw));
      sw = maxResolution;
    } else {
      sw = Math.round(sw * (maxResolution / sh));
      sh = maxResolution;
    }
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(sw, sh);
    const ctx = oc.getContext('2d')!;
    ctx.drawImage(decoded.source, 0, 0, sw, sh);
    decoded.release();
    const resultBlob = await oc.convertToBlob({ type: 'image/jpeg', quality });
    const resultBuffer = await resultBlob.arrayBuffer();
    return { buffer: resultBuffer, mime: 'image/jpeg', width: sw, height: sh };
  }

  // Canvas fallback
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(decoded.source, 0, 0, sw, sh);
  decoded.release();
  const resultBlob = await new Promise<Blob>((res) =>
    canvas.toBlob(b => res(b!), 'image/jpeg', quality),
  );
  const resultBuffer = await resultBlob.arrayBuffer();
  return { buffer: resultBuffer, mime: 'image/jpeg', width: sw, height: sh };
}

async function fallbackGenerateLOD(
  buffer: ArrayBuffer,
  mime: string,
  imageId: string,
  levels: number[],
  qualities?: Record<number, number>,
): Promise<LODResult> {
  const isTextDenseSource = mime.startsWith('image/png') || mime.includes('image/svg');
  const blob = new Blob([buffer], { type: mime });
  const decoded = await decodeImageSource(blob);
  const natW = decoded.width;
  const natH = decoded.height;
  const results: LODResult['results'] = [];

  for (const maxPx of levels) {
    if (natW <= maxPx && natH <= maxPx) continue;
    let sw: number;
    let sh: number;
    if (natW >= natH) {
      sw = maxPx;
      sh = Math.round(natH * (maxPx / natW));
    } else {
      sh = maxPx;
      sw = Math.round(natW * (maxPx / natH));
    }

    const baseQuality = qualities?.[maxPx] ?? 0.7;
    const quality = isTextDenseSource
      ? maxPx <= 64
        ? Math.max(baseQuality, 0.72)
        : maxPx <= 256
          ? Math.max(baseQuality, 0.84)
          : baseQuality
      : baseQuality;
    const preferredType = mime.startsWith('image/png') ? 'image/webp' : 'image/jpeg';
    let thumbBlob: Blob;
    if (typeof OffscreenCanvas !== 'undefined') {
      const oc = new OffscreenCanvas(sw, sh);
      const ctx = oc.getContext('2d')!;
      ctx.drawImage(decoded.source, 0, 0, sw, sh);
      try {
        thumbBlob = await oc.convertToBlob({ type: preferredType, quality });
        if (thumbBlob.size === 0) {
          thumbBlob = await oc.convertToBlob({ type: 'image/jpeg', quality });
        }
      } catch {
        thumbBlob = await oc.convertToBlob({ type: 'image/jpeg', quality });
      }
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(decoded.source, 0, 0, sw, sh);
      thumbBlob = await canvasToBlobWithFallback(canvas, preferredType, quality);
    }
    results.push({
      level: maxPx,
      buffer: await thumbBlob.arrayBuffer(),
      mime: thumbBlob.type || 'image/jpeg',
    });
  }

  decoded.release();
  return { imageId, results };
}

async function fallbackCropImage(
  blob: Blob,
  input: CropWorkerOptions,
): Promise<Blob> {
  const decoded = await decodeImageSource(blob);

  try {
    if (decoded.width * decoded.height > MAX_CROP_SOURCE_PIXELS) {
      throw new Error('原图尺寸过大，请先缩小或切分后再裁剪');
    }

    const normalizedRect = sanitizeCropRect(input.cropRect);
    const fallbackRatio = decoded.width / Math.max(1, decoded.height);
    const aspectRatio = getAspectRatioValue(input.aspectRatio ?? 'free', fallbackRatio);
    let sourceX = 0;
    let sourceY = 0;
    let cropWidth = decoded.width;
    let cropHeight = decoded.height;

    if (normalizedRect) {
      sourceX = Math.round(clamp(normalizedRect.x * decoded.width, 0, decoded.width - 1));
      sourceY = Math.round(clamp(normalizedRect.y * decoded.height, 0, decoded.height - 1));
      cropWidth = Math.round(clamp(normalizedRect.width * decoded.width, 1, decoded.width - sourceX));
      cropHeight = Math.round(clamp(normalizedRect.height * decoded.height, 1, decoded.height - sourceY));
    } else {
      const zoom = clamp(input.zoom ?? 100, 10, 100);
      const focusX = clamp(input.focusX ?? 0, -100, 100);
      const focusY = clamp(input.focusY ?? 0, -100, 100);
      const scale = zoom / 100;
      cropWidth = Math.round(decoded.width * scale);
      cropHeight = Math.round(cropWidth / aspectRatio);

      if (cropHeight > decoded.height * scale) {
        cropHeight = Math.round(decoded.height * scale);
        cropWidth = Math.round(cropHeight * aspectRatio);
      }

      cropWidth = Math.min(decoded.width, Math.max(1, cropWidth));
      cropHeight = Math.min(decoded.height, Math.max(1, cropHeight));

      const remainingX = Math.max(0, decoded.width - cropWidth);
      const remainingY = Math.max(0, decoded.height - cropHeight);
      const offsetX = ((focusX + 100) / 200) * remainingX;
      const offsetY = ((focusY + 100) / 200) * remainingY;
      sourceX = Math.round(clamp(offsetX, 0, remainingX));
      sourceY = Math.round(clamp(offsetY, 0, remainingY));
    }

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建裁剪画布上下文');
    }

    context.drawImage(decoded.source, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return await canvasToBlob(canvas, 'image/png', 0.92);
  } finally {
    decoded.release();
  }
}

async function fallbackAnnotateImage(
  blob: Blob,
  options: AnnotateWorkerOptions,
): Promise<Blob> {
  const { annotateImageBlobOnMainThread } = await import('./image-annotate');
  return annotateImageBlobOnMainThread(blob, options);
}

// ── Public API ────────────────────────────────────────

/**
 * 图片压缩 — 缩放到 maxResolution 以内并编码为 JPEG
 */
export async function compressImage(
  input: string | { buffer: ArrayBuffer; mime: string },
  maxResolution: number = 2048,
  quality: number = 0.85,
): Promise<CompressImageResult> {
  let buffer: ArrayBuffer;
  let mime: string;

  if (typeof input === 'string') {
    const parsed = decodeDataUrlArrayBuffer(input);
    buffer = parsed.buffer;
    mime = parsed.mime;
  } else {
    buffer = input.buffer;
    mime = input.mime;
  }

  if (_workerSupported && typeof window !== 'undefined') {
    try {
      const bufferCopy = buffer.slice(0);
      const result = await postToWorker<CompressImageResult>(
        {
          type: 'compress-image',
          buffer: bufferCopy,
          mime,
          maxResolution,
          quality,
        },
        [bufferCopy],
      );
      return result;
    } catch {
      // fall through to main thread
    }
  }

  return fallbackCompressImage(buffer, mime, maxResolution, quality);
}

/**
 * LOD 多级缩略图生成
 */
export async function generateLOD(
  imageId: string,
  input: string | { buffer: ArrayBuffer; mime: string },
  levels: number[] = [64, 256, 1024, 2048],
  qualities?: Record<number, number>,
): Promise<LODResult> {
  let buffer: ArrayBuffer;
  let mime: string;

  if (typeof input === 'string') {
    const parsed = decodeDataUrlArrayBuffer(input);
    buffer = parsed.buffer;
    mime = parsed.mime;
  } else {
    buffer = input.buffer;
    mime = input.mime;
  }

  if (_workerSupported && typeof window !== 'undefined') {
    try {
      const bufferCopy = buffer.slice(0);
      const result = await postToWorker<LODResult>(
        {
          type: 'generate-lod',
          imageId,
          buffer: bufferCopy,
          mime,
          levels,
          qualities,
        },
        [bufferCopy],
      );
      return result;
    } catch {
      // fall through
    }
  }

  return fallbackGenerateLOD(buffer, mime, imageId, levels, qualities);
}

/**
 * 裁剪图片
 */
export async function workerCropImage(
  blob: Blob,
  options: CropWorkerOptions,
): Promise<Blob> {
  if (_workerSupported && !isWorkerForcedOff() && typeof window !== 'undefined') {
    try {
      const buffer = await blob.arrayBuffer();
      const transferBuffer = buffer.slice(0);
      const result = await postToWorker<CropWorkerResult>(
        {
          type: 'crop-image',
          buffer: transferBuffer,
          mime: blob.type || 'image/png',
          aspectRatio: options.aspectRatio ?? 'free',
          zoom: options.zoom ?? 100,
          focusX: options.focusX ?? 0,
          focusY: options.focusY ?? 0,
          cropRect: options.cropRect,
        },
        [transferBuffer],
      );
      setLastWorkerMode('crop', 'worker');
      return new Blob([result.buffer], { type: result.mime || 'image/png' });
    } catch (error) {
      if (isWorkerCancelledError(error)) {
        throw error;
      }
      setLastWorkerError('crop', error);
      // fall through
    }
  }

  const fallbackBlob = await fallbackCropImage(blob, options);
  setLastWorkerMode('crop', 'fallback');
  return fallbackBlob;
}

/**
 * 标注图片
 */
export async function workerAnnotateImage(
  blob: Blob,
  options: AnnotateWorkerOptions,
): Promise<Blob> {
  if (_workerSupported && !isWorkerForcedOff() && typeof window !== 'undefined') {
    try {
      const buffer = await blob.arrayBuffer();
      const transferBuffer = buffer.slice(0);
      const result = await postToWorker<{ buffer: ArrayBuffer; mime: string }>(
        {
          type: 'annotate-image',
          buffer: transferBuffer,
          mime: blob.type || 'image/png',
          options,
        },
        [transferBuffer],
      );
      setLastWorkerMode('annotate', 'worker');
      return new Blob([result.buffer], { type: result.mime || 'image/png' });
    } catch (error) {
      if (isWorkerCancelledError(error)) {
        throw error;
      }
      setLastWorkerError('annotate', error);
    }
  }

  const fallbackBlob = await fallbackAnnotateImage(blob, options);
  setLastWorkerMode('annotate', 'fallback');
  return fallbackBlob;
}
