export type ImageGenerationModelBranch = 'standard' | 'grok' | 'domestic';

const GROK_IMAGE_MODELS = new Set(['grok-4.2-image', 'grok-4.1-image']);
const DOMESTIC_IMAGE_MODELS = new Set(['doubao-seedream-5-0-260128']);
const EXTENDED_REFERENCE_IMAGE_MODELS = new Set(['gemini-3.1-flash-image-preview', 'nano-banana-2']);
export const DEFAULT_MAX_REFERENCE_IMAGES = 6;
export const EXTENDED_MAX_REFERENCE_IMAGES = 14;

const GROK_SUPPORTED_ASPECT_RATIOS = new Set([
  'auto',
  '1:1',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
  '2:3',
  '3:2',
  '2:1',
  '1:2',
  '20:9',
  '9:20',
  '19.5:9',
  '9:19.5',
]);

export type BuildUpstreamImageGenerationBodyInput = {
  model: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  referenceImages?: string[];
  generateCount?: number;
  responseFormat?: string;
  watermark?: boolean;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeGenerateCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  if (normalized < 1 || normalized > 10) {
    return undefined;
  }

  return normalized;
}

export function isGrokImageModel(model: unknown): model is string {
  return isNonEmptyString(model) && GROK_IMAGE_MODELS.has(model);
}

export function isDomesticImageModel(model: unknown): model is string {
  return isNonEmptyString(model) && DOMESTIC_IMAGE_MODELS.has(model);
}

export function getImageGenerationModelBranch(model: unknown): ImageGenerationModelBranch {
  if (isGrokImageModel(model)) {
    return 'grok';
  }

  if (isDomesticImageModel(model)) {
    return 'domestic';
  }

  return 'standard';
}

export function shouldUseDomesticImageBatching(model: unknown): boolean {
  return getImageGenerationModelBranch(model) === 'domestic';
}

export function getMaxReferenceImagesForImageModel(model: unknown): number {
  return isNonEmptyString(model) && EXTENDED_REFERENCE_IMAGE_MODELS.has(model)
    ? EXTENDED_MAX_REFERENCE_IMAGES
    : DEFAULT_MAX_REFERENCE_IMAGES;
}

export function resolveGrokResolution(model: unknown, imageSize: unknown): '1k' | '2k' | undefined {
  if (!isGrokImageModel(model) || !isNonEmptyString(imageSize)) {
    return undefined;
  }

  if (imageSize === '1K') {
    return '1k';
  }

  if (imageSize === '2K' || imageSize === '4K') {
    return '2k';
  }

  return undefined;
}

export function shouldSendAspectRatio(
  model: unknown,
  aspectRatio: unknown,
  hasReferenceImages: boolean,
): aspectRatio is string {
  if (!isNonEmptyString(aspectRatio)) {
    return false;
  }

  const branch = getImageGenerationModelBranch(model);
  if (branch === 'domestic') {
    return false;
  }

  if (branch === 'grok') {
    return !hasReferenceImages && GROK_SUPPORTED_ASPECT_RATIOS.has(aspectRatio);
  }

  return aspectRatio !== 'auto';
}

export function shouldSendImageSize(model: unknown, imageSize: unknown): imageSize is string {
  if (!isNonEmptyString(imageSize)) {
    return false;
  }

  return getImageGenerationModelBranch(model) === 'standard' && ['1K', '2K', '4K'].includes(imageSize);
}

export function buildUpstreamImageGenerationBody(
  input: BuildUpstreamImageGenerationBodyInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    response_format: input.responseFormat ?? 'url',
  };

  const referenceImages = input.referenceImages?.filter(isNonEmptyString) ?? [];
  if (referenceImages.length > 0) {
    body.image = referenceImages;
  }

  const branch = getImageGenerationModelBranch(input.model);
  const generateCount = normalizeGenerateCount(input.generateCount);

  if (branch === 'grok') {
    if (shouldSendAspectRatio(input.model, input.aspectRatio, referenceImages.length > 0)) {
      body.aspect_ratio = input.aspectRatio;
    }

    const grokResolution = resolveGrokResolution(input.model, input.imageSize);
    if (grokResolution) {
      body.resolution = grokResolution;
    }
  } else if (branch === 'domestic') {
    if (isNonEmptyString(input.imageSize) && ['1K', '2K', '4K'].includes(input.imageSize)) {
      body.size = input.imageSize;
    }

    if (generateCount && generateCount > 1) {
      body.n = generateCount;
      body.sequential_image_generation = 'auto';
    }

    if (typeof input.watermark === 'boolean') {
      body.watermark = input.watermark;
    }
  } else {
    if (shouldSendAspectRatio(input.model, input.aspectRatio, referenceImages.length > 0)) {
      body.aspect_ratio = input.aspectRatio;
    }

    if (shouldSendImageSize(input.model, input.imageSize)) {
      body.image_size = input.imageSize;
    }

    if (generateCount && generateCount > 1) {
      body.n = generateCount;
    }
  }

  return body;
}