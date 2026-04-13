import { isWorkerCancelledError, workerSplitStoryboard } from './image-worker-bridge';
import { canvasToBlob } from './canvas-utils';
import { MAX_SPLIT_SOURCE_PIXELS } from './image-processing-constants';
import { decodeCanvasImageFromBlob } from './image-render';
import { clampInt } from './number-utils';

export interface StoryboardSplitOptions {
  rows: number;
  cols: number;
  gap: number;
  padding: number;
  namePrefix?: string;
  upscaleEnabled?: boolean;
  upscaleModel?: string;
  upscaleScale?: number;
}

export interface StoryboardSplitFrame {
  row: number;
  col: number;
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  blob: Blob;
}

export async function splitImageBlobIntoFramesOnMainThread(
  blob: Blob,
  input: Partial<StoryboardSplitOptions>,
): Promise<StoryboardSplitFrame[]> {
  const rows = clampInt(input.rows ?? 2, 1, 12);
  const cols = clampInt(input.cols ?? 2, 1, 12);
  const gap = Math.max(0, Math.round(input.gap ?? 0));
  const padding = Math.max(0, Math.round(input.padding ?? 0));

  const decoded = await decodeCanvasImageFromBlob(blob);

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
    const frames: StoryboardSplitFrame[] = [];

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

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('无法创建切割画布上下文');
        }

        ctx.drawImage(decoded.source, sourceX, sourceY, width, height, 0, 0, width, height);

        const frameBlob = await canvasToBlob(canvas).catch(() => {
          throw new Error('导出切片失败');
        });

        frames.push({
          row,
          col,
          width,
          height,
          sourceX,
          sourceY,
          blob: frameBlob,
        });
      }
    }

    return frames;
  } finally {
    decoded.release();
  }
}

export async function splitImageBlobIntoFrames(
  blob: Blob,
  input: Partial<StoryboardSplitOptions>,
): Promise<StoryboardSplitFrame[]> {
  try {
    return await workerSplitStoryboard(blob, input);
  } catch (error) {
    if (isWorkerCancelledError(error)) {
      throw error;
    }
    return splitImageBlobIntoFramesOnMainThread(blob, input);
  }
}
