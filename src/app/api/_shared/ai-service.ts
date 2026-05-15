import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_AI_PROVIDER_ID,
  getAiProvider,
  normalizeAiProviderId,
  type AiProviderDefinition,
  type AiProviderId,
} from '@/lib/ai-providers';
import { validateAiGatewayBaseUrl } from '@/lib/network-policy';
import { fetchRemoteAsset, fetchRemoteAssetPrefix } from './cdn-cache';

type JsonObject = Record<string, unknown>;

export type ImageDimensions = {
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp' | 'gif';
};

export type InspectedImageDimensions = ImageDimensions & {
  source: 'data-url' | 'remote-url';
  url?: string;
};

const IMAGE_DIMENSION_PREFIX_BYTES = 256 * 1024;
const IMAGE_DIMENSION_FALLBACK_BYTES = 4 * 1024 * 1024;

export const AI_UPSTREAM_TIMEOUT_MS = {
  submit: 45_000,
  slowImageSubmit: 300_000,
  status: 15_000,
} as const;

export class ApiRouteError extends Error {
  readonly status: number;
  readonly details?: string;

  constructor(message: string, status: number = 500, details?: string) {
    super(message);
    this.name = 'ApiRouteError';
    this.status = status;
    this.details = details;
  }
}

export type AiServiceConfig = {
  providerId: AiProviderId;
  provider: AiProviderDefinition;
  apiKey: string;
  baseUrl: string;
};

export function resolveAiServiceConfig(
  request: NextRequest,
  options: { providerId?: AiProviderId } = {},
): AiServiceConfig {
  const providerId = normalizeAiProviderId(options.providerId || request.headers.get('x-ai-provider') || process.env.AI_PROVIDER || DEFAULT_AI_PROVIDER_ID);
  const provider = getAiProvider(providerId);
  const clientBaseUrl = request.headers.get('x-ai-base-url');
  const clientApiKey = request.headers.get('x-ai-api-key');
  const apiKey = clientApiKey || process.env[provider.apiKeyEnv] || process.env.AI_API_KEY;
  const rawBaseUrl = clientBaseUrl || process.env[provider.baseUrlEnv] || (providerId === DEFAULT_AI_PROVIDER_ID ? process.env.AI_API_BASE_URL : undefined) || provider.defaultBaseUrl;

  if (!apiKey) {
    throw new ApiRouteError(`${provider.apiKeyEnv} 未配置，请在设置中填写 ${provider.label} API 密钥`, 500);
  }

  let baseUrl: string;

  try {
    baseUrl = validateAiGatewayBaseUrl(rawBaseUrl, {
      defaultBaseUrl: provider.defaultBaseUrl,
      allowedPublicPatterns: [
        ...provider.allowedPublicPatterns,
        ...parseAllowedAiHosts(process.env.AI_API_ALLOWED_HOSTS),
      ],
    }).normalizedBaseUrl;
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'AI 服务地址无效');
    const source = clientBaseUrl ? '请求头中的 x-ai-base-url' : `服务端 ${provider.baseUrlEnv} 配置`;
    throw new ApiRouteError(`${source} 不合法`, clientBaseUrl ? 400 : 500, message);
  }

  return { providerId, provider, apiKey, baseUrl };
}

export function createAiHeaders(apiKey: string, includeJsonContentType: boolean = false) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

export async function parseJsonResponse<T = unknown>(response: Response): Promise<T | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function getApiErrorMessage(payload: unknown, fallback: string): string {
  const record = asJsonObject(payload);
  if (!record) return fallback;

  const nestedError = getNestedValue(record, 'error', 'message');

  if (typeof nestedError === 'string') return nestedError;
  if (typeof record.message === 'string') return record.message;
  return fallback;
}

export function getErrorMessage(error: unknown, fallback: string = '未知错误'): string {
  return error instanceof Error ? error.message : fallback;
}

export function getNestedValue(payload: unknown, ...path: string[]): unknown {
  let current: unknown = payload;

  for (const segment of path) {
    const record = asJsonObject(current);
    if (!record) return undefined;
    current = record[segment];
  }

  return current;
}

export function asJsonObject(payload: unknown): JsonObject | null {
  return payload && typeof payload === 'object' ? (payload as JsonObject) : null;
}

export function parseTaskProgress(rawProgress: unknown): number {
  if (typeof rawProgress === 'string') {
    return parseInt(rawProgress.replace('%', ''), 10) || 0;
  }

  if (typeof rawProgress === 'number' && Number.isFinite(rawProgress)) {
    return rawProgress;
  }

  return 0;
}

export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  options: {
    attempts?: number;
    label?: string;
    baseDelayMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<Response> {
  const { attempts = 3, label = 'api', baseDelayMs = 800, timeoutMs } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(input, withTimeoutSignal(init, timeoutMs));
    } catch (error: unknown) {
      lastError = error;
      console.warn(
        `[${label}] Fetch attempt ${attempt + 1} failed:`,
        error instanceof Error ? error.message : error,
      );

      if (attempt < attempts - 1) {
        await delay(baseDelayMs * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('请求失败');
}

export function createUpstreamConnectionError(
  baseUrl: string,
  error: unknown,
  options: { timeoutMs?: number } = {},
): ApiRouteError {
  const errorMessage = getErrorMessage(error);

  if (isTimeoutLikeError(error)) {
    const waitSeconds = options.timeoutMs ? Math.round(options.timeoutMs / 1000) : null;
    const waitHint = waitSeconds ? `，已等待约 ${waitSeconds} 秒` : '';

    return new ApiRouteError(
      `AI 服务响应超时 (${baseUrl})`,
      504,
      `上游生成耗时过长${waitHint}，任务可能没有及时返回结果。请稍后重试，或降低图片分辨率后再试。上游原始错误: ${errorMessage}`,
    );
  }

  return new ApiRouteError(
    `无法连接到 AI 服务 (${baseUrl})`,
    502,
    `上游服务连接失败: ${errorMessage}。请检查 API Base URL 是否正确、网络是否可达。`,
  );
}

function isTimeoutLikeError(error: unknown): boolean {
  const text = error instanceof Error
    ? `${error.name} ${error.message}`.toLowerCase()
    : String(error).toLowerCase();

  return text.includes('timeout')
    || text.includes('timed out')
    || text.includes('aborted due to timeout');
}

export function extractImageResult(payload: unknown): {
  imageUrl: string | null;
  imageData: string | null;
  images: string[];
} {
  const imageUrls: string[] = [];
  let imageData: string | null = null;
  const seen = new Set<unknown>();

  const pushUrl = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }

    const normalized = value.trim();
    if (!normalized || imageUrls.includes(normalized)) {
      return;
    }

    imageUrls.push(normalized);
  };

  const setImageData = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }

    const normalized = value.trim();
    if (!normalized || imageData) {
      return;
    }

    imageData = normalized.startsWith('data:') ? normalized : `data:image/png;base64,${normalized}`;
  };

  const visit = (value: unknown) => {
    if (!value || seen.has(value)) {
      return;
    }

    if (Array.isArray(value)) {
      seen.add(value);
      value.forEach(visit);
      return;
    }

    if (typeof value === 'string') {
      if (value.startsWith('http://') || value.startsWith('https://')) {
        pushUrl(value);
      } else if (value.startsWith('data:image/')) {
        setImageData(value);
      }
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    seen.add(value);
    const record = value as Record<string, unknown>;

    pushUrl(record.url);
    pushUrl(record.image_url);
    pushUrl(record.download_url);
    pushUrl(record.output_url);
    pushUrl(record.result_url);
    setImageData(record.b64_json);
    setImageData(record.image_base64);
    setImageData(record.base64);

    visit(record.data);
    visit(record.images);
    visit(record.image_urls);
    visit(record.output);
    visit(record.result);
    visit(record.results);
  };

  visit(getNestedValue(payload, 'data', 'data', 'data'));
  visit(getNestedValue(payload, 'data', 'data'));
  visit(getNestedValue(payload, 'data', 'output', 'data'));
  visit(getNestedValue(payload, 'data', 'output'));
  visit(getNestedValue(payload, 'data', 'images'));
  visit(getNestedValue(payload, 'data', 'image_urls'));
  visit(getNestedValue(payload, 'data', 'result'));
  visit(getNestedValue(payload, 'output'));
  visit(getNestedValue(payload, 'images'));
  visit(getNestedValue(payload, 'image_urls'));
  visit(getNestedValue(payload, 'result'));
  visit(payload);

  return {
    imageUrl: imageUrls[0] ?? null,
    imageData,
    images: imageUrls,
  };
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function extractPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) {
    return null;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height, format: 'png' } : null;
}

function extractGifDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'GIF') {
    return null;
  }

  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  return width > 0 && height > 0 ? { width, height, format: 'gif' } : null;
}

function extractJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 8 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= buffer.length) {
      break;
    }

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0x01) {
      continue;
    }

    if (marker === 0xd9 || marker === 0xda || offset + 1 >= buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break;
    }

    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return width > 0 && height > 0 ? { width, height, format: 'jpeg' } : null;
    }

    offset += segmentLength;
  }

  return null;
}

function extractWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }

  const chunkType = buffer.toString('ascii', 12, 16);

  if (chunkType === 'VP8X' && buffer.length >= 30) {
    const width = 1 + readUInt24LE(buffer, 24);
    const height = 1 + readUInt24LE(buffer, 27);
    return width > 0 && height > 0 ? { width, height, format: 'webp' } : null;
  }

  if (chunkType === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height, format: 'webp' } : null;
  }

  if (chunkType === 'VP8L' && buffer.length >= 25) {
    const width = 1 + (((buffer[22] & 0x3f) << 8) | buffer[21]);
    const height = 1 + (((buffer[24] & 0x0f) << 10) | (buffer[23] << 2) | ((buffer[22] & 0xc0) >> 6));
    return width > 0 && height > 0 ? { width, height, format: 'webp' } : null;
  }

  return null;
}

export function detectImageDimensions(buffer: Buffer): ImageDimensions | null {
  return extractPngDimensions(buffer)
    ?? extractJpegDimensions(buffer)
    ?? extractWebpDimensions(buffer)
    ?? extractGifDimensions(buffer)
    ?? null;
}

function decodeImageData(imageData: string): Buffer | null {
  try {
    const commaIndex = imageData.indexOf(',');
    const payload = commaIndex >= 0 ? imageData.slice(commaIndex + 1) : imageData;
    return Buffer.from(payload, 'base64');
  } catch {
    return null;
  }
}

export async function inspectImageResultDimensions(
  imageResult: {
    imageUrl: string | null;
    imageData: string | null;
    images: string[];
  },
): Promise<InspectedImageDimensions | null> {
  if (typeof imageResult.imageData === 'string' && imageResult.imageData.trim().length > 0) {
    const buffer = decodeImageData(imageResult.imageData.trim());
    const dimensions = buffer ? detectImageDimensions(buffer) : null;
    if (dimensions) {
      return {
        ...dimensions,
        source: 'data-url',
      };
    }
  }

  const imageUrl = imageResult.imageUrl ?? imageResult.images[0] ?? null;
  if (!isHttpUrl(imageUrl)) {
    return null;
  }

  try {
    const { buffer } = await fetchRemoteAssetPrefix(imageUrl, {
      timeoutMs: 10_000,
      maxBytes: IMAGE_DIMENSION_PREFIX_BYTES,
      allowedContentTypePrefixes: ['image/'],
    });
    const dimensions = detectImageDimensions(buffer);
    if (dimensions) {
      return {
        ...dimensions,
        source: 'remote-url',
        url: imageUrl,
      };
    }
  } catch {
    // Fall through to a larger best-effort fetch when prefix probing fails.
  }

  try {
    const { buffer } = await fetchRemoteAsset(imageUrl, {
      timeoutMs: 10_000,
      maxBytes: IMAGE_DIMENSION_FALLBACK_BYTES,
      allowedContentTypePrefixes: ['image/'],
    });
    const dimensions = detectImageDimensions(buffer);
    if (!dimensions) {
      return null;
    }

    return {
      ...dimensions,
      source: 'remote-url',
      url: imageUrl,
    };
  } catch {
    return null;
  }
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

function buildImageProxyUrl(origin: string, url: string, filename: string): string {
  if (!isHttpUrl(url)) {
    return url;
  }

  const parsedUrl = new URL(url, origin);
  if (parsedUrl.origin === origin && parsedUrl.pathname === '/api/proxy-download') {
    return parsedUrl.toString();
  }

  const proxyUrl = new URL('/api/proxy-download', origin);
  proxyUrl.searchParams.set('url', url);
  proxyUrl.searchParams.set('filename', filename);
  proxyUrl.searchParams.set('inline', '1');
  return proxyUrl.toString();
}

export function proxyImageResultUrls(
  imageResult: {
    imageUrl: string | null;
    imageData: string | null;
    images: string[];
  },
  origin: string,
  options: {
    filenamePrefix?: string;
  } = {},
): {
  imageUrl: string | null;
  imageData: string | null;
  images: string[];
} {
  const filenamePrefix = options.filenamePrefix ?? 'lovart-image';
  const proxiedImages = imageResult.images.map((url, index) =>
    buildImageProxyUrl(origin, url, `${filenamePrefix}-${index + 1}`),
  );

  const primarySource = imageResult.imageUrl ?? imageResult.images[0] ?? null;
  const proxiedPrimary = primarySource
    ? buildImageProxyUrl(origin, primarySource, `${filenamePrefix}-primary`)
    : null;

  return {
    imageUrl: proxiedPrimary,
    imageData: imageResult.imageData,
    images: proxiedImages,
  };
}

export function resolveRequestOrigin(headers: Headers, fallbackOrigin: string): string {
  const forwardedHost = headers.get('x-forwarded-host');
  const host = forwardedHost || headers.get('host');
  if (!host) {
    return fallbackOrigin;
  }

  const forwardedProto = headers.get('x-forwarded-proto');
  const fallbackUrl = new URL(fallbackOrigin);
  const protocol = forwardedProto || fallbackUrl.protocol.replace(/:$/, '');
  return `${protocol}://${host}`;
}

export function inferGenerationTaskKind(payload: unknown): 'image' | 'video' | null {
  const action = getNestedValue(payload, 'action') ?? getNestedValue(payload, 'data', 'action');

  if (typeof action === 'string') {
    const normalizedAction = action.trim().toLowerCase();
    if (normalizedAction.includes('video')) {
      return 'video';
    }
    if (normalizedAction.includes('image')) {
      return 'image';
    }
  }

  const videoUrl = extractVideoUrl(payload);
  if (videoUrl) {
    return 'video';
  }

  const imageResult = extractImageResult(payload);
  if (imageResult.imageUrl || imageResult.imageData || imageResult.images.length > 0) {
    return 'image';
  }

  return null;
}

export function extractVideoUrl(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  const rawOutput = getNestedValue(payload, 'data', 'output');

  if (typeof rawOutput === 'string' && rawOutput.length > 0) {
    return rawOutput;
  }

  if (rawOutput && typeof rawOutput === 'object') {
    const nested = rawOutput as Record<string, unknown>;
    const candidate = nested.video_url || nested.url || nested.video || nested.download_url;

    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  const rootOutput = getNestedValue(payload, 'output');
  if (rootOutput && typeof rootOutput === 'object') {
    const nested = rootOutput as Record<string, unknown>;
    const candidate = nested.video_url || nested.url || nested.video || nested.download_url;

    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  const fallbackPaths = [
    ['output'],
    ['data', 'url'],
    ['data', 'content', 'video_url', 'url'],
    ['data', 'content', 'video_url'],
    ['data', 'content', 'url'],
    ['content', 'video_url', 'url'],
    ['content', 'video_url'],
    ['content', 'url'],
    ['data', 'video_url'],
    ['data', 'video'],
    ['data', 'download_url'],
    ['detail', 'url'],
    ['detail', 'video_url'],
    ['video_url'],
    ['video'],
    ['url'],
  ] as const;

  for (const path of fallbackPaths) {
    const value = getNestedValue(payload, ...path);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  const contentCandidates = [
    getNestedValue(payload, 'content'),
    getNestedValue(payload, 'data', 'content'),
    getNestedValue(payload, 'data', 'data', 'content'),
    getNestedValue(payload, 'videos'),
    getNestedValue(payload, 'data', 'videos'),
    getNestedValue(payload, 'task', 'videos'),
  ];

  for (const candidate of contentCandidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const contentVideoUrl = getNestedValue(item, 'video_url', 'url')
          ?? getNestedValue(item, 'video_url')
          ?? getNestedValue(item, 'url')
          ?? getNestedValue(item, 'download_url');

        if (typeof contentVideoUrl === 'string' && contentVideoUrl.length > 0) {
          return contentVideoUrl;
        }
      }

      continue;
    }

    const contentVideoUrl = getNestedValue(candidate, 'video_url', 'url')
      ?? getNestedValue(candidate, 'video_url')
      ?? getNestedValue(candidate, 'url')
      ?? getNestedValue(candidate, 'download_url');

    if (typeof contentVideoUrl === 'string' && contentVideoUrl.length > 0) {
      return contentVideoUrl;
    }
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAllowedAiHosts(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

/**
 * Shared error → Response converter for API route catch blocks.
 *
 * Usage:
 *   catch (error: unknown) {
 *       return handleApiRouteError(error, '图片生成失败', 'generate-image');
 *   }
 */
export function handleApiRouteError(
  error: unknown,
  fallbackMessage: string,
  label: string,
): NextResponse {
  if (error instanceof ApiRouteError) {
    return NextResponse.json(
      { error: error.message, details: error.details },
      { status: error.status },
    );
  }

  console.error(`[${label}] Error:`, error);
  return NextResponse.json(
    { error: fallbackMessage, details: getErrorMessage(error) },
    { status: 500 },
  );
}

function withTimeoutSignal(init: RequestInit, timeoutMs?: number): RequestInit {
  if (!timeoutMs || typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return init;
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([init.signal, timeoutSignal])
    : init.signal ?? timeoutSignal;

  return {
    ...init,
    signal,
  };
}