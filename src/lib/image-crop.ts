import { isWorkerCancelledError, workerCropImage } from './image-worker-bridge';
import { canvasToBlob } from './canvas-utils';
import { MAX_CROP_SOURCE_PIXELS } from './image-processing-constants';
import { decodeCanvasImageFromBlob } from './image-render';
import { clamp } from './number-utils';

export type CropAspectRatioPreset = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropImageOptions {
  aspectRatio: CropAspectRatioPreset;
  zoom: number;
  focusX: number;
  focusY: number;
  cropRect?: CropRect;
  namePrefix?: string;
}

function getAspectRatioValue(preset: CropAspectRatioPreset, fallback: number) {
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

function sanitizeCropRect(rect: CropRect | undefined): CropRect | null {
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

export async function cropImageBlobOnMainThread(
  blob: Blob,
  input: Partial<CropImageOptions>,
): Promise<Blob> {
  const decoded = await decodeCanvasImageFromBlob(blob);

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

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建裁剪画布上下文');
    }

    ctx.drawImage(decoded.source, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return await canvasToBlob(canvas).catch(() => {
      throw new Error('导出裁剪结果失败');
    });
  } finally {
    decoded.release();
  }
}

export async function cropImageBlob(
  blob: Blob,
  input: Partial<CropImageOptions>,
): Promise<Blob> {
  try {
    return await workerCropImage(blob, input);
  } catch (error) {
    if (isWorkerCancelledError(error)) {
      throw error;
    }
    return cropImageBlobOnMainThread(blob, input);
  }
}
