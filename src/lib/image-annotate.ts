import { isWorkerCancelledError, workerAnnotateImage } from './image-worker-bridge';
import { canvasToBlob } from './canvas-utils';
import { IMAGE_FONT_FAMILY, MAX_ANNOTATE_SOURCE_PIXELS } from './image-processing-constants';
import { decodeCanvasImageFromBlob } from './image-render';
import { clampMarkerNumber } from './number-utils';

export type AnnotateLabelPosition = 'top' | 'bottom';

export interface AnnotateImageOptions {
  label: string;
  note?: string;
  markerNumber?: number;
  position: AnnotateLabelPosition;
  accentColor: string;
  namePrefix?: string;
}

function fitTextWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const normalized = text.trim();
  if (!normalized) return '';
  if (ctx.measureText(normalized).width <= maxWidth) return normalized;

  let result = normalized;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }

  return `${result}…`;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

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
      lines[maxLines - 1] = fitTextWithEllipsis(ctx, lines[maxLines - 1] + normalized.slice(displayedLength), maxWidth);
    }
  }

  return lines.filter(Boolean);
}

export async function annotateImageBlobOnMainThread(
  blob: Blob,
  options: AnnotateImageOptions,
): Promise<Blob> {
  const decoded = await decodeCanvasImageFromBlob(blob);
  const markerNumber = clampMarkerNumber(options.markerNumber);
  const label = options.label.trim();
  const note = options.note?.trim() || '';
  const accentColor = options.accentColor || '#7c3aed';

  try {
    if (decoded.width * decoded.height > MAX_ANNOTATE_SOURCE_PIXELS) {
      throw new Error('原图尺寸过大，请先缩小后再生成标注图');
    }

    const padding = Math.max(24, Math.round(Math.min(decoded.width, decoded.height) * 0.04));
    const badgeSize = Math.max(42, Math.round(Math.min(decoded.width, decoded.height) * 0.12));
    const titleFontSize = Math.max(24, Math.round(decoded.width * 0.045));
    const noteFontSize = Math.max(16, Math.round(decoded.width * 0.026));

    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建标注画布上下文');
    }

    const textStartXBase = padding + (markerNumber ? badgeSize + 18 : 0);
    const textMaxWidth = Math.max(120, decoded.width - textStartXBase - padding);
    const titleLineHeight = Math.round(titleFontSize * 1.18);
    const noteLineHeight = Math.round(noteFontSize * 1.5);

    ctx.font = `700 ${titleFontSize}px ${IMAGE_FONT_FAMILY}`;
    const titleLines = label ? wrapTextLines(ctx, label, textMaxWidth, 2) : [];

    ctx.font = `400 ${noteFontSize}px ${IMAGE_FONT_FAMILY}`;
    const noteLines = note ? wrapTextLines(ctx, note, textMaxWidth, 3) : [];

    const titleBlockHeight = titleLines.length > 0 ? titleLines.length * titleLineHeight : 0;
    const noteGap = titleBlockHeight > 0 && noteLines.length > 0 ? Math.max(8, Math.round(noteFontSize * 0.45)) : 0;
    const noteBlockHeight = noteLines.length > 0 ? noteLines.length * noteLineHeight : 0;
    const footerContentHeight = Math.max(badgeSize, titleBlockHeight + noteGap + noteBlockHeight);
    const footerHeight = titleLines.length > 0 || noteLines.length > 0 ? Math.max(96, padding * 2 + footerContentHeight) : 0;

    canvas.height = decoded.height + footerHeight;

    const imageOffsetY = options.position === 'top' ? footerHeight : 0;
    const bannerY = options.position === 'top' ? 0 : decoded.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(decoded.source, 0, imageOffsetY, decoded.width, decoded.height);

    if (footerHeight > 0) {
      const bannerGradient = ctx.createLinearGradient(0, bannerY, 0, bannerY + footerHeight);
      bannerGradient.addColorStop(0, 'rgba(15, 23, 42, 0.98)');
      bannerGradient.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
      ctx.fillStyle = bannerGradient;
      ctx.fillRect(0, bannerY, canvas.width, footerHeight);

      ctx.fillStyle = accentColor;
      ctx.fillRect(0, bannerY, 14, footerHeight);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(14, bannerY, canvas.width - 14, 1);

      let textStartX = padding;
      if (markerNumber) {
        const badgeX = padding;
        const badgeY = bannerY + Math.round((footerHeight - badgeSize) / 2);
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${Math.round(badgeSize * 0.42)}px ${IMAGE_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(markerNumber), badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1);
        textStartX += badgeSize + 18;
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const contentStartY = bannerY + Math.round((footerHeight - footerContentHeight) / 2);

      if (titleLines.length > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${titleFontSize}px ${IMAGE_FONT_FAMILY}`;
        titleLines.forEach((line, index) => {
          ctx.fillText(line, textStartX, contentStartY + index * titleLineHeight);
        });
      }

      if (noteLines.length > 0) {
        const noteY = contentStartY + titleBlockHeight + noteGap;
        ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
        ctx.font = `400 ${noteFontSize}px ${IMAGE_FONT_FAMILY}`;
        noteLines.forEach((line, index) => {
          ctx.fillText(line, textStartX, noteY + index * noteLineHeight);
        });
      }
    }

    return await canvasToBlob(canvas).catch(() => {
      throw new Error('导出标注结果失败');
    });
  } finally {
    decoded.release();
  }
}

export async function annotateImageBlob(
  blob: Blob,
  options: AnnotateImageOptions,
): Promise<Blob> {
  try {
    return await workerAnnotateImage(blob, options);
  } catch (error) {
    if (isWorkerCancelledError(error)) {
      throw error;
    }
    return annotateImageBlobOnMainThread(blob, options);
  }
}
