import { MAX_CROP_SOURCE_PIXELS } from './image-processing-constants';
import { clamp } from './number-utils';
import { decodeWorkerImage } from './image-worker-image-decode';

export type CropAspectRatio = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export interface CropRectMsg {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropImageOperationInput {
  buffer: ArrayBuffer;
  mime: string;
  aspectRatio: CropAspectRatio;
  zoom: number;
  focusX: number;
  focusY: number;
  cropRect?: CropRectMsg;
}

export interface CropImageOperationResult {
  buffer: ArrayBuffer;
  mime: string;
  width: number;
  height: number;
}

export interface CropSourceRect {
  sourceX: number;
  sourceY: number;
  width: number;
  height: number;
}

export function getAspectRatioValue(
  preset: CropAspectRatio,
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

export function sanitizeCropRect(rect: CropRectMsg | undefined): CropRectMsg | null {
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

export function resolveCropSourceRect(options: {
  sourceWidth: number;
  sourceHeight: number;
  aspectRatio: CropAspectRatio;
  zoom: number;
  focusX: number;
  focusY: number;
  cropRect?: CropRectMsg;
}): CropSourceRect {
  const normalizedRect = sanitizeCropRect(options.cropRect);
  const fallbackRatio = options.sourceWidth / Math.max(1, options.sourceHeight);
  const aspectRatio = getAspectRatioValue(options.aspectRatio, fallbackRatio);
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = options.sourceWidth;
  let cropHeight = options.sourceHeight;

  if (normalizedRect) {
    sourceX = Math.round(clamp(normalizedRect.x * options.sourceWidth, 0, options.sourceWidth - 1));
    sourceY = Math.round(clamp(normalizedRect.y * options.sourceHeight, 0, options.sourceHeight - 1));
    cropWidth = Math.round(clamp(normalizedRect.width * options.sourceWidth, 1, options.sourceWidth - sourceX));
    cropHeight = Math.round(clamp(normalizedRect.height * options.sourceHeight, 1, options.sourceHeight - sourceY));
  } else {
    const zoom = clamp(options.zoom, 10, 100);
    const focusX = clamp(options.focusX, -100, 100);
    const focusY = clamp(options.focusY, -100, 100);
    const scale = zoom / 100;
    cropWidth = Math.round(options.sourceWidth * scale);
    cropHeight = Math.round(cropWidth / aspectRatio);

    if (cropHeight > options.sourceHeight * scale) {
      cropHeight = Math.round(options.sourceHeight * scale);
      cropWidth = Math.round(cropHeight * aspectRatio);
    }

    cropWidth = Math.min(options.sourceWidth, Math.max(1, cropWidth));
    cropHeight = Math.min(options.sourceHeight, Math.max(1, cropHeight));

    const remainingX = Math.max(0, options.sourceWidth - cropWidth);
    const remainingY = Math.max(0, options.sourceHeight - cropHeight);
    const offsetX = ((focusX + 100) / 200) * remainingX;
    const offsetY = ((focusY + 100) / 200) * remainingY;
    sourceX = Math.round(clamp(offsetX, 0, remainingX));
    sourceY = Math.round(clamp(offsetY, 0, remainingY));
  }

  return {
    sourceX,
    sourceY,
    width: cropWidth,
    height: cropHeight,
  };
}

export async function cropImageInWorker(input: CropImageOperationInput): Promise<CropImageOperationResult> {
  const decoded = await decodeWorkerImage(input.buffer, input.mime);

  try {
    if (decoded.width * decoded.height > MAX_CROP_SOURCE_PIXELS) {
      throw new Error('原图尺寸过大，请先缩小或切分后再裁剪');
    }

    const crop = resolveCropSourceRect({
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      aspectRatio: input.aspectRatio,
      zoom: input.zoom,
      focusX: input.focusX,
      focusY: input.focusY,
      cropRect: input.cropRect,
    });

    const canvas = new OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建裁剪画布上下文');
    }

    context.drawImage(decoded.source, crop.sourceX, crop.sourceY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const resultBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
    const resultBuffer = await resultBlob.arrayBuffer();

    return {
      buffer: resultBuffer,
      mime: resultBlob.type || 'image/png',
      width: crop.width,
      height: crop.height,
    };
  } finally {
    decoded.release();
  }
}
