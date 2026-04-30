import {
  drawMultilineText,
  drawRoundedRect,
  fitContain,
  truncateText,
  wrapTextLines,
} from './image-worker-canvas-drawing';
import { decodeWorkerImage, type DecodedWorkerImage } from './image-worker-image-decode';
import {
  IMAGE_FONT_FAMILY,
  MAX_EXPORT_CANVAS_DIMENSION,
  MAX_EXPORT_CANVAS_PIXELS,
  MAX_EXPORT_ITEMS,
  MAX_EXPORT_TOTAL_SOURCE_PIXELS,
} from './image-processing-constants';
import { clampInt } from './number-utils';

export interface StoryboardExportWorkerItemInput {
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

export interface StoryboardExportOptions {
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
}

export interface BuildStoryboardExportOperationInput {
  items: StoryboardExportWorkerItemInput[];
  options: StoryboardExportOptions;
}

export interface BuildStoryboardExportOperationResult {
  buffer: ArrayBuffer;
  mime: string;
}

export interface StoryboardExportTheme {
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

export interface StoryboardExportLayout {
  columns: number;
  rows: number;
  cellWidth: number;
  imageHeight: number;
  numberBadge: number;
  cardPadding: number;
  headerHeight: number;
  footerHeight: number;
  cardHeight: number;
  pageHeaderHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  isStoryboardMetaMode: boolean;
}

interface DecodedStoryboardExportItem extends StoryboardExportWorkerItemInput {
  decoded: DecodedWorkerImage;
}

export function getExportTheme(style: StoryboardExportOptions['exportStyle']): StoryboardExportTheme {
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

export function resolveStoryboardExportLayout(options: {
  itemCount: number;
  maxBitmapWidth: number;
  maxBitmapHeight: number;
  exportOptions: StoryboardExportOptions;
}): StoryboardExportLayout {
  const exportOptions = options.exportOptions;
  const columns = Math.min(clampInt(exportOptions.columns, 1, 8), options.itemCount);
  const rows = Math.ceil(options.itemCount / columns);
  const isStoryboardMetaMode = exportOptions.captionMode === 'storyboard-meta';
  const cellWidth = Math.max(220, Math.min(520, options.maxBitmapWidth));
  const imageHeight = Math.max(160, Math.min(420, options.maxBitmapHeight));
  const numberBadge = exportOptions.showNumbers ? 40 : 0;
  const cardPadding = 14;
  const headerHeight = isStoryboardMetaMode ? 42 : 0;
  const footerHeight = isStoryboardMetaMode ? 116 : exportOptions.captionMode === 'none' ? 0 : 84;
  const cardHeight = headerHeight + imageHeight + footerHeight + cardPadding * 2;
  const pageHeaderHeight = exportOptions.showHeader && (exportOptions.headerTitle || exportOptions.headerSubtitle) ? 92 : 0;
  const canvasWidth = exportOptions.padding * 2 + columns * cellWidth + (columns - 1) * exportOptions.gap;
  const canvasHeight = exportOptions.padding * 2 + pageHeaderHeight + (pageHeaderHeight > 0 ? exportOptions.gap : 0) + rows * cardHeight + (rows - 1) * exportOptions.gap;

  if (canvasWidth > MAX_EXPORT_CANVAS_DIMENSION || canvasHeight > MAX_EXPORT_CANVAS_DIMENSION || canvasWidth * canvasHeight > MAX_EXPORT_CANVAS_PIXELS) {
    throw new Error('导出画布尺寸过大，请减少列数、图片数量或降低内容规模后重试');
  }

  return {
    columns,
    rows,
    cellWidth,
    imageHeight,
    numberBadge,
    cardPadding,
    headerHeight,
    footerHeight,
    cardHeight,
    pageHeaderHeight,
    canvasWidth,
    canvasHeight,
    isStoryboardMetaMode,
  };
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

export async function buildStoryboardExportInWorker(
  input: BuildStoryboardExportOperationInput,
): Promise<BuildStoryboardExportOperationResult> {
  if (input.items.length === 0) {
    throw new Error('没有可导出的图片');
  }
  if (input.items.length > MAX_EXPORT_ITEMS) {
    throw new Error(`单次导出最多支持 ${MAX_EXPORT_ITEMS} 张图片，请分批导出`);
  }

  const decodedItems: DecodedStoryboardExportItem[] = await Promise.all(input.items.map(async (item) => {
    const decoded = await decodeWorkerImage(item.buffer, item.mime);
    return { ...item, decoded };
  }));

  try {
    const totalSourcePixels = decodedItems.reduce((sum, item) => sum + item.decoded.width * item.decoded.height, 0);
    if (totalSourcePixels > MAX_EXPORT_TOTAL_SOURCE_PIXELS) {
      throw new Error('导出内容过大，请减少图片数量或先缩小素材后再导出');
    }

    const options = input.options;
    const maxBitmapWidth = Math.max(...decodedItems.map((item) => item.decoded.width));
    const maxBitmapHeight = Math.max(...decodedItems.map((item) => item.decoded.height));
    const layout = resolveStoryboardExportLayout({
      itemCount: decodedItems.length,
      maxBitmapWidth,
      maxBitmapHeight,
      exportOptions: options,
    });
    const theme = getExportTheme(options.exportStyle);

    const canvas = new OffscreenCanvas(layout.canvasWidth, layout.canvasHeight);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建分镜表画布');
    }

    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

    if (layout.pageHeaderHeight > 0) {
      const headerX = options.padding;
      const headerY = options.padding;
      const headerWidth = layout.canvasWidth - options.padding * 2;
      drawRoundedRect(context, headerX, headerY, headerWidth, layout.pageHeaderHeight, options.exportStyle === 'worksheet' ? 14 : 18);
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
      const row = Math.floor(index / layout.columns);
      const col = index % layout.columns;
      const x = options.padding + col * (layout.cellWidth + options.gap);
      const y = options.padding + layout.pageHeaderHeight + (layout.pageHeaderHeight > 0 ? options.gap : 0) + row * (layout.cardHeight + options.gap);
      const bitmap = item.decoded;

      context.shadowColor = `rgba(15,23,42,${theme.shadowAlpha})`;
      context.shadowBlur = options.exportStyle === 'worksheet' ? 8 : 18;
      context.shadowOffsetY = options.exportStyle === 'worksheet' ? 4 : 10;
      context.fillStyle = layout.isStoryboardMetaMode ? theme.cardFill : 'rgba(255,255,255,0.92)';
      context.strokeStyle = layout.isStoryboardMetaMode ? theme.cardStroke : 'rgba(15,23,42,0.08)';
      context.lineWidth = 1;
      drawRoundedRect(context, x, y, layout.cellWidth, layout.cardHeight, 16);
      context.fill();
      context.stroke();
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;

      const imageAreaY = y + layout.cardPadding + layout.headerHeight;
      const imageAreaHeight = layout.imageHeight;
      const fitted = fitContain(bitmap.width, bitmap.height, layout.cellWidth - layout.cardPadding * 2, imageAreaHeight - layout.cardPadding * 2);
      const imageX = x + Math.round((layout.cellWidth - fitted.width) / 2);
      const imageY = imageAreaY + Math.round((imageAreaHeight - fitted.height) / 2);

      if (layout.isStoryboardMetaMode) {
        const shotCode = item.storyboardShotCode?.trim() || `SHOT ${index + 1}`;
        const title = item.displayName?.trim() || item.caption?.trim() || '未命名分镜';

        drawRoundedRect(context, x + layout.cardPadding, y + layout.cardPadding, layout.cellWidth - layout.cardPadding * 2, 34, 12);
        context.fillStyle = theme.headerFill;
        context.fill();

        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillStyle = theme.headerText;
        context.font = `700 12px ${IMAGE_FONT_FAMILY}`;
        context.fillText(truncateText(context, shotCode, 74), x + layout.cardPadding + 12, y + layout.cardPadding + 17);

        context.fillStyle = theme.headerSubtleText;
        context.font = `500 12px ${IMAGE_FONT_FAMILY}`;
        context.fillText(truncateText(context, title, layout.cellWidth - layout.cardPadding * 2 - 94), x + layout.cardPadding + 84, y + layout.cardPadding + 17);
      }

      drawRoundedRect(context, x + layout.cardPadding, imageAreaY + layout.cardPadding, layout.cellWidth - layout.cardPadding * 2, imageAreaHeight - layout.cardPadding * 2, 12);
      context.fillStyle = layout.isStoryboardMetaMode ? theme.imageFill : '#f3f4f6';
      context.fill();
      context.drawImage(bitmap.source, imageX, imageY, fitted.width, fitted.height);

      if (options.showNumbers) {
        context.fillStyle = layout.isStoryboardMetaMode ? theme.badgeFill : '#111827';
        context.beginPath();
        context.arc(x + 20 + layout.numberBadge / 2, y + 20 + layout.numberBadge / 2, layout.numberBadge / 2, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = layout.isStoryboardMetaMode ? theme.badgeText : '#ffffff';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `700 18px ${IMAGE_FONT_FAMILY}`;
        context.fillText(String(index + 1), x + 20 + layout.numberBadge / 2, y + 20 + layout.numberBadge / 2 + 1);
      }

      if (layout.isStoryboardMetaMode) {
        const footerY = y + layout.cardHeight - layout.cardPadding - layout.footerHeight + 8;
        const fieldGap = 8;
        const fieldWidth = (layout.cellWidth - layout.cardPadding * 2 - fieldGap * 2) / 3;
        drawMetaField(context, x + layout.cardPadding, footerY, fieldWidth, '景别', item.storyboardSceneType?.trim() || '未填写', theme);
        drawMetaField(context, x + layout.cardPadding + fieldWidth + fieldGap, footerY, fieldWidth, '运镜', item.storyboardCameraMove?.trim() || '未填写', theme);
        drawMetaField(context, x + layout.cardPadding + (fieldWidth + fieldGap) * 2, footerY, fieldWidth, '时长', item.storyboardDuration?.trim() || '未填写', theme);

        const note = item.storyboardNote?.trim() || item.caption?.trim() || '暂无备注';
        const noteHeight = 48;
        drawRoundedRect(context, x + layout.cardPadding, footerY + 42, layout.cellWidth - layout.cardPadding * 2, noteHeight, 10);
        context.fillStyle = theme.noteFill;
        context.fill();
        context.strokeStyle = theme.noteStroke;
        context.lineWidth = 1;
        context.stroke();

        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillStyle = theme.noteLabel;
        context.font = `600 11px ${IMAGE_FONT_FAMILY}`;
        context.fillText('备注', x + layout.cardPadding + 10, footerY + 48);
        context.fillStyle = theme.noteText;
        context.font = `500 11px ${IMAGE_FONT_FAMILY}`;
        const noteLines = wrapTextLines(context, note, layout.cellWidth - layout.cardPadding * 2 - 54, 2);
        drawMultilineText(context, noteLines, x + layout.cardPadding + 42, footerY + 48, 14);
      } else if (options.captionMode !== 'none') {
        const rawCaption = item.caption?.trim() || '';
        if (rawCaption) {
          context.textAlign = 'left';
          context.textBaseline = 'top';
          context.fillStyle = options.textColor;
          context.font = `500 14px ${IMAGE_FONT_FAMILY}`;
          const captionLines = wrapTextLines(context, rawCaption, layout.cellWidth - layout.cardPadding * 2, 3);
          drawMultilineText(context, captionLines, x + layout.cardPadding, y + layout.imageHeight + layout.cardPadding + 10, 18);
        }
      }
    });

    const resultBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
    const resultBuffer = await resultBlob.arrayBuffer();

    return {
      buffer: resultBuffer,
      mime: resultBlob.type || 'image/png',
    };
  } finally {
    decodedItems.forEach((item) => item.decoded.release());
  }
}
