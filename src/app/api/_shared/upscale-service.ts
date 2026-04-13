import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const DEFAULT_UPSCALE_API_BASE_URL = 'http://127.0.0.1:3001';
const UPSCALE_SETTINGS_DIR = path.join(process.cwd(), '.runtime');
const UPSCALE_SETTINGS_FILE = path.join(UPSCALE_SETTINGS_DIR, 'upscale-service-settings.json');

type UpscaleServiceSettingsFile = {
  baseUrl?: string;
};

type ProxyUpscaleOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  timeoutHint?: string;
  retryableStatusCodes?: number[];
};

export type UpscaleServiceHealth = {
  ok: boolean;
  gpu?: string;
  error?: string;
  details?: string;
};

export type UpscaleServiceSettingsStatus = {
  defaultBaseUrl: string;
  effectiveBaseUrl: string;
  configuredBaseUrl: string | null;
  isCustomBaseUrl: boolean;
  health: UpscaleServiceHealth;
};

export class UpscaleServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number = 500) {
    super(message);
    this.name = 'UpscaleServiceError';
    this.status = status;
  }
}

export function normalizeUpscaleApiBaseUrl(baseUrl: string): string {
  const rawBaseUrl = baseUrl.trim();

  if (!rawBaseUrl) {
    throw new UpscaleServiceError('Upscayl 服务地址不能为空', 400);
  }

  try {
    const parsed = new URL(rawBaseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('unsupported protocol');
    }
    if (parsed.search || parsed.hash) {
      throw new Error('query/hash not supported');
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    throw new UpscaleServiceError('Upscayl 服务地址无效，请输入完整的 http/https 地址', 400);
  }
}

export function getDefaultUpscaleApiBaseUrl(): string {
  return normalizeUpscaleApiBaseUrl(process.env.UPSCAYL_API_BASE_URL || DEFAULT_UPSCALE_API_BASE_URL);
}

export async function resolveUpscaleApiBaseUrl(): Promise<string> {
  return (await readConfiguredUpscaleApiBaseUrl()) ?? getDefaultUpscaleApiBaseUrl();
}

export async function getUpscaleServiceSettingsStatus(): Promise<UpscaleServiceSettingsStatus> {
  const configuredBaseUrl = await readConfiguredUpscaleApiBaseUrl();
  const defaultBaseUrl = getDefaultUpscaleApiBaseUrl();
  const effectiveBaseUrl = configuredBaseUrl ?? defaultBaseUrl;

  return {
    defaultBaseUrl,
    effectiveBaseUrl,
    configuredBaseUrl,
    isCustomBaseUrl: configuredBaseUrl !== null,
    health: await checkUpscaleServiceHealth(effectiveBaseUrl),
  };
}

export async function updateConfiguredUpscaleApiBaseUrl(baseUrl: string): Promise<UpscaleServiceSettingsStatus> {
  const normalizedBaseUrl = normalizeUpscaleApiBaseUrl(baseUrl);
  await writeUpscaleServiceSettingsFile(normalizedBaseUrl);
  return getUpscaleServiceSettingsStatus();
}

export async function resetConfiguredUpscaleApiBaseUrl(): Promise<UpscaleServiceSettingsStatus> {
  await writeUpscaleServiceSettingsFile(null);
  return getUpscaleServiceSettingsStatus();
}

export async function checkUpscaleServiceHealth(baseUrl?: string): Promise<UpscaleServiceHealth> {
  const targetBaseUrl = baseUrl ? normalizeUpscaleApiBaseUrl(baseUrl) : await resolveUpscaleApiBaseUrl();

  try {
    const response = await fetch(`${targetBaseUrl}/api/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });

    const payload = await readJsonPayload(response);

    if (!response.ok) {
      return {
        ok: false,
        error: 'Upscayl 服务返回异常状态',
        details: payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : `HTTP ${response.status}`,
      };
    }

    if (payload && typeof payload === 'object' && 'status' in payload && payload.status === 'ok') {
      return {
        ok: true,
        gpu: 'gpu' in payload && typeof payload.gpu === 'string' ? payload.gpu : undefined,
      };
    }

    return {
      ok: false,
      error: 'Upscayl 健康检查返回异常响应',
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: '无法连接 Upscayl 服务',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildUpscaleApiUrl(pathname: string): Promise<string> {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${await resolveUpscaleApiBaseUrl()}${normalizedPath}`;
}

export async function proxyUpscaleJsonRequest(
  pathname: string,
  init: RequestInit,
  fallbackError: string,
  options: ProxyUpscaleOptions = {},
): Promise<NextResponse> {
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const retries = options.retries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  const retryableStatusCodes = new Set(options.retryableStatusCodes ?? [502, 503, 504]);
  const timeoutHint = options.timeoutHint || 'AI 放大处理超时，请检查 Upscayl 服务是否卡住、显卡是否繁忙，或稍后重试。';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let upstreamResponse: Response;

    try {
      upstreamResponse = await fetch(await buildUpscaleApiUrl(pathname), {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.headers || {}),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error: unknown) {
      if (attempt < retries && isRetryableUpscaleFetchError(error)) {
        await delay(retryDelayMs * (attempt + 1));
        continue;
      }

      return NextResponse.json(
        buildUpscaleErrorPayload(fallbackError, error, timeoutHint, attempt + 1),
        { status: 502 },
      );
    }

    const payload = await readJsonPayload(upstreamResponse);

    if (upstreamResponse.ok) {
      return NextResponse.json(payload ?? {}, { status: upstreamResponse.status });
    }

    if (attempt < retries && retryableStatusCodes.has(upstreamResponse.status)) {
      await delay(retryDelayMs * (attempt + 1));
      continue;
    }

    return NextResponse.json(
      payload && typeof payload === 'object'
        ? {
            ...payload,
            hint: extractHintFromUpstreamPayload(payload) || (retryableStatusCodes.has(upstreamResponse.status) ? timeoutHint : undefined),
            attempts: attempt + 1,
          }
        : buildUpscaleErrorPayload(fallbackError, `HTTP ${upstreamResponse.status}`, timeoutHint, attempt + 1),
      { status: upstreamResponse.status },
    );
  }

  return NextResponse.json(
    {
      error: fallbackError,
      hint: timeoutHint,
    },
    { status: 502 },
  );
}

async function readConfiguredUpscaleApiBaseUrl(): Promise<string | null> {
  const settings = await readUpscaleServiceSettingsFile();

  if (typeof settings.baseUrl !== 'string' || settings.baseUrl.trim().length === 0) {
    return null;
  }

  try {
    return normalizeUpscaleApiBaseUrl(settings.baseUrl);
  } catch {
    return null;
  }
}

async function readUpscaleServiceSettingsFile(): Promise<UpscaleServiceSettingsFile> {
  try {
    const raw = await fs.readFile(UPSCALE_SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;

    if (!isObject(parsed)) {
      return {};
    }

    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined,
    };
  } catch {
    return {};
  }
}

async function writeUpscaleServiceSettingsFile(baseUrl: string | null): Promise<void> {
  if (!baseUrl) {
    try {
      await fs.unlink(UPSCALE_SETTINGS_FILE);
    } catch (error: unknown) {
      if (!isMissingError(error)) {
        throw error;
      }
    }
    return;
  }

  await fs.mkdir(UPSCALE_SETTINGS_DIR, { recursive: true });
  await fs.writeFile(
    UPSCALE_SETTINGS_FILE,
    JSON.stringify({ baseUrl }, null, 2),
    'utf-8',
  );
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return {
      raw: rawText,
    };
  }
}

function buildUpscaleErrorPayload(
  fallbackError: string,
  error: unknown,
  timeoutHint: string,
  attempts: number,
) {
  const details = error instanceof Error ? error.message : String(error);
  const isTimeout = isTimeoutError(error);

  return {
    error: fallbackError,
    details,
    hint: isTimeout ? timeoutHint : '请检查 Upscayl 服务地址、进程状态和显卡占用后重试。',
    attempts,
  };
}

function extractHintFromUpstreamPayload(payload: object): string | undefined {
  return 'hint' in payload && typeof payload.hint === 'string'
    ? payload.hint
    : undefined;
}

function isRetryableUpscaleFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (isTimeoutError(error)) {
    return true;
  }

  return /fetch failed|socket|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(error.message);
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError'
    || error.name === 'TimeoutError'
    || /timed out|timeout/i.test(error.message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMissingError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}