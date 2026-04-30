import { MAX_SPLIT_SOURCE_PIXELS } from './image-processing-constants';
import { clampInt } from './number-utils';
import { decodeWorkerImage } from './image-worker-image-decode';

export interface SplitStoryboardOperationInput {
  buffer: ArrayBuffer;
  mime: string;
  rows: number;
  cols: number;
  gap: number;
  padding: number;
}

export interface SplitStoryboardFrameResult {
  row: number;
  col: number;
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  buffer: ArrayBuffer;
  mime: string;
}

export interface SplitStoryboardCell {
  row: number;
  col: number;
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
}

export interface SplitStoryboardOperationResult {
  results: SplitStoryboardFrameResult[];
  transfers: ArrayBuffer[];
}

export function resolveStoryboardSplitCells(options: {
  sourceWidth: number;
  sourceHeight: number;
  rows: number;
  cols: number;
  gap: number;
  padding: number;
}): SplitStoryboardCell[] {
  const rows = clampInt(options.rows, 1, 12);
  const cols = clampInt(options.cols, 1, 12);
  const gap = Math.max(0, Math.round(options.gap));
  const padding = Math.max(0, Math.round(options.padding));
  const availableWidth = options.sourceWidth - (padding * 2) - (gap * (cols - 1));
  const availableHeight = options.sourceHeight - (padding * 2) - (gap * (rows - 1));

  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error('切割参数无效，导致可用区域为 0');
  }

  const baseCellWidth = availableWidth / cols;
  const baseCellHeight = availableHeight / rows;
  const cells: SplitStoryboardCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const sourceX = Math.round(padding + col * (baseCellWidth + gap));
      const sourceY = Math.round(padding + row * (baseCellHeight + gap));
      const width = col === cols - 1
        ? Math.max(1, options.sourceWidth - padding - sourceX)
        : Math.max(1, Math.round(baseCellWidth));
      const height = row === rows - 1
        ? Math.max(1, options.sourceHeight - padding - sourceY)
        : Math.max(1, Math.round(baseCellHeight));

      cells.push({
        row,
        col,
        width,
        height,
        sourceX,
        sourceY,
      });
    }
  }

  return cells;
}

export async function splitStoryboardInWorker(input: SplitStoryboardOperationInput): Promise<SplitStoryboardOperationResult> {
  const decoded = await decodeWorkerImage(input.buffer, input.mime);

  try {
    if (decoded.width * decoded.height > MAX_SPLIT_SOURCE_PIXELS) {
      throw new Error('原图尺寸过大，请先裁剪或缩小后再执行分镜切割');
    }

    const cells = resolveStoryboardSplitCells({
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      rows: input.rows,
      cols: input.cols,
      gap: input.gap,
      padding: input.padding,
    });
    const results: SplitStoryboardFrameResult[] = [];
    const transfers: ArrayBuffer[] = [];

    for (const cell of cells) {
      const canvas = new OffscreenCanvas(cell.width, cell.height);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('无法创建切割画布上下文');
      }

      context.drawImage(decoded.source, cell.sourceX, cell.sourceY, cell.width, cell.height, 0, 0, cell.width, cell.height);
      const frameBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
      const frameBuffer = await frameBlob.arrayBuffer();

      results.push({
        ...cell,
        buffer: frameBuffer,
        mime: frameBlob.type || 'image/png',
      });
      transfers.push(frameBuffer);
    }

    return {
      results,
      transfers,
    };
  } finally {
    decoded.release();
  }
}
