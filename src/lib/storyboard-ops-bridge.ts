'use client';

/**
 * Storyboard Operations Bridge — 分镜切割与分镜导出的 Worker/主线程双模式实现
 */

import { MAX_SPLIT_SOURCE_PIXELS } from './image-processing-constants';
import { clampInt } from './number-utils';
import {
  _workerSupported,
  isWorkerForcedOff,
  isWorkerCancelledError,
  postToWorker,
  setLastWorkerMode,
  setLastWorkerError,
} from './worker-transport';

// ── 类型定义 ──────────────────────────────────────────

interface StoryboardSplitWorkerOptions {
  rows?: number;
  cols?: number;
  gap?: number;
  padding?: number;
}

interface StoryboardSplitWorkerFrameResult {
  row: number;
  col: number;
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  buffer: ArrayBuffer;
  mime: string;
}

interface StoryboardExportWorkerItemInput {
  blob: Blob;
  caption?: string;
  displayName?: string;
  storyboardShotCode?: string;
  storyboardSceneType?: string;
  storyboardCameraMove?: string;
  storyboardDuration?: string;
  storyboardNote?: string;
}

interface StoryboardExportWorkerOptions {
  columns: number;
  gap: number;
  padding: number;
  backgroundColor: string;
  textColor: string;
  showNumbers: boolean;
  captionMode: 'none' | 'display-name' | 'prompt' | 'annotation-title' | 'annotation-note' | 'annotation-full' | 'storyboard-meta';
  exportStyle?: 'classic' | 'cinema' | 'worksheet';
  suggestedFileName?: string;
  lockCurrentOrder?: boolean;
  showHeader?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
}

// ── 主线程 fallback ───────────────────────────────────

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

async function fallbackSplitStoryboard(
  blob: Blob,
  input: StoryboardSplitWorkerOptions,
): Promise<Array<StoryboardSplitWorkerFrameResult & { blob: Blob }>> {
  const rows = clampInt(input.rows ?? 2, 1, 12);
  const cols = clampInt(input.cols ?? 2, 1, 12);
  const gap = Math.max(0, Math.round(input.gap ?? 0));
  const padding = Math.max(0, Math.round(input.padding ?? 0));
  const decoded = await decodeImageSource(blob);

  try {
    if (decoded.width * decoded.height > MAX_SPLIT_SOURCE_PIXELS) {
      throw new Error('原图尺寸过大，请先裁剪或缩小后再执行分镜切割');
    }

    const availableWidth = decoded.width - (padding * 2) - (gap * (cols - 1));
    const availableHeight = decoded.height - (padding * 2) - (gap * (rows - 1));
    if (availableWidth <= 0 || availableHeight <= 0) {
      throw new Error('切割参数无效，导致可用区域为 0');
    }

    const baseCellWidth = availableWidth / cols;
    const baseCellHeight = availableHeight / rows;
    const frames: Array<StoryboardSplitWorkerFrameResult & { blob: Blob }> = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const sourceX = Math.round(padding + col * (baseCellWidth + gap));
        const sourceY = Math.round(padding + row * (baseCellHeight + gap));
        const width = col === cols - 1
          ? Math.max(1, decoded.width - padding - sourceX)
          : Math.max(1, Math.round(baseCellWidth));
        const height = row === rows - 1
          ? Math.max(1, decoded.height - padding - sourceY)
          : Math.max(1, Math.round(baseCellHeight));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('无法创建切割画布上下文');
        }

        context.drawImage(decoded.source, sourceX, sourceY, width, height, 0, 0, width, height);
        const frameBlob = await canvasToBlob(canvas, 'image/png', 0.92);

        frames.push({
          row,
          col,
          width,
          height,
          sourceX,
          sourceY,
          buffer: await frameBlob.arrayBuffer(),
          mime: frameBlob.type || 'image/png',
          blob: frameBlob,
        });
      }
    }

    return frames;
  } finally {
    decoded.release();
  }
}

// ── Public API ────────────────────────────────────────

export async function workerSplitStoryboard(
  blob: Blob,
  options: StoryboardSplitWorkerOptions,
): Promise<Array<StoryboardSplitWorkerFrameResult & { blob: Blob }>> {
  if (_workerSupported && !isWorkerForcedOff() && typeof window !== 'undefined') {
    try {
      const buffer = await blob.arrayBuffer();
      const transferBuffer = buffer.slice(0);
      const result = await postToWorker<{ results: StoryboardSplitWorkerFrameResult[] }>(
        {
          type: 'split-storyboard',
          buffer: transferBuffer,
          mime: blob.type || 'image/png',
          rows: options.rows ?? 2,
          cols: options.cols ?? 2,
          gap: options.gap ?? 0,
          padding: options.padding ?? 0,
        },
        [transferBuffer],
      );

      setLastWorkerMode('split', 'worker');
      return result.results.map((frame) => ({
        ...frame,
        blob: new Blob([frame.buffer], { type: frame.mime || 'image/png' }),
      }));
    } catch (error) {
      if (isWorkerCancelledError(error)) {
        throw error;
      }
      setLastWorkerError('split', error);
      // fall through
    }
  }

  const fallbackFrames = await fallbackSplitStoryboard(blob, options);
  setLastWorkerMode('split', 'fallback');
  return fallbackFrames;
}

export async function workerBuildStoryboardExport(
  items: StoryboardExportWorkerItemInput[],
  options: StoryboardExportWorkerOptions,
): Promise<Blob> {
  const buffers = await Promise.all(items.map((item) => item.blob.arrayBuffer()));
  const transfers = buffers.map((buffer) => buffer.slice(0));

  try {
    const result = await postToWorker<{ buffer: ArrayBuffer; mime: string }>(
      {
        type: 'build-storyboard-export',
        items: items.map((item, index) => ({
          buffer: transfers[index],
          mime: item.blob.type || 'image/png',
          caption: item.caption,
          displayName: item.displayName,
          storyboardShotCode: item.storyboardShotCode,
          storyboardSceneType: item.storyboardSceneType,
          storyboardCameraMove: item.storyboardCameraMove,
          storyboardDuration: item.storyboardDuration,
          storyboardNote: item.storyboardNote,
        })),
        options: {
          ...options,
          exportStyle: options.exportStyle ?? 'classic',
        },
      },
      transfers,
    );
    setLastWorkerMode('export', 'worker');
    return new Blob([result.buffer], { type: result.mime || 'image/png' });
  } catch (error) {
    if (isWorkerCancelledError(error)) {
      throw error;
    }
    setLastWorkerError('export', error);
    throw error;
  }
}
