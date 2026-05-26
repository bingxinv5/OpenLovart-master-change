export interface CanvasMediaDimensionSource {
  type?: string;
  width?: number;
  height?: number;
  mediaNaturalWidth?: number;
  mediaNaturalHeight?: number;
  selectedImageSize?: string;
  selectedAspectRatio?: string;
  selectedResolution?: string;
}

export type MediaToolbarDimensionSource = 'natural' | 'selected-image-size' | 'selected-video-resolution' | 'canvas';

export interface MediaToolbarDimensions {
  width: number;
  height: number;
  source: MediaToolbarDimensionSource;
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.max(1, Math.round(value));
}

function toDimensionPair(width: unknown, height: unknown): { width: number; height: number } | null {
  const resolvedWidth = toPositiveInteger(width);
  const resolvedHeight = toPositiveInteger(height);
  return resolvedWidth !== null && resolvedHeight !== null
    ? { width: resolvedWidth, height: resolvedHeight }
    : null;
}

function roundToEven(value: number): number {
  const rounded = Math.max(1, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function parsePixelDimensions(value: unknown): { width: number; height: number } | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{2,5})\s*[xX×]\s*(\d{2,5})$/);
  if (!match) {
    return null;
  }

  return toDimensionPair(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
}

function parseAspectRatio(value: unknown): { width: number; height: number } | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
  if (!match) {
    return null;
  }

  return toDimensionPair(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
}

export function resolveVideoResolutionPixelDimensions(
  resolution: unknown,
  aspectRatio: unknown,
): { width: number; height: number } | null {
  if (typeof resolution !== 'string') {
    return null;
  }

  const resolutionMatch = resolution.trim().match(/^(\d{3,4})p$/i);
  if (!resolutionMatch) {
    return null;
  }

  const base = Number.parseInt(resolutionMatch[1], 10);
  if (!Number.isSafeInteger(base) || base <= 0) {
    return null;
  }

  const ratio = parseAspectRatio(aspectRatio) ?? { width: 16, height: 9 };
  if (ratio.width >= ratio.height) {
    return {
      width: roundToEven(base * ratio.width / ratio.height),
      height: base,
    };
  }

  return {
    width: base,
    height: roundToEven(base * ratio.height / ratio.width),
  };
}

export function getMediaToolbarDimensions(element: CanvasMediaDimensionSource): MediaToolbarDimensions {
  const natural = toDimensionPair(element.mediaNaturalWidth, element.mediaNaturalHeight);
  if (natural) {
    return { ...natural, source: 'natural' };
  }

  if (element.type === 'image') {
    const selectedSize = parsePixelDimensions(element.selectedImageSize);
    if (selectedSize) {
      return { ...selectedSize, source: 'selected-image-size' };
    }
  }

  if (element.type === 'video') {
    const selectedVideoSize = resolveVideoResolutionPixelDimensions(element.selectedResolution, element.selectedAspectRatio);
    if (selectedVideoSize) {
      return { ...selectedVideoSize, source: 'selected-video-resolution' };
    }
  }

  const canvas = toDimensionPair(element.width, element.height) ?? { width: 0, height: 0 };
  return { ...canvas, source: 'canvas' };
}