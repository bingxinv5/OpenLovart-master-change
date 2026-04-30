import { drawMultilineText, wrapTextLines } from './image-worker-canvas-drawing';
import { decodeWorkerImage } from './image-worker-image-decode';
import { IMAGE_FONT_FAMILY, MAX_ANNOTATE_SOURCE_PIXELS } from './image-processing-constants';
import { clampMarkerNumber } from './number-utils';

export interface AnnotateImageOperationInput {
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

export interface AnnotateImageOperationResult {
  buffer: ArrayBuffer;
  mime: string;
}

export async function annotateImageInWorker(input: AnnotateImageOperationInput): Promise<AnnotateImageOperationResult> {
  const decoded = await decodeWorkerImage(input.buffer, input.mime);
  const markerNumber = clampMarkerNumber(input.options.markerNumber);
  const label = input.options.label.trim();
  const note = input.options.note?.trim() || '';
  const accentColor = input.options.accentColor || '#7c3aed';

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

    const imageOffsetY = input.options.position === 'top' ? footerHeight : 0;
    const bannerY = input.options.position === 'top' ? 0 : decoded.height;

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
        drawMultilineText(context, titleLines, textStartX, contentStartY, titleLineHeight);
      }

      if (noteLines.length > 0) {
        const noteY = contentStartY + titleBlockHeight + noteGap;
        context.fillStyle = 'rgba(226, 232, 240, 0.95)';
        context.font = `400 ${noteFontSize}px ${IMAGE_FONT_FAMILY}`;
        drawMultilineText(context, noteLines, textStartX, noteY, noteLineHeight);
      }
    }

    const resultBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
    const resultBuffer = await resultBlob.arrayBuffer();

    return {
      buffer: resultBuffer,
      mime: resultBlob.type || 'image/png',
    };
  } finally {
    decoded.release();
  }
}
