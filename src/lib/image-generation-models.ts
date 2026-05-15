export type ImageGenerationModelBranch = 'standard' | 'openai-gpt-image' | 'grok' | 'domestic';

const OPENAI_GPT_IMAGE_MODELS = new Set(['gpt-image-2', 'gpt-image-2-pro']);
const GROK_IMAGE_MODELS = new Set(['grok-4.2-image', 'grok-4.1-image', 'grok-4-2-image']);
const DOMESTIC_IMAGE_MODELS = new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128']);
const GEMINI_NATIVE_IMAGE_MODELS = new Set([
  'gemini-3-pro-image',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image-preview',
  'gemini-3.1-flash-image-preview',
  'nano-banana-pro',
  'nano-banana-2',
]);
const EXTENDED_REFERENCE_IMAGE_MODELS = new Set([...GEMINI_NATIVE_IMAGE_MODELS].filter((model) => model !== 'nano-banana-pro'));
export const DEFAULT_MAX_REFERENCE_IMAGES = 6;
export const EXTENDED_MAX_REFERENCE_IMAGES = 14;
export const STANDARD_IMAGE_SIZE_OPTIONS = ['1K', '2K', '4K'] as const;
export const MAGICAPI_IMAGE_ASPECT_RATIO_OPTIONS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'] as const;
export const MAGICAPI_GPT_IMAGE_ASPECT_RATIO_OPTIONS = [...MAGICAPI_IMAGE_ASPECT_RATIO_OPTIONS, '9:21'] as const;
export const OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '4:5', '5:4', '21:9', '9:21'] as const;
export const OPENAI_GPT_IMAGE_QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'] as const;
export const OPENAI_GPT_IMAGE_AUTO_SIZE = 'auto';
// Official docs now allow any legal explicit size. Keep a curated preset list
// for the UI, while still accepting other valid sizes through the experimental input.
export const OPENAI_GPT_IMAGE_PIXEL_SIZES = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '1536x1152',
  '1152x1536',
  '1600x1280',
  '1280x1600',
  '2048x2048',
  '2048x1152',
  '1152x2048',
  '2240x960',
  '960x2240',
  '3840x2160',
  '2160x3840',
] as const;
export const OPENAI_GPT_IMAGE_SIZE_OPTIONS = [OPENAI_GPT_IMAGE_AUTO_SIZE, ...OPENAI_GPT_IMAGE_PIXEL_SIZES] as const;
export const MAGICAPI_GPT_IMAGE_SIZE_OPTIONS = [
  '1024x1024',
  '1536x1152',
  '1024x1536',
  '1536x1024',
  '1920x1080',
  '1080x1920',
  '2048x2048',
  '2048x1536',
  '2560x1712',
  '1712x2560',
  '2048x1152',
  '1152x2048',
  '2240x960',
  '960x2240',
  '2880x2880',
  '3840x2880',
  '3840x2560',
  '2560x3840',
  '3840x2160',
  '2160x3840',
] as const;
export const MAGICAPI_GPT_IMAGE_2_SIZE_OPTIONS = [
  '1024x1024',
  '1536x1152',
  '1536x1024',
  '1024x1536',
  '1920x1080',
  '1080x1920',
  '2048x2048',
  '2048x1536',
  '2560x1712',
  '1712x2560',
  '2048x1152',
  '1152x2048',
  '2240x960',
  '960x2240',
  '2880x2880',
  '3840x2880',
  '3840x2560',
  '2560x3840',
  '3840x2160',
  '2160x3840',
] as const;
export const MAGICAPI_GPT_IMAGE_2_PRO_SIZE_OPTIONS = [
  '2048x2048',
  '2048x1536',
  '2560x1712',
  '1712x2560',
  '2048x1152',
  '1152x2048',
  '2240x960',
  '960x2240',
  '2880x2880',
  '3840x2880',
  '3840x2560',
  '2560x3840',
  '3840x2160',
  '2160x3840',
] as const;
export const JIEKOU_IMAGE_ASPECT_RATIO_OPTIONS = ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
export const JIEKOU_NANO_BANANA_SIZE_OPTIONS = ['1x1', '2x3', '3x2', '3x4', '4x3', '4x5', '5x4', '9x16', '16x9', '21x9'] as const;
export const JIEKOU_GPT_IMAGE_SIZE_OPTIONS = [
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '2048x2048',
  '2048x1152',
  '3840x2160',
  '2160x3840',
] as const;

export type StandardImageSize = (typeof STANDARD_IMAGE_SIZE_OPTIONS)[number];
export type OpenAiGptImageAspectRatio = (typeof OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS)[number];
export type OpenAiGptImageQuality = (typeof OPENAI_GPT_IMAGE_QUALITY_OPTIONS)[number];
export type OpenAiGptImagePixelSize = (typeof OPENAI_GPT_IMAGE_PIXEL_SIZES)[number];
export type OpenAiGptImageSize = (typeof OPENAI_GPT_IMAGE_SIZE_OPTIONS)[number];
export type MagicApiImageAspectRatio = (typeof MAGICAPI_IMAGE_ASPECT_RATIO_OPTIONS)[number];
export type MagicApiGptImageAspectRatio = (typeof MAGICAPI_GPT_IMAGE_ASPECT_RATIO_OPTIONS)[number];
export type MagicApiGptImageSize = (typeof MAGICAPI_GPT_IMAGE_SIZE_OPTIONS)[number];
export type JieKouImageAspectRatio = (typeof JIEKOU_IMAGE_ASPECT_RATIO_OPTIONS)[number];
export type JieKouNanoBananaSize = (typeof JIEKOU_NANO_BANANA_SIZE_OPTIONS)[number];
export type JieKouGptImageSize = (typeof JIEKOU_GPT_IMAGE_SIZE_OPTIONS)[number];
const OPENAI_GPT_IMAGE_PIXEL_SIZE_PATTERN = /^(\d{2,5})\s*[xX]\s*(\d{2,5})$/;
const OPENAI_GPT_IMAGE_PROMPT_COMPENSATION_PREFIX = 'Composition requirements:';
const OPENAI_GPT_IMAGE_MAX_EDGE = 3840;
const OPENAI_GPT_IMAGE_MIN_PIXELS = 655_360;
const OPENAI_GPT_IMAGE_MAX_PIXELS = 8_294_400;
const OPENAI_GPT_IMAGE_MAX_EDGE_RATIO = 3;

const OPENAI_GPT_IMAGE_DEFAULT_PIXEL_SIZE_BY_ASPECT_RATIO: Record<OpenAiGptImageAspectRatio, OpenAiGptImagePixelSize> = {
  '1:1': '1024x1024',
  '4:3': '1536x1152',
  '3:4': '1152x1536',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '4:5': '1280x1600',
  '5:4': '1600x1280',
  '21:9': '2240x960',
  '9:21': '960x2240',
};

const OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE: Record<string, OpenAiGptImageAspectRatio> = {
  '1024x1024': '1:1',
  '1536x1024': '3:2',
  '1024x1536': '2:3',
  '1536x1152': '4:3',
  '1152x1536': '3:4',
  '1600x1280': '5:4',
  '1280x1600': '4:5',
  '2048x2048': '1:1',
  '2048x1152': '16:9',
  '1152x2048': '9:16',
  '2560x1712': '3:2',
  '1712x2560': '2:3',
  '2240x960': '21:9',
  '960x2240': '9:21',
  '3840x2160': '16:9',
  '2160x3840': '9:16',
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

const MAGICAPI_GPT_IMAGE_SIZE_SET = new Set<string>(MAGICAPI_GPT_IMAGE_SIZE_OPTIONS);
const MAGICAPI_GPT_IMAGE_2_OFFICIAL_SIZES = new Set<string>([
  '1024x1024',
  '1536x1024',
  '1024x1536',
]);
const MAGICAPI_GPT_IMAGE_2_PRO_OFFICIAL_SIZES = new Set<string>([
  ...MAGICAPI_GPT_IMAGE_2_OFFICIAL_SIZES,
  '2048x2048',
  '2048x1152',
  '3840x2160',
  '2160x3840',
]);
const JIEKOU_GPT_IMAGE_SIZE_SET = new Set<string>(JIEKOU_GPT_IMAGE_SIZE_OPTIONS);

export const MAGICAPI_GPT_IMAGE_SIZE_BY_ASPECT_RATIO: Record<MagicApiGptImageAspectRatio, MagicApiGptImageSize> = {
  '1:1': '1024x1024',
  '4:3': '1536x1152',
  '3:4': '1024x1536',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '1920x1080',
  '9:16': '1080x1920',
  '21:9': '2240x960',
  '9:21': '960x2240',
};

export const MAGICAPI_GPT_IMAGE_2_PRO_SIZE_BY_ASPECT_RATIO: Partial<Record<MagicApiGptImageAspectRatio, MagicApiGptImageSize>> = {
  '1:1': '2048x2048',
  '4:3': '2048x1536',
  '3:2': '2560x1712',
  '2:3': '1712x2560',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '21:9': '2240x960',
  '9:21': '960x2240',
};

export const JIEKOU_GPT_IMAGE_SIZE_BY_ASPECT_RATIO: Record<JieKouImageAspectRatio, JieKouGptImageSize> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '3:4': '1024x1536',
  '4:3': '1536x1024',
  '4:5': '1024x1536',
  '5:4': '1536x1024',
  '9:16': '2160x3840',
  '16:9': '3840x2160',
  '21:9': '3840x2160',
};

export const MAGICAPI_DOUBAO_SIZE_BY_ASPECT_RATIO: Record<MagicApiImageAspectRatio, string> = {
  '1:1': '2048x2048',
  '4:3': '2304x1728',
  '3:4': '1728x2304',
  '16:9': '2560x1440',
  '9:16': '1440x2560',
  '3:2': '2496x1664',
  '2:3': '1664x2496',
  '21:9': '3024x1296',
};

export const MAGICAPI_GROK_SIZE_BY_ASPECT_RATIO: Record<MagicApiImageAspectRatio, string> = {
  ...MAGICAPI_DOUBAO_SIZE_BY_ASPECT_RATIO,
};

export type BuildUpstreamImageGenerationBodyInput = {
  model: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  quality?: string;
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

export function isOpenAiGptImageAutoSize(value: unknown): value is typeof OPENAI_GPT_IMAGE_AUTO_SIZE {
  return isNonEmptyString(value) && value.trim().toLowerCase() === OPENAI_GPT_IMAGE_AUTO_SIZE;
}

export function isOpenAiGptImageSize(value: unknown): value is OpenAiGptImageSize {
  return isOpenAiGptImageAutoSize(value) || isOpenAiGptImagePixelSize(value);
}

export function isMagicApiImageAspectRatio(value: unknown): value is MagicApiImageAspectRatio {
  return isNonEmptyString(value)
    && MAGICAPI_IMAGE_ASPECT_RATIO_OPTIONS.includes(value as MagicApiImageAspectRatio);
}

export function isMagicApiGptImageAspectRatio(value: unknown): value is MagicApiGptImageAspectRatio {
  return isNonEmptyString(value)
    && MAGICAPI_GPT_IMAGE_ASPECT_RATIO_OPTIONS.includes(value as MagicApiGptImageAspectRatio);
}

export function isMagicApiGptImageSize(value: unknown): value is MagicApiGptImageSize {
  return isNonEmptyString(value)
    && MAGICAPI_GPT_IMAGE_SIZE_SET.has(value.trim());
}

export function isJieKouImageAspectRatio(value: unknown): value is JieKouImageAspectRatio {
  return isNonEmptyString(value)
    && JIEKOU_IMAGE_ASPECT_RATIO_OPTIONS.includes(value as JieKouImageAspectRatio);
}

export function isJieKouGptImageSize(value: unknown): value is JieKouGptImageSize {
  return isNonEmptyString(value)
    && JIEKOU_GPT_IMAGE_SIZE_SET.has(value.trim());
}

function parseOpenAiGptImagePixelSize(value: unknown): { normalized: string; width: number; height: number } | undefined {
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

  return {
    normalized: `${width}x${height}`,
    width,
    height,
  };
}

function getOpenAiGptImagePixelSizeValidationErrorFromDimensions(width: number, height: number): string | undefined {
  if (width > OPENAI_GPT_IMAGE_MAX_EDGE || height > OPENAI_GPT_IMAGE_MAX_EDGE) {
    return `最长边不能超过 ${OPENAI_GPT_IMAGE_MAX_EDGE}px`;
  }

  if (width % 16 !== 0 || height % 16 !== 0) {
    return '宽高都必须是 16 的倍数';
  }

  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (shortEdge === 0 || longEdge / shortEdge > OPENAI_GPT_IMAGE_MAX_EDGE_RATIO) {
    return '长边与短边之比不能超过 3:1';
  }

  const totalPixels = width * height;
  if (totalPixels < OPENAI_GPT_IMAGE_MIN_PIXELS || totalPixels > OPENAI_GPT_IMAGE_MAX_PIXELS) {
    return `总像素必须在 ${OPENAI_GPT_IMAGE_MIN_PIXELS.toLocaleString('en-US')} 到 ${OPENAI_GPT_IMAGE_MAX_PIXELS.toLocaleString('en-US')} 之间`;
  }

  return undefined;
}

export function getOpenAiGptImagePixelSizeValidationError(value: unknown): string | undefined {
  const parsed = parseOpenAiGptImagePixelSize(value);
  if (!parsed) {
    return '请输入合法像素尺寸，例如 2048x1152';
  }

  return getOpenAiGptImagePixelSizeValidationErrorFromDimensions(parsed.width, parsed.height);
}

export function normalizeOpenAiGptImagePixelSize(value: unknown): string | undefined {
  const parsed = parseOpenAiGptImagePixelSize(value);
  if (!parsed) {
    return undefined;
  }

  if (getOpenAiGptImagePixelSizeValidationErrorFromDimensions(parsed.width, parsed.height)) {
    return undefined;
  }

  return parsed.normalized;
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

  if (normalizedRatio === '3:7') {
    return '9:21';
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

export function isJieKouGeminiImageModel(model: unknown): model is string {
  return model === 'gemini-3-pro-image';
}

export function isJieKouNanoBananaImageModel(model: unknown): model is string {
  return model === 'nano-banana-2';
}

export function isJieKouGptImageModel(model: unknown): model is string {
  return model === 'gpt-image-2';
}

export function isVApiGeminiImageModel(model: unknown): model is string {
  return model === 'gemini-3.1-flash-image-preview' || model === 'nano-banana-pro';
}

export function isVApiImageModel(model: unknown): model is string {
  return isVApiGeminiImageModel(model) || isOpenAiGptImageModel(model);
}

export function isSelectableOpenAiGptImageAspectRatio(
  aspectRatio: unknown,
): aspectRatio is (typeof OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS)[number] {
  return isNonEmptyString(aspectRatio)
    && OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS.includes(
      aspectRatio as (typeof OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS)[number],
    );
}

export function isOpenAiGptImageQuality(value: unknown): value is OpenAiGptImageQuality {
  return isNonEmptyString(value)
    && OPENAI_GPT_IMAGE_QUALITY_OPTIONS.includes(value as OpenAiGptImageQuality);
}

export function resolveOpenAiGptImageQuality(value: unknown): OpenAiGptImageQuality {
  return isOpenAiGptImageQuality(value) ? value : 'auto';
}

export function isDomesticImageModel(model: unknown): model is string {
  return isNonEmptyString(model) && DOMESTIC_IMAGE_MODELS.has(model);
}

export function isGeminiNativeImageModel(model: unknown): model is string {
  return isNonEmptyString(model) && GEMINI_NATIVE_IMAGE_MODELS.has(model);
}

export function getMagicApiGeminiImageSizeOptions(model: unknown): StandardImageSize[] {
  if (model === 'gemini-3-pro-image-preview' || model === 'gemini-3.1-flash-image-preview' || model === 'nano-banana-pro') {
    return ['1K', '2K', '4K'];
  }

  return ['1K'];
}

export function resolveMagicApiGeminiImageSize(model: unknown, imageSize: unknown): StandardImageSize {
  const options = getMagicApiGeminiImageSizeOptions(model);
  if (isStandardImageSize(imageSize) && options.includes(imageSize)) {
    return imageSize;
  }

  return options[0] || '1K';
}

export function resolveJieKouStandardImageSize(imageSize: unknown): StandardImageSize {
  return isStandardImageSize(imageSize) ? imageSize : '1K';
}

export function resolveJieKouGptImageSize(imageSize: unknown, aspectRatio: unknown): JieKouGptImageSize {
  if (isJieKouGptImageSize(imageSize)) {
    return imageSize.trim() as JieKouGptImageSize;
  }

  if (isJieKouImageAspectRatio(aspectRatio)) {
    return JIEKOU_GPT_IMAGE_SIZE_BY_ASPECT_RATIO[aspectRatio];
  }

  return '1024x1024';
}

export function resolveJieKouImageAspectRatio(aspectRatio: unknown): JieKouImageAspectRatio {
  return isJieKouImageAspectRatio(aspectRatio) ? aspectRatio : '1:1';
}

export function resolveJieKouNanoBananaSize(aspectRatio: unknown): JieKouNanoBananaSize {
  const normalized = resolveJieKouImageAspectRatio(aspectRatio).replace(':', 'x');
  return JIEKOU_NANO_BANANA_SIZE_OPTIONS.includes(normalized as JieKouNanoBananaSize)
    ? normalized as JieKouNanoBananaSize
    : '1x1';
}

export function resolveJieKouNanoBananaQuality(imageSize: unknown): '1k' | '2k' | '4k' {
  if (imageSize === '2K') return '2k';
  if (imageSize === '4K') return '4k';
  return '1k';
}

export function resolveJieKouGptImageQuality(quality: unknown): 'low' | 'medium' | 'high' {
  if (quality === 'low' || quality === 'medium' || quality === 'high') {
    return quality;
  }

  return 'medium';
}

export function getMagicApiGptImageSizeOptions(model: unknown): MagicApiGptImageSize[] {
  if (model === 'gpt-image-2-pro') {
    return [...MAGICAPI_GPT_IMAGE_2_PRO_SIZE_OPTIONS];
  }

  if (model === 'gpt-image-2') {
    return [...MAGICAPI_GPT_IMAGE_2_SIZE_OPTIONS];
  }

  return [...MAGICAPI_GPT_IMAGE_SIZE_OPTIONS];
}

export function resolveMagicApiOpenAiStyleImageSize(
  model: unknown,
  aspectRatio: unknown,
  imageSize?: unknown,
): string {
  if (isOpenAiGptImageModel(model)) {
    if (isMagicApiGptImageSize(imageSize)) {
      return imageSize.trim();
    }

    if (model === 'gpt-image-2-pro' && isMagicApiGptImageAspectRatio(aspectRatio)) {
      return MAGICAPI_GPT_IMAGE_2_PRO_SIZE_BY_ASPECT_RATIO[aspectRatio] || '2048x2048';
    }

    if (isMagicApiGptImageAspectRatio(aspectRatio)) {
      return MAGICAPI_GPT_IMAGE_SIZE_BY_ASPECT_RATIO[aspectRatio];
    }

    return '1024x1024';
  }

  if (isGrokImageModel(model)) {
    return isMagicApiImageAspectRatio(aspectRatio)
      ? MAGICAPI_GROK_SIZE_BY_ASPECT_RATIO[aspectRatio]
      : MAGICAPI_GROK_SIZE_BY_ASPECT_RATIO['16:9'];
  }

  if (isDomesticImageModel(model)) {
    return isMagicApiImageAspectRatio(aspectRatio)
      ? MAGICAPI_DOUBAO_SIZE_BY_ASPECT_RATIO[aspectRatio]
      : MAGICAPI_DOUBAO_SIZE_BY_ASPECT_RATIO['16:9'];
  }

  return isNonEmptyString(imageSize) ? imageSize.trim() : '1024x1024';
}

export function isMagicApiGptImageOfficialSize(model: unknown, size: unknown): boolean {
  if (!isNonEmptyString(size)) {
    return false;
  }

  const official = model === 'gpt-image-2-pro'
    ? MAGICAPI_GPT_IMAGE_2_PRO_OFFICIAL_SIZES
    : MAGICAPI_GPT_IMAGE_2_OFFICIAL_SIZES;
  return official.has(size.trim());
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

  return '1024x1024';
}

export function resolveOpenAiGptImageSize(
  imageSize: unknown,
  aspectRatio: unknown,
): string {
  if (isOpenAiGptImageAutoSize(imageSize)) {
    return OPENAI_GPT_IMAGE_AUTO_SIZE;
  }

  return resolveOpenAiGptImagePixelSize(imageSize, aspectRatio);
}

export function resolveOpenAiGptImageAspectRatio(
  imageSize: unknown,
  fallbackAspectRatio?: unknown,
): OpenAiGptImageAspectRatio | 'auto' {
  if (isOpenAiGptImageAutoSize(imageSize)) {
    return 'auto';
  }

  if (isOpenAiGptImagePixelSize(imageSize)) {
    return OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE[imageSize];
  }

  const normalizedImageSize = normalizeOpenAiGptImagePixelSize(imageSize);
  if (normalizedImageSize) {
    const knownAspectRatio = OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE[normalizedImageSize];
    if (knownAspectRatio) {
      return knownAspectRatio;
    }

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
  if (isOpenAiGptImageAutoSize(imageSize)) {
    return '自动';
  }

  if (isOpenAiGptImagePixelSize(imageSize)) {
    return OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE[imageSize];
  }

  const normalizedImageSize = parseOpenAiGptImagePixelSize(imageSize)?.normalized;
  if (!normalizedImageSize) {
    return resolveOpenAiGptImageAspectRatio(imageSize, fallbackAspectRatio);
  }

  const knownAspectRatio = OPENAI_GPT_IMAGE_ASPECT_RATIO_BY_PIXEL_SIZE[normalizedImageSize];
  if (knownAspectRatio) {
    return knownAspectRatio;
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

  if (isOpenAiGptImageAutoSize(imageSize)) {
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
  const targetSize = resolveOpenAiGptImageSize(input.imageSize, input.aspectRatio);
  body.prompt = targetSize === OPENAI_GPT_IMAGE_AUTO_SIZE
    ? input.prompt
    : buildOpenAiGptImagePrompt(
      input.prompt,
      targetSize,
      input.aspectRatio,
      referenceImageCount > 0,
    );
  body.size = targetSize;
  body.quality = resolveOpenAiGptImageQuality(input.quality);

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

export function resolveVApiGeminiImageSize(imageSize: unknown): StandardImageSize {
  return isStandardImageSize(imageSize) ? imageSize : '1K';
}