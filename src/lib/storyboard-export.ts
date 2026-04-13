import { isWorkerCancelledError, workerBuildStoryboardExport } from './image-worker-bridge';
import { canvasToBlob } from './canvas-utils';
import {
  IMAGE_FONT_FAMILY,
  MAX_EXPORT_CANVAS_DIMENSION,
  MAX_EXPORT_CANVAS_PIXELS,
  MAX_EXPORT_ITEMS,
  MAX_EXPORT_TOTAL_SOURCE_PIXELS,
} from './image-processing-constants';
import { decodeCanvasImageFromBlob, type DecodedCanvasImage } from './image-render';
import { clampInt } from './number-utils';

export type StoryboardCaptionMode = 'none' | 'display-name' | 'prompt' | 'annotation-title' | 'annotation-note' | 'annotation-full' | 'storyboard-meta';
export type StoryboardExportStyle = 'classic' | 'cinema' | 'worksheet';

export interface StoryboardExportOptions {
  columns: number;
  gap: number;
  padding: number;
  backgroundColor: string;
  textColor: string;
  showNumbers: boolean;
  captionMode: StoryboardCaptionMode;
  exportStyle?: StoryboardExportStyle;
  suggestedFileName?: string;
  lockCurrentOrder?: boolean;
  showHeader?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
}

export interface StoryboardExportItem {
  blob: Blob;
  caption?: string;
  displayName?: string;
  storyboardShotCode?: string;
  storyboardSceneType?: string;
  storyboardCameraMove?: string;
  storyboardDuration?: string;
  storyboardNote?: string;
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

async function readBitmap(blob: Blob): Promise<DecodedCanvasImage> {
  return decodeCanvasImageFromBlob(blob);
}

function fitContain(srcWidth: number, srcHeight: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / Math.max(1, srcWidth), maxHeight / Math.max(1, srcHeight));
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
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

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;

  let nextText = text;
  while (nextText.length > 1 && ctx.measureText(`${nextText}…`).width > maxWidth) {
    nextText = nextText.slice(0, -1);
  }
  return `${nextText}…`;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
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
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function drawMetaField(
  ctx: CanvasRenderingContext2D,
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

function getExportTheme(style: StoryboardExportStyle): StoryboardExportTheme {
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

function setExportWorkerMode(mode: 'worker' | 'fallback') {
  const target = globalThis as {
    __OPENLOVART_LAST_IMAGE_WORKER_MODE__?: Partial<Record<'export', 'worker' | 'fallback'>>;
  };

  target.__OPENLOVART_LAST_IMAGE_WORKER_MODE__ = {
    ...(target.__OPENLOVART_LAST_IMAGE_WORKER_MODE__ || {}),
    export: mode,
  };
}

export async function buildStoryboardExportBlobOnMainThread(
  items: StoryboardExportItem[],
  input: Partial<StoryboardExportOptions>,
): Promise<Blob> {
  if (items.length === 0) {
    throw new Error('没有可导出的图片');
  }

  if (items.length > MAX_EXPORT_ITEMS) {
    throw new Error(`单次导出最多支持 ${MAX_EXPORT_ITEMS} 张图片，请分批导出`);
  }

  const options: StoryboardExportOptions = {
    columns: clampInt(input.columns ?? 3, 1, 8),
    gap: clampInt(input.gap ?? 24, 0, 120),
    padding: clampInt(input.padding ?? 28, 0, 200),
    backgroundColor: input.backgroundColor || '#ffffff',
    textColor: input.textColor || '#111827',
    showNumbers: input.showNumbers ?? true,
    captionMode: input.captionMode ?? 'none',
    exportStyle: input.exportStyle ?? 'classic',
    suggestedFileName: input.suggestedFileName?.trim() || undefined,
    lockCurrentOrder: input.lockCurrentOrder ?? false,
    showHeader: input.showHeader ?? false,
    headerTitle: input.headerTitle?.trim() || input.suggestedFileName?.trim() || undefined,
    headerSubtitle: input.headerSubtitle?.trim() || undefined,
  };

  const bitmaps = await Promise.all(items.map((item) => readBitmap(item.blob)));

  try {
    const totalSourcePixels = bitmaps.reduce((sum, bitmap) => sum + bitmap.width * bitmap.height, 0);
    if (totalSourcePixels > MAX_EXPORT_TOTAL_SOURCE_PIXELS) {
      throw new Error('导出内容过大，请减少图片数量或先缩小素材后再导出');
    }

    const columns = Math.min(options.columns, items.length);
    const rows = Math.ceil(items.length / columns);
    const maxBitmapWidth = Math.max(...bitmaps.map((bitmap) => bitmap.width));
    const maxBitmapHeight = Math.max(...bitmaps.map((bitmap) => bitmap.height));
    const isStoryboardMetaMode = options.captionMode === 'storyboard-meta';
    const theme = getExportTheme(options.exportStyle || 'classic');
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

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建分镜表画布');
    }

    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (pageHeaderHeight > 0) {
      const headerX = options.padding;
      const headerY = options.padding;
      const headerWidth = canvasWidth - options.padding * 2;
      drawRoundedRect(ctx, headerX, headerY, headerWidth, pageHeaderHeight, options.exportStyle === 'worksheet' ? 14 : 18);
      ctx.fillStyle = theme.pageHeaderFill;
      ctx.fill();
      if (options.exportStyle === 'worksheet') {
        ctx.strokeStyle = 'rgba(15,23,42,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (options.headerTitle) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = theme.pageHeaderText;
        ctx.font = `700 24px ${IMAGE_FONT_FAMILY}`;
        const titleLines = wrapTextLines(ctx, options.headerTitle, headerWidth - 36, 2);
        drawMultilineText(ctx, titleLines, headerX + 18, headerY + 14, 28);
      }

      if (options.headerSubtitle) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = theme.pageHeaderSubtle;
        ctx.font = `500 12px ${IMAGE_FONT_FAMILY}`;
        const subtitleLines = wrapTextLines(ctx, options.headerSubtitle, headerWidth - 36, 2);
        drawMultilineText(ctx, subtitleLines, headerX + 18, headerY + 48, 16);
      }
    }

    items.forEach((item, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = options.padding + col * (cellWidth + options.gap);
      const y = options.padding + pageHeaderHeight + (pageHeaderHeight > 0 ? options.gap : 0) + row * (cardHeight + options.gap);
      const bitmap = bitmaps[index];

      ctx.shadowColor = `rgba(15,23,42,${theme.shadowAlpha})`;
      ctx.shadowBlur = options.exportStyle === 'worksheet' ? 8 : 18;
      ctx.shadowOffsetY = options.exportStyle === 'worksheet' ? 4 : 10;
      ctx.fillStyle = isStoryboardMetaMode ? theme.cardFill : 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = isStoryboardMetaMode ? theme.cardStroke : 'rgba(15,23,42,0.08)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, x, y, cellWidth, cardHeight, 16);
      ctx.fill();
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      const imageAreaY = y + cardPadding + headerHeight;
      const imageAreaHeight = imageHeight;
      const fitted = fitContain(bitmap.width, bitmap.height, cellWidth - cardPadding * 2, imageAreaHeight - cardPadding * 2);
      const imageX = x + Math.round((cellWidth - fitted.width) / 2);
      const imageY = imageAreaY + Math.round((imageAreaHeight - fitted.height) / 2);

      if (isStoryboardMetaMode) {
        const shotCode = item.storyboardShotCode?.trim() || `SHOT ${index + 1}`;
        const title = item.displayName?.trim() || item.caption?.trim() || '未命名分镜';

        drawRoundedRect(ctx, x + cardPadding, y + cardPadding, cellWidth - cardPadding * 2, 34, 12);
        ctx.fillStyle = theme.headerFill;
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = theme.headerText;
        ctx.font = `700 12px ${IMAGE_FONT_FAMILY}`;
        ctx.fillText(truncateText(ctx, shotCode, 74), x + cardPadding + 12, y + cardPadding + 17);

        ctx.fillStyle = theme.headerSubtleText;
        ctx.font = `500 12px ${IMAGE_FONT_FAMILY}`;
        ctx.fillText(truncateText(ctx, title, cellWidth - cardPadding * 2 - 94), x + cardPadding + 84, y + cardPadding + 17);
      }

      drawRoundedRect(ctx, x + cardPadding, imageAreaY + cardPadding, cellWidth - cardPadding * 2, imageAreaHeight - cardPadding * 2, 12);
      ctx.fillStyle = isStoryboardMetaMode ? theme.imageFill : '#f3f4f6';
      ctx.fill();
      ctx.drawImage(bitmap.source, imageX, imageY, fitted.width, fitted.height);

      if (options.showNumbers) {
        ctx.fillStyle = isStoryboardMetaMode ? theme.badgeFill : '#111827';
        ctx.beginPath();
        ctx.arc(x + 20 + numberBadge / 2, y + 20 + numberBadge / 2, numberBadge / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isStoryboardMetaMode ? theme.badgeText : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 18px ${IMAGE_FONT_FAMILY}`;
        ctx.fillText(String(index + 1), x + 20 + numberBadge / 2, y + 20 + numberBadge / 2 + 1);
      }

      if (isStoryboardMetaMode) {
        const footerY = y + cardHeight - cardPadding - footerHeight + 8;
        const fieldGap = 8;
        const fieldWidth = (cellWidth - cardPadding * 2 - fieldGap * 2) / 3;
        drawMetaField(ctx, x + cardPadding, footerY, fieldWidth, '景别', item.storyboardSceneType?.trim() || '未填写', theme);
        drawMetaField(ctx, x + cardPadding + fieldWidth + fieldGap, footerY, fieldWidth, '运镜', item.storyboardCameraMove?.trim() || '未填写', theme);
        drawMetaField(ctx, x + cardPadding + (fieldWidth + fieldGap) * 2, footerY, fieldWidth, '时长', item.storyboardDuration?.trim() || '未填写', theme);

        const note = item.storyboardNote?.trim() || item.caption?.trim() || '暂无备注';
        const noteHeight = 48;
        drawRoundedRect(ctx, x + cardPadding, footerY + 42, cellWidth - cardPadding * 2, noteHeight, 10);
        ctx.fillStyle = theme.noteFill;
        ctx.fill();
        ctx.strokeStyle = theme.noteStroke;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = theme.noteLabel;
        ctx.font = `600 11px ${IMAGE_FONT_FAMILY}`;
        ctx.fillText('备注', x + cardPadding + 10, footerY + 48);
        ctx.fillStyle = theme.noteText;
        ctx.font = `500 11px ${IMAGE_FONT_FAMILY}`;
        const noteLines = wrapTextLines(ctx, note, cellWidth - cardPadding * 2 - 54, 2);
        drawMultilineText(ctx, noteLines, x + cardPadding + 42, footerY + 48, 14);
      } else if (options.captionMode !== 'none') {
        const rawCaption = item.caption?.trim() || '';
        if (rawCaption) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillStyle = options.textColor;
          ctx.font = `500 14px ${IMAGE_FONT_FAMILY}`;
          const captionLines = wrapTextLines(ctx, rawCaption, cellWidth - cardPadding * 2, 3);
          drawMultilineText(ctx, captionLines, x + cardPadding, y + imageHeight + cardPadding + 10, 18);
        }
      }
    });

    return await canvasToBlob(canvas).catch(() => {
      throw new Error('导出分镜表失败');
    });
  } finally {
    bitmaps.forEach((bitmap) => bitmap.release());
  }
}

export async function buildStoryboardExportBlob(
  items: StoryboardExportItem[],
  input: Partial<StoryboardExportOptions>,
): Promise<Blob> {
  try {
    return await workerBuildStoryboardExport(items, {
      columns: clampInt(input.columns ?? 3, 1, 8),
      gap: clampInt(input.gap ?? 24, 0, 120),
      padding: clampInt(input.padding ?? 28, 0, 200),
      backgroundColor: input.backgroundColor || '#ffffff',
      textColor: input.textColor || '#111827',
      showNumbers: input.showNumbers ?? true,
      captionMode: input.captionMode ?? 'none',
      exportStyle: input.exportStyle ?? 'classic',
      suggestedFileName: input.suggestedFileName?.trim() || undefined,
      lockCurrentOrder: input.lockCurrentOrder ?? false,
      showHeader: input.showHeader ?? false,
      headerTitle: input.headerTitle?.trim() || input.suggestedFileName?.trim() || undefined,
      headerSubtitle: input.headerSubtitle?.trim() || undefined,
    });
  } catch (error) {
    if (isWorkerCancelledError(error)) {
      throw error;
    }
    setExportWorkerMode('fallback');
    return buildStoryboardExportBlobOnMainThread(items, input);
  }
}
