import crypto from 'crypto';
import { lookup } from 'dns/promises';
import { promises as fs } from 'fs';
import path from 'path';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const DEFAULT_EXTENSION = '.bin';
const BLOCKED_REMOTE_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];
const PRIVATE_HOST_SUFFIXES = ['.local', '.lan', '.internal', '.corp', '.home', '.localdomain'];
const CACHE_SETTINGS_DIR = path.join(process.cwd(), '.runtime');
const CACHE_SETTINGS_FILE = path.join(CACHE_SETTINGS_DIR, 'cdn-cache-settings.json');
export const MAX_REMOTE_ASSET_BYTES = 25 * 1024 * 1024;

export type CachedAsset = {
  data: Buffer;
  contentType: string;
  cacheKey: string;
};

type CacheSettingsFile = {
  directory?: string;
};

export type CdnCacheDirectoryStatus = {
  defaultDirectory: string;
  effectiveDirectory: string;
  configuredDirectory: string | null;
  isCustomDirectory: boolean;
  exists: boolean;
  writable: boolean;
  usageBytes: number;
  fileCount: number;
};

export type CdnCacheClearResult = CdnCacheDirectoryStatus & {
  clearedBytes: number;
  clearedFiles: number;
};

export class RemoteFetchError extends Error {
  readonly status: number;

  constructor(message: string, status: number = 400) {
    super(message);
    this.name = 'RemoteFetchError';
    this.status = status;
  }
}

export function getDefaultCdnCacheDirectory(): string {
  return path.join(process.cwd(), '.cdn-cache');
}

export function cacheKeyFromUrl(url: string): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
  const extension = path.extname(new URL(url).pathname) || DEFAULT_EXTENSION;
  return `${hash}${extension}`;
}

export function validateCacheDirectoryPath(directory: string): string {
  const trimmed = directory.trim();

  if (!trimmed) {
    throw new RemoteFetchError('缓存目录不能为空');
  }

  if (!path.isAbsolute(trimmed)) {
    throw new RemoteFetchError('缓存目录必须是绝对路径');
  }

  const resolved = path.resolve(trimmed);
  const parsed = path.parse(resolved);

  if (isSamePath(resolved, parsed.root)) {
    throw new RemoteFetchError('不能将缓存目录设置为磁盘根目录');
  }

  if (isSamePath(resolved, process.cwd())) {
    throw new RemoteFetchError('不能将缓存目录设置为当前运行目录');
  }

  if (isSamePath(resolved, CACHE_SETTINGS_DIR)) {
    throw new RemoteFetchError('不能将缓存目录设置为运行配置目录');
  }

  return resolved;
}

export async function resolveCdnCacheDirectory(): Promise<string> {
  return (await readConfiguredCdnCacheDirectory()) ?? getDefaultCdnCacheDirectory();
}

export async function getCdnCacheDirectoryStatus(): Promise<CdnCacheDirectoryStatus> {
  const configuredDirectory = await readConfiguredCdnCacheDirectory();
  const defaultDirectory = getDefaultCdnCacheDirectory();
  const effectiveDirectory = configuredDirectory ?? defaultDirectory;
  const writable = await ensureDirectoryWritable(effectiveDirectory);
  const exists = await directoryExists(effectiveDirectory);
  const { usageBytes, fileCount } = await getDirectoryUsage(effectiveDirectory);

  return {
    defaultDirectory,
    effectiveDirectory,
    configuredDirectory,
    isCustomDirectory: configuredDirectory !== null,
    exists,
    writable,
    usageBytes,
    fileCount,
  };
}

export async function updateConfiguredCdnCacheDirectory(directory: string): Promise<CdnCacheDirectoryStatus> {
  const resolvedDirectory = validateCacheDirectoryPath(directory);
  const writable = await ensureDirectoryWritable(resolvedDirectory);

  if (!writable) {
    throw new RemoteFetchError('缓存目录不可写，请检查路径和权限', 400);
  }

  await writeCacheSettingsFile(resolvedDirectory);
  return getCdnCacheDirectoryStatus();
}

export async function resetConfiguredCdnCacheDirectory(): Promise<CdnCacheDirectoryStatus> {
  await writeCacheSettingsFile(null);
  return getCdnCacheDirectoryStatus();
}

export async function clearConfiguredCdnCacheDirectory(): Promise<CdnCacheClearResult> {
  const effectiveDirectory = await resolveCdnCacheDirectory();
  await fs.mkdir(effectiveDirectory, { recursive: true });

  const entries = await fs.readdir(effectiveDirectory, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissingError(error)) {
      return [];
    }
    throw error;
  });

  let clearedBytes = 0;
  let clearedFiles = 0;

  for (const entry of entries) {
    const targetPath = path.join(effectiveDirectory, entry.name);

    try {
      const usage = await getEntryUsage(targetPath);
      clearedBytes += usage.usageBytes;
      clearedFiles += usage.fileCount;
    } catch {
      // Continue deleting best-effort even if a file disappears during traversal.
    }

    await fs.rm(targetPath, { recursive: true, force: true });
  }

  return {
    ...(await getCdnCacheDirectoryStatus()),
    clearedBytes,
    clearedFiles,
  };
}

export async function validateRemoteUrl(url: string): Promise<URL> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new RemoteFetchError('无效的 URL');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new RemoteFetchError('仅支持 HTTP/HTTPS URL');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new RemoteFetchError('远程地址不能包含用户名或密码');
  }

  await assertSafeRemoteHostname(parsedUrl.hostname);

  return parsedUrl;
}

export async function fetchRemoteAsset(
  url: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    allowedContentTypePrefixes?: string[];
    headers?: HeadersInit;
  } = {},
): Promise<{ buffer: Buffer; contentType: string; url: URL }> {
  const {
    timeoutMs = 30_000,
    maxBytes = MAX_REMOTE_ASSET_BYTES,
    allowedContentTypePrefixes,
    headers,
  } = options;
  const parsedUrl = await validateRemoteUrl(url);

  let response: Response;

  try {
    response = await fetch(parsedUrl, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error: unknown) {
    throw new RemoteFetchError(
      `连接目标地址失败: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  }

  if (!response.ok) {
    throw new RemoteFetchError(`下载失败: HTTP ${response.status}`, response.status);
  }

  const contentType = (response.headers.get('content-type') || DEFAULT_CONTENT_TYPE).toLowerCase();

  if (BLOCKED_REMOTE_CONTENT_TYPES.some((value) => contentType.startsWith(value))) {
    throw new RemoteFetchError('不支持代理下载 HTML 页面', 415);
  }

  if (allowedContentTypePrefixes && !allowedContentTypePrefixes.some((prefix) => contentType.startsWith(prefix))) {
    throw new RemoteFetchError('远程资源类型不受支持', 415);
  }

  const buffer = await readResponseWithLimit(response, maxBytes);

  return {
    buffer,
    contentType,
    url: parsedUrl,
  };
}

export async function getCacheFilePath(url: string): Promise<string> {
  return path.join(await resolveCdnCacheDirectory(), cacheKeyFromUrl(url));
}

export async function ensureCacheDir(): Promise<string> {
  const cacheDirectory = await resolveCdnCacheDirectory();
  await fs.mkdir(cacheDirectory, { recursive: true });
  return cacheDirectory;
}

export async function readCachedAsset(url: string): Promise<CachedAsset | null> {
  const cachePath = await getCacheFilePath(url);

  try {
    const data = await fs.readFile(cachePath);
    const contentType = await readCacheContentType(cachePath);

    return {
      data,
      contentType,
      cacheKey: cacheKeyFromUrl(url),
    };
  } catch {
    return null;
  }
}

export async function writeCachedAsset(
  url: string,
  data: Buffer,
  contentType: string,
): Promise<{ cacheKey: string }> {
  if (data.byteLength > MAX_REMOTE_ASSET_BYTES) {
    throw new RemoteFetchError(`远程资源超过 ${(MAX_REMOTE_ASSET_BYTES / 1024 / 1024).toFixed(0)}MB 限制`, 413);
  }

  const cacheDirectory = await ensureCacheDir();

  const cacheKey = cacheKeyFromUrl(url);
  const cachePath = path.join(cacheDirectory, cacheKey);

  await fs.writeFile(cachePath, data);
  await fs.writeFile(
    `${cachePath}.meta`,
    JSON.stringify({
      url,
      contentType: contentType || DEFAULT_CONTENT_TYPE,
      size: data.byteLength,
      cachedAt: new Date().toISOString(),
    }),
  );

  return { cacheKey };
}

async function readConfiguredCdnCacheDirectory(): Promise<string | null> {
  const settings = await readCacheSettingsFile();

  if (typeof settings.directory !== 'string' || settings.directory.trim().length === 0) {
    return null;
  }

  try {
    return validateCacheDirectoryPath(settings.directory);
  } catch {
    return null;
  }
}

async function readCacheSettingsFile(): Promise<CacheSettingsFile> {
  try {
    const raw = await fs.readFile(CACHE_SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;

    if (!isObject(parsed)) {
      return {};
    }

    return {
      directory: typeof parsed.directory === 'string' ? parsed.directory : undefined,
    };
  } catch {
    return {};
  }
}

async function writeCacheSettingsFile(directory: string | null): Promise<void> {
  if (!directory) {
    try {
      await fs.unlink(CACHE_SETTINGS_FILE);
    } catch (error: unknown) {
      if (!isMissingError(error)) {
        throw error;
      }
    }
    return;
  }

  await fs.mkdir(CACHE_SETTINGS_DIR, { recursive: true });
  await fs.writeFile(
    CACHE_SETTINGS_FILE,
    JSON.stringify({ directory }, null, 2),
    'utf-8',
  );
}

async function ensureDirectoryWritable(directory: string): Promise<boolean> {
  try {
    await fs.mkdir(directory, { recursive: true });
    const probePath = path.join(directory, `.lovart-cache-write-test-${process.pid}-${Date.now()}.tmp`);
    await fs.writeFile(probePath, 'ok');
    await fs.unlink(probePath);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    const stats = await fs.stat(directory);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function getDirectoryUsage(directory: string): Promise<{ usageBytes: number; fileCount: number }> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    let usageBytes = 0;
    let fileCount = 0;

    for (const entry of entries) {
      const usage = await getEntryUsage(path.join(directory, entry.name));
      usageBytes += usage.usageBytes;
      fileCount += usage.fileCount;
    }

    return { usageBytes, fileCount };
  } catch (error: unknown) {
    if (isMissingError(error)) {
      return { usageBytes: 0, fileCount: 0 };
    }
    throw error;
  }
}

async function getEntryUsage(targetPath: string): Promise<{ usageBytes: number; fileCount: number }> {
  const stats = await fs.stat(targetPath);

  if (stats.isDirectory()) {
    return getDirectoryUsage(targetPath);
  }

  return {
    usageBytes: stats.size,
    fileCount: targetPath.endsWith('.meta') ? 0 : 1,
  };
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

function isSamePath(left: string, right: string): boolean {
  return normalizePathForComparison(left) === normalizePathForComparison(right);
}

function normalizePathForComparison(targetPath: string): string {
  const resolved = trimTrailingPathSeparator(path.resolve(targetPath));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function trimTrailingPathSeparator(targetPath: string): string {
  const parsed = path.parse(targetPath);
  if (targetPath === parsed.root) {
    return parsed.root;
  }
  return targetPath.replace(/[\\/]+$/, '');
}

async function readCacheContentType(cachePath: string): Promise<string> {
  try {
    const meta = JSON.parse(await fs.readFile(`${cachePath}.meta`, 'utf-8')) as {
      contentType?: string;
    };

    return meta.contentType || DEFAULT_CONTENT_TYPE;
  } catch {
    return DEFAULT_CONTENT_TYPE;
  }
}

async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RemoteFetchError(`远程资源超过 ${(maxBytes / 1024 / 1024).toFixed(0)}MB 限制`, 413);
  }

  const reader = response.body?.getReader();

  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > maxBytes) {
      throw new RemoteFetchError(`远程资源超过 ${(maxBytes / 1024 / 1024).toFixed(0)}MB 限制`, 413);
    }

    return buffer;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      totalBytes += chunk.byteLength;

      if (totalBytes > maxBytes) {
        throw new RemoteFetchError(`远程资源超过 ${(maxBytes / 1024 / 1024).toFixed(0)}MB 限制`, 413);
      }

      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

async function assertSafeRemoteHostname(hostname: string): Promise<void> {
  const normalizedHost = hostname.trim().toLowerCase();

  if (!normalizedHost) {
    throw new RemoteFetchError('远程地址缺少主机名');
  }

  if (normalizedHost === 'localhost' || !normalizedHost.includes('.')) {
    throw new RemoteFetchError('禁止访问本地主机或内网短主机名');
  }

  if (PRIVATE_HOST_SUFFIXES.some((suffix) => normalizedHost.endsWith(suffix))) {
    throw new RemoteFetchError('禁止访问内网域名');
  }

  if (isIpv4Literal(normalizedHost) || isIpv6Literal(normalizedHost)) {
    if (isBlockedIpAddress(normalizedHost)) {
      throw new RemoteFetchError('禁止访问本地、私网或链路本地地址');
    }
    return;
  }

  try {
    const records = await lookup(normalizedHost, { all: true });

    if (records.length === 0) {
      throw new RemoteFetchError('无法解析远程地址');
    }

    if (records.some((record) => isBlockedIpAddress(record.address))) {
      throw new RemoteFetchError('禁止访问解析到本地或私网地址的远程主机');
    }
  } catch (error: unknown) {
    if (error instanceof RemoteFetchError) {
      throw error;
    }

    throw new RemoteFetchError(
      `远程地址解析失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isBlockedIpAddress(address: string): boolean {
  if (isIpv4Literal(address)) {
    const [a, b] = address.split('.').map(Number);

    return a === 0
      || a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }

  if (isIpv6Literal(address)) {
    const normalized = address.toLowerCase();

    return normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fe80:')
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('::ffff:127.')
      || normalized.startsWith('::ffff:10.')
      || normalized.startsWith('::ffff:192.168.')
      || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(normalized)
      || normalized.startsWith('::ffff:169.254.');
  }

  return false;
}

function isIpv4Literal(value: string): boolean {
  const segments = value.split('.');

  if (segments.length !== 4) {
    return false;
  }

  return segments.every((segment) => /^\d+$/.test(segment) && Number(segment) >= 0 && Number(segment) <= 255);
}

function isIpv6Literal(value: string): boolean {
  return value.includes(':');
}
