import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_AI_BASE_URL, validateAiGatewayBaseUrl } from '@/lib/network-policy';

type JsonObject = Record<string, unknown>;

export const AI_UPSTREAM_TIMEOUT_MS = {
  submit: 45_000,
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

export function resolveAiServiceConfig(request: NextRequest) {
  const clientBaseUrl = request.headers.get('x-ai-base-url');
  const clientApiKey = request.headers.get('x-ai-api-key');
  const apiKey = clientApiKey || process.env.AI_API_KEY;
  const rawBaseUrl = clientBaseUrl || process.env.AI_API_BASE_URL || DEFAULT_AI_BASE_URL;

  if (!apiKey) {
    throw new ApiRouteError('AI_API_KEY 未配置，请在设置中填写 API 密钥', 500);
  }

  let baseUrl: string;

  try {
    baseUrl = validateAiGatewayBaseUrl(rawBaseUrl, {
      defaultBaseUrl: DEFAULT_AI_BASE_URL,
      allowedPublicPatterns: parseAllowedAiHosts(process.env.AI_API_ALLOWED_HOSTS),
    }).normalizedBaseUrl;
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'AI 服务地址无效');
    const source = clientBaseUrl ? '请求头中的 x-ai-base-url' : '服务端 AI_API_BASE_URL 配置';
    throw new ApiRouteError(`${source} 不合法`, clientBaseUrl ? 400 : 500, message);
  }

  return { apiKey, baseUrl };
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

export function createUpstreamConnectionError(baseUrl: string, error: unknown): ApiRouteError {
  const errorMessage = getErrorMessage(error);

  return new ApiRouteError(
    `无法连接到 AI 服务 (${baseUrl})`,
    502,
    `上游服务连接失败: ${errorMessage}。请检查 API Base URL 是否正确、网络是否可达。`,
  );
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
    setImageData(record.b64_json);
    setImageData(record.image_base64);
    setImageData(record.base64);

    visit(record.data);
    visit(record.images);
    visit(record.output);
    visit(record.result);
    visit(record.results);
  };

  visit(getNestedValue(payload, 'data', 'data', 'data'));
  visit(getNestedValue(payload, 'data', 'data'));
  visit(getNestedValue(payload, 'data', 'output', 'data'));
  visit(getNestedValue(payload, 'data', 'output'));
  visit(getNestedValue(payload, 'data', 'images'));
  visit(getNestedValue(payload, 'data', 'result'));
  visit(getNestedValue(payload, 'output'));
  visit(getNestedValue(payload, 'images'));
  visit(getNestedValue(payload, 'result'));
  visit(payload);

  return {
    imageUrl: imageUrls[0] ?? null,
    imageData,
    images: imageUrls,
  };
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