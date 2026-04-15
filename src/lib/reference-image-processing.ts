import { bytesToBase64, extractDataUrlBase64, isDataUrl } from './data-url';
import { compressImage } from './image-ops-bridge';

export type ReferenceImageCompressionStep = {
  maxResolution: number;
  quality: number;
};

export const DEFAULT_REFERENCE_IMAGE_TARGET_BYTES = 4 * 1024 * 1024;
export const DEFAULT_REFERENCE_IMAGE_HARD_MAX_BYTES = 10 * 1024 * 1024;

const DEFAULT_REFERENCE_IMAGE_COMPRESSION_STEPS: readonly ReferenceImageCompressionStep[] = [
  { maxResolution: 2560, quality: 0.9 },
  { maxResolution: 2048, quality: 0.85 },
  { maxResolution: 1600, quality: 0.8 },
  { maxResolution: 1280, quality: 0.74 },
  { maxResolution: 1024, quality: 0.68 },
];

export type CompressReferenceImageOptions = {
  targetBytes?: number;
  hardMaxBytes?: number;
  steps?: readonly ReferenceImageCompressionStep[];
  hardMaxMessage?: string;
};

export function estimateBase64Bytes(base64: string) {
  const normalized = base64.replace(/\s+/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

export function estimateDataUrlBytes(dataUrl: string) {
  if (!isDataUrl(dataUrl)) {
    return 0;
  }

  return estimateBase64Bytes(extractDataUrlBase64(dataUrl));
}

function buildDataUrlFromBuffer(buffer: ArrayBuffer, mime: string) {
  return `data:${mime};base64,${bytesToBase64(new Uint8Array(buffer))}`;
}

export async function compressReferenceImageDataUrl(
  dataUrl: string,
  options: CompressReferenceImageOptions = {},
): Promise<string> {
  if (!isDataUrl(dataUrl)) {
    return dataUrl;
  }

  const targetBytes = options.targetBytes ?? DEFAULT_REFERENCE_IMAGE_TARGET_BYTES;
  const hardMaxBytes = options.hardMaxBytes ?? DEFAULT_REFERENCE_IMAGE_HARD_MAX_BYTES;
  const steps = options.steps ?? DEFAULT_REFERENCE_IMAGE_COMPRESSION_STEPS;
  let candidate = dataUrl;

  if (estimateDataUrlBytes(candidate) <= targetBytes) {
    return candidate;
  }

  for (const step of steps) {
    const compressed = await compressImage(candidate, step.maxResolution, step.quality);
    candidate = buildDataUrlFromBuffer(compressed.buffer, compressed.mime);

    if (estimateDataUrlBytes(candidate) <= targetBytes) {
      return candidate;
    }
  }

  if (estimateDataUrlBytes(candidate) > hardMaxBytes) {
    throw new Error(
      options.hardMaxMessage
        ?? `参考图压缩后仍超过 ${(hardMaxBytes / 1024 / 1024).toFixed(0)}MB，请先裁剪或缩小后再试。`,
    );
  }

  return candidate;
}