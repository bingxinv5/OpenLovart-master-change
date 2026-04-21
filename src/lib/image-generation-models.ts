export type ImageGenerationModelBranch = 'standard' | 'openai-gpt-image' | 'grok' | 'domestic';

const OPENAI_GPT_IMAGE_MODELS = new Set(['gpt-image-2']);
const GROK_IMAGE_MODELS = new Set(['grok-4.2-image', 'grok-4.1-image']);
const DOMESTIC_IMAGE_MODELS = new Set(['doubao-seedream-5-0-260128']);
const EXTENDED_REFERENCE_IMAGE_MODELS = new Set(['gemini-3.1-flash-image-preview', 'nano-banana-2']);
export const DEFAULT_MAX_REFERENCE_IMAGES = 6;
export const EXTENDED_MAX_REFERENCE_IMAGES = 14;
export const STANDARD_IMAGE_SIZE_OPTIONS = ['1K', '2K', '4K'] as const;
export const OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS = ['1:1', '3:2', '2:3', '16:9', '9:16', '21:9'] as const;
// Keep exactly one stable size per supported ratio. Extra explicit sizes still work
// through the experimental input, but do not need dedicated stable presets.
export const OPENAI_GPT_IMAGE_PIXEL_SIZES = [
  '1254x1254',
  '1536x1024',
  '1024x1536',
  '1672x942',
  '942x1672',
  '2240x960',
] as const;

export type StandardImageSize = (typeof STANDARD_IMAGE_SIZE_OPTIONS)[number];
export type OpenAiGptImageAspectRatio = (typeof OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS)[number];
export type OpenAiGptImagePixelSize = (typeof OPENAI_GPT_IMAGE_PIXEL_SIZES)[number];
const OPENAI_GPT_IMAGE_PIXEL_SIZE_PATTERN = /^(\d{2,5})\s*[xX]\s*(\d{2,5})$/;
const OPENAI_GPT_IMAGE_PROMPT_COMPENSATION_PREFIX = 'Composition requirements:';

const OPENAI_GPT_IMAGE_DEFAULT_PIXEL_SIZE_BY_ASPECT_RATIO: Record<OpenAiGptImageAspectRatio, OpenAiGptImagePixelSize> = {
  '1:1': '1254x1254',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '1672x942',
  '9:16': '942x1672',
  '21:9': '2240x960',
};

const OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE: Record<OpenAiGptImagePixelSize, OpenAiGptImageAspectRatio> = {
  '1254x1254': '1:1',
  '1536x1024': '3:2',
  '1024x1536': '2:3',
  '1672x942': '16:9',
  '942x1672': '9:16',
  '2240x960': '21:9',
};

const OPENAI_GPT_IMAGE_LANDSCAPE_ASPECT_RATIOS = new Set(['4:3', '16:9', '3:2', '5:4', '21:9']);
const OPENAI_GPT_IMAGE_PORTRAIT_ASPECT_RATIOS = new Set(['3:4', '9:16', '2:3', '4:5', '9:21']);

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

export function isStandardImageSize(value: unknown): value is StandardImageSize {
  return isNonEmptyString(value)
    && STANDARD_IMAGE_SIZE_OPTIONS.includes(value as StandardImageSize);
}

export function isOpenAiGptImagePixelSize(value: unknown): value is OpenAiGptImagePixelSize {
  return isNonEmptyString(value)
    && OPENAI_GPT_IMAGE_PIXEL_SIZES.includes(value as OpenAiGptImagePixelSize);
}

export function normalizeOpenAiGptImagePixelSize(value: unknown): string | undefined {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const match = value.trim().match(OPENAI_GPT_IMAGE_PIXEL_SIZE_PATTERN);
  if (!match) {
    return undefined;
  }

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    return undefined;
  }

  if (width < 64 || width > 99999 || height < 64 || height > 99999) {
    return undefined;
  }

  return `${width}x${height}`;
}

function greatestCommonDivisor(left: number, right: number): number {
  let currentLeft = Math.abs(left);
  let currentRight = Math.abs(right);

  while (currentRight !== 0) {
    const remainder = currentLeft % currentRight;
    currentLeft = currentRight;
    currentRight = remainder;
  }

  return currentLeft || 1;
}

function describeNormalizedOpenAiGptImageAspectRatio(normalizedImageSize: string): string {
  const [widthText, heightText] = normalizedImageSize.split('x');
  const width = Number.parseInt(widthText, 10);
  const height = Number.parseInt(heightText, 10);
  const divisor = greatestCommonDivisor(width, height);
  const normalizedRatio = `${width / divisor}:${height / divisor}`;

  if (normalizedRatio === '7:3') {
    return '21:9';
  }

  return normalizedRatio;
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

export function isOpenAiGptImageModel(model: unknown): model is string {
  return isNonEmptyString(model) && OPENAI_GPT_IMAGE_MODELS.has(model);
}

export function isSelectableOpenAiGptImageAspectRatio(
  aspectRatio: unknown,
): aspectRatio is (typeof OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS)[number] {
  return isNonEmptyString(aspectRatio)
    && OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS.includes(
      aspectRatio as (typeof OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS)[number],
    );
}

export function isDomesticImageModel(model: unknown): model is string {
  return isNonEmptyString(model) && DOMESTIC_IMAGE_MODELS.has(model);
}

export function getImageGenerationModelBranch(model: unknown): ImageGenerationModelBranch {
  if (isGrokImageModel(model)) {
    return 'grok';
  }

  if (isOpenAiGptImageModel(model)) {
    return 'openai-gpt-image';
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
  if (!isGrokImageModel(model) || !isStandardImageSize(imageSize)) {
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

  if (branch === 'openai-gpt-image') {
    return false;
  }

  return aspectRatio !== 'auto';
}

export function resolveOpenAiGptImagePixelSize(
  imageSize: unknown,
  aspectRatio: unknown,
): string {
  const normalizedImageSize = normalizeOpenAiGptImagePixelSize(imageSize);
  if (normalizedImageSize) {
    return normalizedImageSize;
  }

  if (isSelectableOpenAiGptImageAspectRatio(aspectRatio)) {
    return OPENAI_GPT_IMAGE_DEFAULT_PIXEL_SIZE_BY_ASPECT_RATIO[aspectRatio];
  }

  if (isNonEmptyString(aspectRatio) && OPENAI_GPT_IMAGE_LANDSCAPE_ASPECT_RATIOS.has(aspectRatio)) {
    return '1536x1024';
  }

  if (isNonEmptyString(aspectRatio) && OPENAI_GPT_IMAGE_PORTRAIT_ASPECT_RATIOS.has(aspectRatio)) {
    return '1024x1536';
  }

  return '1254x1254';
}

export function resolveOpenAiGptImageAspectRatio(
  imageSize: unknown,
  fallbackAspectRatio?: unknown,
): OpenAiGptImageAspectRatio {
  if (isOpenAiGptImagePixelSize(imageSize)) {
    return OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE[imageSize];
  }

  const normalizedImageSize = normalizeOpenAiGptImagePixelSize(imageSize);
  if (normalizedImageSize) {
    const normalizedAspectRatio = describeNormalizedOpenAiGptImageAspectRatio(normalizedImageSize);
    if (isSelectableOpenAiGptImageAspectRatio(normalizedAspectRatio)) {
      return normalizedAspectRatio;
    }
  }

  if (isSelectableOpenAiGptImageAspectRatio(fallbackAspectRatio)) {
    return fallbackAspectRatio;
  }

  const fallbackPixelSize = resolveOpenAiGptImagePixelSize(undefined, fallbackAspectRatio);
  if (isOpenAiGptImagePixelSize(fallbackPixelSize)) {
    return OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE[fallbackPixelSize];
  }

  return '1:1';
}

export function describeOpenAiGptImageAspectRatio(
  imageSize: unknown,
  fallbackAspectRatio?: unknown,
): string {
  if (isOpenAiGptImagePixelSize(imageSize)) {
    return OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE[imageSize];
  }

  const normalizedImageSize = normalizeOpenAiGptImagePixelSize(imageSize);
  if (!normalizedImageSize) {
    return resolveOpenAiGptImageAspectRatio(imageSize, fallbackAspectRatio);
  }

  if (isOpenAiGptImagePixelSize(normalizedImageSize)) {
    return OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE[normalizedImageSize];
  }

  return describeNormalizedOpenAiGptImageAspectRatio(normalizedImageSize);
}

export function getOpenAiGptImagePromptCompensation(
  imageSize: unknown,
  fallbackAspectRatio?: unknown,
  hasReferenceImages: boolean = false,
): string {
  const targetPixelSize = resolveOpenAiGptImagePixelSize(imageSize, fallbackAspectRatio);
  const targetAspectRatio = describeOpenAiGptImageAspectRatio(targetPixelSize, fallbackAspectRatio);

  if (hasReferenceImages) {
    return `${OPENAI_GPT_IMAGE_PROMPT_COMPENSATION_PREFIX} preserve the reference subject and style, but prioritize a ${targetAspectRatio} frame on a ${targetPixelSize} canvas. Do not crop, pad, expand, or reframe the scene into a different aspect ratio.`;
  }

  return `${OPENAI_GPT_IMAGE_PROMPT_COMPENSATION_PREFIX} prioritize a ${targetAspectRatio} frame on a ${targetPixelSize} canvas. Do not crop, pad, expand, or reframe the scene into a different aspect ratio.`;
}

export function buildOpenAiGptImagePrompt(
  prompt: string,
  imageSize: unknown,
  fallbackAspectRatio?: unknown,
  hasReferenceImages: boolean = false,
): string {
  if (!isNonEmptyString(prompt)) {
    return prompt;
  }

  if (prompt.includes(OPENAI_GPT_IMAGE_PROMPT_COMPENSATION_PREFIX)) {
    return prompt;
  }

  return `${prompt.trimEnd()}\n\n${getOpenAiGptImagePromptCompensation(imageSize, fallbackAspectRatio, hasReferenceImages)}`;
}

export function shouldSendImageSize(model: unknown, imageSize: unknown): imageSize is string {
  if (!isStandardImageSize(imageSize)) {
    return false;
  }

  return getImageGenerationModelBranch(model) === 'standard';
}

function applyUnifiedImageGenerationFields(
  body: Record<string, unknown>,
  input: BuildUpstreamImageGenerationBodyInput,
  referenceImageCount: number,
  generateCount: number | undefined,
): void {
  if (shouldSendAspectRatio(input.model, input.aspectRatio, referenceImageCount > 0)) {
    body.aspect_ratio = input.aspectRatio;
  }

  if (shouldSendImageSize(input.model, input.imageSize)) {
    body.image_size = input.imageSize;
  }

  if (generateCount && generateCount > 1) {
    body.n = generateCount;
  }
}

function applyOpenAiGptImageGenerationFields(
  body: Record<string, unknown>,
  input: BuildUpstreamImageGenerationBodyInput,
  referenceImageCount: number,
  generateCount: number | undefined,
): void {
  // The gateway accepts GPT Image requests more reliably when we send a
  // stable explicit pixel size instead of abstract size/aspect-ratio hints.
  const targetPixelSize = resolveOpenAiGptImagePixelSize(input.imageSize, input.aspectRatio);
  body.prompt = buildOpenAiGptImagePrompt(
    input.prompt,
    targetPixelSize,
    input.aspectRatio,
    referenceImageCount > 0,
  );
  body.size = targetPixelSize;

  if (generateCount && generateCount > 1) {
    body.n = generateCount;
  }
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
    if (isStandardImageSize(input.imageSize)) {
      body.size = input.imageSize;
    }

    if (generateCount && generateCount > 1) {
      body.n = generateCount;
      body.sequential_image_generation = 'auto';
    }

    if (typeof input.watermark === 'boolean') {
      body.watermark = input.watermark;
    }
  } else if (branch === 'openai-gpt-image') {
    applyOpenAiGptImageGenerationFields(body, input, referenceImages.length, generateCount);
  } else {
    applyUnifiedImageGenerationFields(body, input, referenceImages.length, generateCount);
  }

  return body;
}