/**
 * Image Worker — 离屏图片处理线程
 *
 * 在 Web Worker 中执行 CPU 密集的图片操作，不阻塞主线程渲染和交互：
 * - 图片压缩（大图缩放 + JPEG 编码）
 * - LOD 多级缩略图生成（64 / 256 / 1024 px）
 * - data URL → Blob 转换
 * - 数据序列化（JSON stringify 大型元素数组）
 */

import { decodeDataUrlArrayBuffer } from './data-url';
import { encodeLodBlob, resolveLodQuality } from './image-worker-lod-operation';
import {
  IMAGE_FONT_FAMILY,
  MAX_ANNOTATE_SOURCE_PIXELS,
  MAX_CROP_SOURCE_PIXELS,
  MAX_EXPORT_CANVAS_DIMENSION,
  MAX_EXPORT_CANVAS_PIXELS,
  MAX_EXPORT_ITEMS,
  MAX_EXPORT_TOTAL_SOURCE_PIXELS,
  MAX_SPLIT_SOURCE_PIXELS,
} from './image-processing-constants';
import { clamp, clampInt, clampMarkerNumber } from './number-utils';

// ── 类型定义 ──────────────────────────────────────────

interface CompressImageMsg {
  type: 'compress-image';
  id: string;
  /** ArrayBuffer of the original image */
  buffer: ArrayBuffer;
  mime: string;
  maxResolution: number;
  quality: number;
}

interface GenerateLODMsg {
  type: 'generate-lod';
  id: string;
  imageId: string;
  /** ArrayBuffer of the original image */
  buffer: ArrayBuffer;
  mime: string;
  levels: number[];
  /** 各级别对应的 JPEG 质量（可选，默认 0.7） */
  qualities?: Record<number, number>;
}

interface DataUrlToBlobMsg {
  type: 'dataurl-to-blob';
  id: string;
  dataUrl: string;
}

interface CropRectMsg {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropImageMsg {
  type: 'crop-image';
  id: string;
  buffer: ArrayBuffer;
  mime: string;
  aspectRatio: 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
  zoom: number;
  focusX: number;
  focusY: number;
  cropRect?: CropRectMsg;
}

interface SplitStoryboardMsg {
  type: 'split-storyboard';
  id: string;
  buffer: ArrayBuffer;
  mime: string;
  rows: number;
  cols: number;
  gap: number;
  padding: number;
}

interface StoryboardExportWorkerItemMsg {
  buffer: ArrayBuffer;
  mime: string;
  caption?: string;
  displayName?: string;
  storyboardShotCode?: string;
  storyboardSceneType?: string;
  storyboardCameraMove?: string;
  storyboardDuration?: string;
  storyboardNote?: string;
}

interface BuildStoryboardExportMsg {
  type: 'build-storyboard-export';
  id: string;
  items: StoryboardExportWorkerItemMsg[];
  options: {
    columns: number;
    gap: number;
    padding: number;
    backgroundColor: string;
    textColor: string;
    showNumbers: boolean;
    captionMode: 'none' | 'display-name' | 'prompt' | 'annotation-title' | 'annotation-note' | 'annotation-full' | 'storyboard-meta';
    exportStyle: 'classic' | 'cinema' | 'worksheet';
    suggestedFileName?: string;
    lockCurrentOrder?: boolean;
    showHeader?: boolean;
    headerTitle?: string;
    headerSubtitle?: string;
  };
}

interface AnnotateImageMsg {
  type: 'annotate-image';
  id: string;
  buffer: ArrayBuffer;
  mime: string;
  options: {
    label: string;
    note?: string;
    markerNumber?: number;
    position: 'top' | 'bottom';
    accentColor: string;
    namePrefix?: string;
  };
}

interface SerializeMsg {
  type: 'serialize';
  id: string;
  data: unknown;
}

interface DeserializeMsg {
  type: 'deserialize';
  id: string;
  json: string;
}

interface WorkerContext {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void | Promise<void>) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

type WorkerMessage =
  | CompressImageMsg
  | GenerateLODMsg
  | DataUrlToBlobMsg
  | CropImageMsg
  | SplitStoryboardMsg
  | BuildStoryboardExportMsg
  | AnnotateImageMsg
  | SerializeMsg
  | DeserializeMsg;

// ── 辅助函数 ──────────────────────────────────────────

/** ArrayBuffer → Blob */
function bufferToBlob(buffer: ArrayBuffer, mime: string): Blob {
  return new Blob([buffer], { type: mime });
}

async function decodeWorkerImage(
  buffer: ArrayBuffer,
  mime: string,
): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  const DecoderCtor = (globalThis as { ImageDecoder?: new (input: { data: Uint8Array; type: string }) => {
    decode: () => Promise<{ image: { codedWidth?: number; codedHeight?: number; displayWidth?: number; displayHeight?: number; close?: () => void } }>;
    close?: () => void;
  } }).ImageDecoder;

  if (DecoderCtor) {
    const decoder = new DecoderCtor({
      data: new Uint8Array(buffer),
      type: mime || 'image/png',
    });
    const { image } = await decoder.decode();
    return {
      source: image as CanvasImageSource,
      width: image.displayWidth ?? image.codedWidth ?? 0,
      height: image.displayHeight ?? image.codedHeight ?? 0,
      release: () => {
        image.close?.();
        decoder.close?.();
      },
    };
  }

  const blob = bufferToBlob(buffer, mime);
  const bitmap = await createImageBitmap(blob);
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    release: () => bitmap.close(),
  };
}

function getAspectRatioValue(
  preset: CropImageMsg['aspectRatio'],
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

function sanitizeCropRect(rect: CropRectMsg | undefined): CropRectMsg | null {
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

function truncateText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;

  let nextText = text;
  while (nextText.length > 1 && ctx.measureText(`${nextText}…`).width > maxWidth) {
    nextText = nextText.slice(0, -1);
  }
  return `${nextText}…`;
}

function wrapTextLines(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [] as string[];

  const lines: string[] = [];
  let current = '';

  for (const char of normalized) {
    const next = `${current}${char}`;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = char.trimStart();
      if (lines.length === maxLines - 1) {
        break;
      }
      continue;
    }
    current = next;
  }

  const consumed = lines.join('').length;
  const remainder = normalized.slice(consumed);
  if (lines.length < maxLines && remainder) {
    lines.push(remainder);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  if (lines.length === maxLines) {
    const displayedLength = lines.join('').length;
    if (displayedLength < normalized.length) {
      lines[maxLines - 1] = truncateText(ctx, lines[maxLines - 1] + normalized.slice(displayedLength), maxWidth);
    }
  }

  return lines.filter(Boolean);
}

function drawMultilineText(
  ctx: OffscreenCanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

interface StoryboardExportTheme {
  cardFill: string;
  cardStroke: string;
  imageFill: string;
  headerFill: string;
  headerText: string;
  headerSubtleText: string;
  fieldFill: string;
  fieldStroke: string;
  fieldLabel: string;
  fieldValue: string;
  noteFill: string;
  noteStroke: string;
  noteLabel: string;
  noteText: string;
  badgeFill: string;
  badgeText: string;
  pageHeaderFill: string;
  pageHeaderText: string;
  pageHeaderSubtle: string;
  shadowAlpha: number;
}

function getExportTheme(style: 'classic' | 'cinema' | 'worksheet'): StoryboardExportTheme {
  switch (style) {
    case 'cinema':
      return {
        cardFill: 'rgba(10,14,22,0.96)',
        cardStroke: 'rgba(148,163,184,0.18)',
        imageFill: '#111827',
        headerFill: '#020617',
        headerText: '#f8fafc',
        headerSubtleText: 'rgba(191,219,254,0.92)',
        fieldFill: 'rgba(15,23,42,0.88)',
        fieldStroke: 'rgba(148,163,184,0.14)',
        fieldLabel: '#94a3b8',
        fieldValue: '#f8fafc',
        noteFill: 'rgba(30,41,59,0.92)',
        noteStroke: 'rgba(125,211,252,0.16)',
        noteLabel: '#7dd3fc',
        noteText: '#e2e8f0',
        badgeFill: '#f59e0b',
        badgeText: '#111827',
        pageHeaderFill: 'rgba(2,6,23,0.88)',
        pageHeaderText: '#f8fafc',
        pageHeaderSubtle: '#cbd5e1',
        shadowAlpha: 0.22,
      };
    case 'worksheet':
      return {
        cardFill: 'rgba(255,255,255,0.99)',
        cardStroke: 'rgba(15,23,42,0.18)',
        imageFill: '#ffffff',
        headerFill: '#e2e8f0',
        headerText: '#0f172a',
        headerSubtleText: '#334155',
        fieldFill: '#ffffff',
        fieldStroke: 'rgba(15,23,42,0.18)',
        fieldLabel: '#64748b',
        fieldValue: '#0f172a',
        noteFill: '#ffffff',
        noteStroke: 'rgba(15,23,42,0.2)',
        noteLabel: '#475569',
        noteText: '#111827',
        badgeFill: '#0f172a',
        badgeText: '#ffffff',
        pageHeaderFill: '#ffffff',
        pageHeaderText: '#0f172a',
        pageHeaderSubtle: '#64748b',
        shadowAlpha: 0.08,
      };
    case 'classic':
    default:
      return {
        cardFill: 'rgba(255,255,255,0.97)',
        cardStroke: 'rgba(15,23,42,0.08)',
        imageFill: '#f3f4f6',
        headerFill: '#111827',
        headerText: '#f8fafc',
        headerSubtleText: 'rgba(255,255,255,0.82)',
        fieldFill: '#f8fafc',
        fieldStroke: 'rgba(148,163,184,0.16)',
        fieldLabel: '#94a3b8',
        fieldValue: '#0f172a',
        noteFill: '#fff7ed',
        noteStroke: 'rgba(251,146,60,0.18)',
        noteLabel: '#9a3412',
        noteText: '#111827',
        badgeFill: '#111827',
        badgeText: '#ffffff',
        pageHeaderFill: 'rgba(255,255,255,0.92)',
        pageHeaderText: '#0f172a',
        pageHeaderSubtle: '#64748b',
        shadowAlpha: 0.12,
      };
  }
}

function fitContain(srcWidth: number, srcHeight: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / Math.max(1, srcWidth), maxHeight / Math.max(1, srcHeight));
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

function drawRoundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + nextRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, nextRadius);
  ctx.arcTo(x + width, y + height, x, y + height, nextRadius);
  ctx.arcTo(x, y + height, x, y, nextRadius);
  ctx.arcTo(x, y, x + width, y, nextRadius);
  ctx.closePath();
}

function drawMetaField(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  theme: StoryboardExportTheme,
) {
  drawRoundedRect(ctx, x, y, width, 34, 10);
  ctx.fillStyle = theme.fieldFill;
  ctx.fill();
  ctx.strokeStyle = theme.fieldStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.fieldLabel;
  ctx.font = `500 10px ${IMAGE_FONT_FAMILY}`;
  ctx.fillText(label, x + 10, y + 7);

  ctx.fillStyle = theme.fieldValue;
  ctx.font = `600 12px ${IMAGE_FONT_FAMILY}`;
  ctx.fillText(truncateText(ctx, value || '—', width - 20), x + 10, y + 18);
}

// ── 消息处理 ──────────────────────────────────────────

const ctx = self as unknown as WorkerContext;

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'compress-image': {
        await handleCompressImage(msg);
        break;
      }
      case 'generate-lod': {
        await handleGenerateLOD(msg);
        break;
      }
      case 'dataurl-to-blob': {
        handleDataUrlToBlob(msg);
        break;
      }
      case 'crop-image': {
        await handleCropImage(msg);
        break;
      }
      case 'split-storyboard': {
        await handleSplitStoryboard(msg);
        break;
      }
      case 'build-storyboard-export': {
        await handleBuildStoryboardExport(msg);
        break;
      }
      case 'annotate-image': {
        await handleAnnotateImage(msg);
        break;
      }
      case 'serialize': {
        handleSerialize(msg);
        break;
      }
      case 'deserialize': {
        handleDeserialize(msg);
        break;
      }
      default: {
        const unexpectedMsg = msg as { id: string; type: string };
        ctx.postMessage({
          type: 'error',
          id: unexpectedMsg.id,
          error: `Unknown message type: ${unexpectedMsg.type}`,
        });
      }
    }
  } catch (err: unknown) {
    ctx.postMessage({
      type: 'error',
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// ── 图片压缩 ──────────────────────────────────────────

async function handleCompressImage(msg: CompressImageMsg) {
  const decoded = await decodeWorkerImage(msg.buffer, msg.mime);
  const natW = decoded.width;
  const natH = decoded.height;
  const maxRes = msg.maxResolution;

  let sw = natW;
  let sh = natH;
  if (sw > maxRes || sh > maxRes) {
    if (sw >= sh) {
      sh = Math.round(sh * (maxRes / sw));
      sw = maxRes;
    } else {
      sw = Math.round(sw * (maxRes / sh));
      sh = maxRes;
    }
  }

  const oc = new OffscreenCanvas(sw, sh);
  const ocCtx = oc.getContext('2d')!;
  ocCtx.drawImage(decoded.source, 0, 0, sw, sh);
  decoded.release();

  const resultBlob = await oc.convertToBlob({
    type: 'image/jpeg',
    quality: msg.quality,
  });
  const resultBuffer = await resultBlob.arrayBuffer();

  ctx.postMessage(
    {
      type: 'compress-image-result',
      id: msg.id,
      buffer: resultBuffer,
      mime: 'image/jpeg',
      width: sw,
      height: sh,
    },
    [resultBuffer], // transfer ownership for zero-copy
  );
}

// ── LOD 缩略图生成 ───────────────────────────────────

async function handleGenerateLOD(msg: GenerateLODMsg) {
  const decoded = await decodeWorkerImage(msg.buffer, msg.mime);
  const natW = decoded.width;
  const natH = decoded.height;

  const lodResults: Array<{
    level: number;
    buffer: ArrayBuffer;
    mime: string;
  }> = [];
  const transfers: ArrayBuffer[] = [];

  for (const maxPx of msg.levels) {
    // 如果原图比缩略图还小，跳过
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

    const oc = new OffscreenCanvas(sw, sh);
    const ocCtx = oc.getContext('2d')!;
    ocCtx.drawImage(decoded.source, 0, 0, sw, sh);

    const quality = resolveLodQuality(msg.mime, maxPx, msg.qualities);
    const thumbBlob = await encodeLodBlob(oc, msg.mime, quality);
    const thumbBuffer = await thumbBlob.arrayBuffer();

    lodResults.push({ level: maxPx, buffer: thumbBuffer, mime: thumbBlob.type || 'image/jpeg' });
    transfers.push(thumbBuffer);
  }

  decoded.release();

  ctx.postMessage(
    {
      type: 'generate-lod-result',
      id: msg.id,
      imageId: msg.imageId,
      results: lodResults,
    },
    transfers, // zero-copy transfer
  );
}

// ── data URL → Blob ──────────────────────────────────

function handleDataUrlToBlob(msg: DataUrlToBlobMsg) {
  const { buffer, mime } = decodeDataUrlArrayBuffer(msg.dataUrl);

  ctx.postMessage(
    {
      type: 'dataurl-to-blob-result',
      id: msg.id,
      buffer,
      mime,
    },
    [buffer], // transfer ownership
  );
}

async function handleCropImage(msg: CropImageMsg) {
  const decoded = await decodeWorkerImage(msg.buffer, msg.mime);

  try {
    if (decoded.width * decoded.height > MAX_CROP_SOURCE_PIXELS) {
      throw new Error('原图尺寸过大，请先缩小或切分后再裁剪');
    }

    const normalizedRect = sanitizeCropRect(msg.cropRect);
    const fallbackRatio = decoded.width / Math.max(1, decoded.height);
    const aspectRatio = getAspectRatioValue(msg.aspectRatio, fallbackRatio);
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
      const zoom = clamp(msg.zoom, 10, 100);
      const focusX = clamp(msg.focusX, -100, 100);
      const focusY = clamp(msg.focusY, -100, 100);
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

    const canvas = new OffscreenCanvas(cropWidth, cropHeight);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建裁剪画布上下文');
    }

    context.drawImage(decoded.source, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    const resultBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
    const resultBuffer = await resultBlob.arrayBuffer();

    ctx.postMessage(
      {
        type: 'crop-image-result',
        id: msg.id,
        buffer: resultBuffer,
        mime: resultBlob.type || 'image/png',
        width: cropWidth,
        height: cropHeight,
      },
      [resultBuffer],
    );
  } finally {
    decoded.release();
  }
}

async function handleSplitStoryboard(msg: SplitStoryboardMsg) {
  const decoded = await decodeWorkerImage(msg.buffer, msg.mime);

  try {
    if (decoded.width * decoded.height > MAX_SPLIT_SOURCE_PIXELS) {
      throw new Error('原图尺寸过大，请先裁剪或缩小后再执行分镜切割');
    }

    const rows = clampInt(msg.rows, 1, 12);
    const cols = clampInt(msg.cols, 1, 12);
    const gap = Math.max(0, Math.round(msg.gap));
    const padding = Math.max(0, Math.round(msg.padding));
    const availableWidth = decoded.width - (padding * 2) - (gap * (cols - 1));
    const availableHeight = decoded.height - (padding * 2) - (gap * (rows - 1));

    if (availableWidth <= 0 || availableHeight <= 0) {
      throw new Error('切割参数无效，导致可用区域为 0');
    }

    const baseCellWidth = availableWidth / cols;
    const baseCellHeight = availableHeight / rows;
    const results: Array<{
      row: number;
      col: number;
      width: number;
      height: number;
      sourceX: number;
      sourceY: number;
      buffer: ArrayBuffer;
      mime: string;
    }> = [];
    const transfers: ArrayBuffer[] = [];

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

        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('无法创建切割画布上下文');
        }

        context.drawImage(decoded.source, sourceX, sourceY, width, height, 0, 0, width, height);
        const frameBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
        const frameBuffer = await frameBlob.arrayBuffer();

        results.push({
          row,
          col,
          width,
          height,
          sourceX,
          sourceY,
          buffer: frameBuffer,
          mime: frameBlob.type || 'image/png',
        });
        transfers.push(frameBuffer);
      }
    }

    ctx.postMessage(
      {
        type: 'split-storyboard-result',
        id: msg.id,
        results,
      },
      transfers,
    );
  } finally {
    decoded.release();
  }
}

async function handleBuildStoryboardExport(msg: BuildStoryboardExportMsg) {
  if (msg.items.length === 0) {
    throw new Error('没有可导出的图片');
  }
  if (msg.items.length > MAX_EXPORT_ITEMS) {
    throw new Error(`单次导出最多支持 ${MAX_EXPORT_ITEMS} 张图片，请分批导出`);
  }

  const decodedItems = await Promise.all(msg.items.map(async (item) => {
    const decoded = await decodeWorkerImage(item.buffer, item.mime);
    return { ...item, decoded };
  }));

  try {
    const totalSourcePixels = decodedItems.reduce((sum, item) => sum + item.decoded.width * item.decoded.height, 0);
    if (totalSourcePixels > MAX_EXPORT_TOTAL_SOURCE_PIXELS) {
      throw new Error('导出内容过大，请减少图片数量或先缩小素材后再导出');
    }

    const options = msg.options;
    const columns = Math.min(clampInt(options.columns, 1, 8), decodedItems.length);
    const rows = Math.ceil(decodedItems.length / columns);
    const maxBitmapWidth = Math.max(...decodedItems.map((item) => item.decoded.width));
    const maxBitmapHeight = Math.max(...decodedItems.map((item) => item.decoded.height));
    const isStoryboardMetaMode = options.captionMode === 'storyboard-meta';
    const theme = getExportTheme(options.exportStyle);
    const cellWidth = Math.max(220, Math.min(520, maxBitmapWidth));
    const imageHeight = Math.max(160, Math.min(420, maxBitmapHeight));
    const numberBadge = options.showNumbers ? 40 : 0;
    const cardPadding = 14;
    const headerHeight = isStoryboardMetaMode ? 42 : 0;
    const footerHeight = isStoryboardMetaMode ? 116 : options.captionMode === 'none' ? 0 : 84;
    const cardHeight = headerHeight + imageHeight + footerHeight + cardPadding * 2;
    const pageHeaderHeight = options.showHeader && (options.headerTitle || options.headerSubtitle) ? 92 : 0;
    const canvasWidth = options.padding * 2 + columns * cellWidth + (columns - 1) * options.gap;
    const canvasHeight = options.padding * 2 + pageHeaderHeight + (pageHeaderHeight > 0 ? options.gap : 0) + rows * cardHeight + (rows - 1) * options.gap;

    if (canvasWidth > MAX_EXPORT_CANVAS_DIMENSION || canvasHeight > MAX_EXPORT_CANVAS_DIMENSION || canvasWidth * canvasHeight > MAX_EXPORT_CANVAS_PIXELS) {
      throw new Error('导出画布尺寸过大，请减少列数、图片数量或降低内容规模后重试');
    }

    const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建分镜表画布');
    }

    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    if (pageHeaderHeight > 0) {
      const headerX = options.padding;
      const headerY = options.padding;
      const headerWidth = canvasWidth - options.padding * 2;
      drawRoundedRect(context, headerX, headerY, headerWidth, pageHeaderHeight, options.exportStyle === 'worksheet' ? 14 : 18);
      context.fillStyle = theme.pageHeaderFill;
      context.fill();
      if (options.exportStyle === 'worksheet') {
        context.strokeStyle = 'rgba(15,23,42,0.12)';
        context.lineWidth = 1;
        context.stroke();
      }

      if (options.headerTitle) {
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillStyle = theme.pageHeaderText;
        context.font = `700 24px ${IMAGE_FONT_FAMILY}`;
        const titleLines = wrapTextLines(context, options.headerTitle, headerWidth - 36, 2);
        drawMultilineText(context, titleLines, headerX + 18, headerY + 14, 28);
      }

      if (options.headerSubtitle) {
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillStyle = theme.pageHeaderSubtle;
        context.font = `500 12px ${IMAGE_FONT_FAMILY}`;
        const subtitleLines = wrapTextLines(context, options.headerSubtitle, headerWidth - 36, 2);
        drawMultilineText(context, subtitleLines, headerX + 18, headerY + 48, 16);
      }
    }

    decodedItems.forEach((item, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = options.padding + col * (cellWidth + options.gap);
      const y = options.padding + pageHeaderHeight + (pageHeaderHeight > 0 ? options.gap : 0) + row * (cardHeight + options.gap);
      const bitmap = item.decoded;

      context.shadowColor = `rgba(15,23,42,${theme.shadowAlpha})`;
      context.shadowBlur = options.exportStyle === 'worksheet' ? 8 : 18;
      context.shadowOffsetY = options.exportStyle === 'worksheet' ? 4 : 10;
      context.fillStyle = isStoryboardMetaMode ? theme.cardFill : 'rgba(255,255,255,0.92)';
      context.strokeStyle = isStoryboardMetaMode ? theme.cardStroke : 'rgba(15,23,42,0.08)';
      context.lineWidth = 1;
      drawRoundedRect(context, x, y, cellWidth, cardHeight, 16);
      context.fill();
      context.stroke();
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;

      const imageAreaY = y + cardPadding + headerHeight;
      const imageAreaHeight = imageHeight;
      const fitted = fitContain(bitmap.width, bitmap.height, cellWidth - cardPadding * 2, imageAreaHeight - cardPadding * 2);
      const imageX = x + Math.round((cellWidth - fitted.width) / 2);
      const imageY = imageAreaY + Math.round((imageAreaHeight - fitted.height) / 2);

      if (isStoryboardMetaMode) {
        const shotCode = item.storyboardShotCode?.trim() || `SHOT ${index + 1}`;
        const title = item.displayName?.trim() || item.caption?.trim() || '未命名分镜';

        drawRoundedRect(context, x + cardPadding, y + cardPadding, cellWidth - cardPadding * 2, 34, 12);
        context.fillStyle = theme.headerFill;
        context.fill();

        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillStyle = theme.headerText;
        context.font = `700 12px ${IMAGE_FONT_FAMILY}`;
        context.fillText(truncateText(context, shotCode, 74), x + cardPadding + 12, y + cardPadding + 17);

        context.fillStyle = theme.headerSubtleText;
        context.font = `500 12px ${IMAGE_FONT_FAMILY}`;
        context.fillText(truncateText(context, title, cellWidth - cardPadding * 2 - 94), x + cardPadding + 84, y + cardPadding + 17);
      }

      drawRoundedRect(context, x + cardPadding, imageAreaY + cardPadding, cellWidth - cardPadding * 2, imageAreaHeight - cardPadding * 2, 12);
      context.fillStyle = isStoryboardMetaMode ? theme.imageFill : '#f3f4f6';
      context.fill();
      context.drawImage(bitmap.source, imageX, imageY, fitted.width, fitted.height);

      if (options.showNumbers) {
        context.fillStyle = isStoryboardMetaMode ? theme.badgeFill : '#111827';
        context.beginPath();
        context.arc(x + 20 + numberBadge / 2, y + 20 + numberBadge / 2, numberBadge / 2, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = isStoryboardMetaMode ? theme.badgeText : '#ffffff';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `700 18px ${IMAGE_FONT_FAMILY}`;
        context.fillText(String(index + 1), x + 20 + numberBadge / 2, y + 20 + numberBadge / 2 + 1);
      }

      if (isStoryboardMetaMode) {
        const footerY = y + cardHeight - cardPadding - footerHeight + 8;
        const fieldGap = 8;
        const fieldWidth = (cellWidth - cardPadding * 2 - fieldGap * 2) / 3;
        drawMetaField(context, x + cardPadding, footerY, fieldWidth, '景别', item.storyboardSceneType?.trim() || '未填写', theme);
        drawMetaField(context, x + cardPadding + fieldWidth + fieldGap, footerY, fieldWidth, '运镜', item.storyboardCameraMove?.trim() || '未填写', theme);
        drawMetaField(context, x + cardPadding + (fieldWidth + fieldGap) * 2, footerY, fieldWidth, '时长', item.storyboardDuration?.trim() || '未填写', theme);

        const note = item.storyboardNote?.trim() || item.caption?.trim() || '暂无备注';
        const noteHeight = 48;
        drawRoundedRect(context, x + cardPadding, footerY + 42, cellWidth - cardPadding * 2, noteHeight, 10);
        context.fillStyle = theme.noteFill;
        context.fill();
        context.strokeStyle = theme.noteStroke;
        context.lineWidth = 1;
        context.stroke();

        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillStyle = theme.noteLabel;
        context.font = `600 11px ${IMAGE_FONT_FAMILY}`;
        context.fillText('备注', x + cardPadding + 10, footerY + 48);
        context.fillStyle = theme.noteText;
        context.font = `500 11px ${IMAGE_FONT_FAMILY}`;
        const noteLines = wrapTextLines(context, note, cellWidth - cardPadding * 2 - 54, 2);
        drawMultilineText(context, noteLines, x + cardPadding + 42, footerY + 48, 14);
      } else if (options.captionMode !== 'none') {
        const rawCaption = item.caption?.trim() || '';
        if (rawCaption) {
          context.textAlign = 'left';
          context.textBaseline = 'top';
          context.fillStyle = options.textColor;
          context.font = `500 14px ${IMAGE_FONT_FAMILY}`;
          const captionLines = wrapTextLines(context, rawCaption, cellWidth - cardPadding * 2, 3);
          drawMultilineText(context, captionLines, x + cardPadding, y + imageHeight + cardPadding + 10, 18);
        }
      }
    });

    const resultBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
    const resultBuffer = await resultBlob.arrayBuffer();
    ctx.postMessage(
      {
        type: 'build-storyboard-export-result',
        id: msg.id,
        buffer: resultBuffer,
        mime: resultBlob.type || 'image/png',
      },
      [resultBuffer],
    );
  } finally {
    decodedItems.forEach((item) => item.decoded.release());
  }
}

async function handleAnnotateImage(msg: AnnotateImageMsg) {
  const decoded = await decodeWorkerImage(msg.buffer, msg.mime);
  const markerNumber = clampMarkerNumber(msg.options.markerNumber);
  const label = msg.options.label.trim();
  const note = msg.options.note?.trim() || '';
  const accentColor = msg.options.accentColor || '#7c3aed';

  try {
    if (decoded.width * decoded.height > MAX_ANNOTATE_SOURCE_PIXELS) {
      throw new Error('原图尺寸过大，请先缩小后再生成标注图');
    }

    const padding = Math.max(24, Math.round(Math.min(decoded.width, decoded.height) * 0.04));
    const badgeSize = Math.max(42, Math.round(Math.min(decoded.width, decoded.height) * 0.12));
    const titleFontSize = Math.max(24, Math.round(decoded.width * 0.045));
    const noteFontSize = Math.max(16, Math.round(decoded.width * 0.026));

    const textMeasureCanvas = new OffscreenCanvas(Math.max(1, decoded.width), 1);
    const textMeasureContext = textMeasureCanvas.getContext('2d');
    if (!textMeasureContext) {
      throw new Error('无法创建标注排版上下文');
    }

    const textStartXBase = padding + (markerNumber ? badgeSize + 18 : 0);
    const textMaxWidth = Math.max(120, decoded.width - textStartXBase - padding);
    const titleLineHeight = Math.round(titleFontSize * 1.18);
    const noteLineHeight = Math.round(noteFontSize * 1.5);

    textMeasureContext.font = `700 ${titleFontSize}px ${IMAGE_FONT_FAMILY}`;
    const titleLines = label ? wrapTextLines(textMeasureContext, label, textMaxWidth, 2) : [];

    textMeasureContext.font = `400 ${noteFontSize}px ${IMAGE_FONT_FAMILY}`;
    const noteLines = note ? wrapTextLines(textMeasureContext, note, textMaxWidth, 3) : [];

    const titleBlockHeight = titleLines.length > 0 ? titleLines.length * titleLineHeight : 0;
    const noteGap = titleBlockHeight > 0 && noteLines.length > 0 ? Math.max(8, Math.round(noteFontSize * 0.45)) : 0;
    const noteBlockHeight = noteLines.length > 0 ? noteLines.length * noteLineHeight : 0;
    const footerContentHeight = Math.max(badgeSize, titleBlockHeight + noteGap + noteBlockHeight);
    const footerHeight = titleLines.length > 0 || noteLines.length > 0 ? Math.max(96, padding * 2 + footerContentHeight) : 0;

    const canvas = new OffscreenCanvas(decoded.width, decoded.height + footerHeight);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建标注画布上下文');
    }

    const imageOffsetY = msg.options.position === 'top' ? footerHeight : 0;
    const bannerY = msg.options.position === 'top' ? 0 : decoded.height;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, imageOffsetY, decoded.width, decoded.height);

    if (footerHeight > 0) {
      const bannerGradient = context.createLinearGradient(0, bannerY, 0, bannerY + footerHeight);
      bannerGradient.addColorStop(0, 'rgba(15, 23, 42, 0.98)');
      bannerGradient.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
      context.fillStyle = bannerGradient;
      context.fillRect(0, bannerY, canvas.width, footerHeight);

      context.fillStyle = accentColor;
      context.fillRect(0, bannerY, 14, footerHeight);
      context.fillStyle = 'rgba(255,255,255,0.08)';
      context.fillRect(14, bannerY, canvas.width - 14, 1);

      let textStartX = padding;
      if (markerNumber) {
        const badgeX = padding;
        const badgeY = bannerY + Math.round((footerHeight - badgeSize) / 2);
        context.fillStyle = accentColor;
        context.beginPath();
        context.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = '#ffffff';
        context.font = `700 ${Math.round(badgeSize * 0.42)}px ${IMAGE_FONT_FAMILY}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(String(markerNumber), badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1);
        textStartX += badgeSize + 18;
      }

      context.textAlign = 'left';
      context.textBaseline = 'top';
      const contentStartY = bannerY + Math.round((footerHeight - footerContentHeight) / 2);

      if (titleLines.length > 0) {
        context.fillStyle = '#ffffff';
        context.font = `700 ${titleFontSize}px ${IMAGE_FONT_FAMILY}`;
        titleLines.forEach((line, index) => {
          context.fillText(line, textStartX, contentStartY + index * titleLineHeight);
        });
      }

      if (noteLines.length > 0) {
        const noteY = contentStartY + titleBlockHeight + noteGap;
        context.fillStyle = 'rgba(226, 232, 240, 0.95)';
        context.font = `400 ${noteFontSize}px ${IMAGE_FONT_FAMILY}`;
        noteLines.forEach((line, index) => {
          context.fillText(line, textStartX, noteY + index * noteLineHeight);
        });
      }
    }

    const resultBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
    const resultBuffer = await resultBlob.arrayBuffer();
    ctx.postMessage(
      {
        type: 'annotate-image-result',
        id: msg.id,
        buffer: resultBuffer,
        mime: resultBlob.type || 'image/png',
      },
      [resultBuffer],
    );
  } finally {
    decoded.release();
  }
}

// ── 数据序列化 / 反序列化 ────────────────────────────

function handleSerialize(msg: SerializeMsg) {
  const json = JSON.stringify(msg.data);
  ctx.postMessage({
    type: 'serialize-result',
    id: msg.id,
    json,
    byteLength: json.length * 2, // approximate UTF-16 size
  });
}

function handleDeserialize(msg: DeserializeMsg) {
  const data = JSON.parse(msg.json);
  ctx.postMessage({
    type: 'deserialize-result',
    id: msg.id,
    data,
  });
}

// Prevent TypeScript from treating this as a module without exports
export {};
