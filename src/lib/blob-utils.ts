/**
 * Blob / Data-URL 工具函数
 *
 * 将 data URL 转为轻量的 blob: URL，
 * 避免浏览器在每次渲染时重复解析巨大的 base64 字符串。
 */

import { decodeDataUrlBytes } from './data-url';

/**
 * 将 data URL 转为 Blob URL。
 * 非 data: URL（http / blob）直接原样返回。
 */
export function dataUrlToBlobUrl(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  try {
    const { bytes, mime } = decodeDataUrlBytes(dataUrl);
    const blobBytes = new Uint8Array(bytes.byteLength);
    blobBytes.set(bytes);
    return URL.createObjectURL(new Blob([blobBytes], { type: mime }));
  } catch {
    return dataUrl;
  }
}

// ── 带缓存版本 ──────────────────────────────────────────────

const _blobCache = new Map<string, string>();

/**
 * 带全局缓存的 data URL → Blob URL 转换。
 * 对同一段 data URL 只会转换一次，后续调用返回已缓存的 blob: URL。
 * 非 data: URL 直接原样返回。
 */
export function cachedDataUrlToBlobUrl(
  content: string | undefined,
): string | undefined {
  if (!content) return undefined;
  if (!content.startsWith('data:')) return content;

  const key = content.length + ':' + content.slice(0, 200) + content.slice(-200);
  const cached = _blobCache.get(key);
  if (cached) return cached;

  const url = dataUrlToBlobUrl(content);
  _blobCache.set(key, url);
  return url;
}

/**
 * 从远程 URL 获取 Blob。
 *
 * 优先在浏览器端直接 fetch（速度更快、绕过服务端网络限制），
 * 若因 CORS 等原因失败则自动回退到后端 proxy-download 路由。
 *
 * @param url      远程资源 URL（http/https）
 * @param filename 回退到 proxy 时使用的文件名标签
 * @param timeout  整体超时（毫秒），默认 30 000
 */
export async function fetchRemoteBlob(
  url: string,
  filename: string = 'lovart-download',
  timeout: number = 30_000,
): Promise<Blob | null> {
  // 去重：同一 URL 已有进行中的请求，等待并返回克隆
  const inflight = _inflightFetches.get(url);
  if (inflight) {
    try {
      const blob = await inflight;
      return blob ? blob.slice() : null; // 克隆 blob 避免多次消费
    } catch {
      return null;
    }
  }

  const promise = _fetchRemoteBlobImpl(url, filename, timeout);
  _inflightFetches.set(url, promise);
  try {
    return await promise;
  } finally {
    _inflightFetches.delete(url);
  }
}

/** 正在进行中的 fetch 请求去重表 */
const _inflightFetches = new Map<string, Promise<Blob | null>>();

/** 已推送过缓存的 URL 集合（避免重复上传 23MB） */
const _pushedCacheUrls = new Set<string>();

function isLocalProxyOrCacheUrl(url: string): boolean {
  try {
    const baseOrigin = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
    const parsedUrl = new URL(url, baseOrigin);
    return parsedUrl.origin === baseOrigin
      && (parsedUrl.pathname === '/api/proxy-download'
        || parsedUrl.pathname === '/api/cdn-cache');
  } catch {
    return false;
  }
}

async function _fetchRemoteBlobImpl(
  url: string,
  filename: string,
  timeout: number,
): Promise<Blob | null> {
  const localProxyOrCacheUrl = isLocalProxyOrCacheUrl(url);

  // 0️⃣ 优先检查服务端本地缓存（命中时最快，且对所有员工共享）
  if (!localProxyOrCacheUrl) {
    try {
      const cacheUrl = `/api/cdn-cache?url=${encodeURIComponent(url)}`;
      const cacheRes = await fetch(cacheUrl, {
        signal: AbortSignal.timeout(3_000), // 本地缓存只给 3 秒
      });
      if (cacheRes.ok) {
        return await cacheRes.blob();
      }
    } catch {
      // 缓存未命中或超时，继续下面的流程
    }
  }

  // 1️⃣ 尝试浏览器端直接下载
  let directBlob: Blob | null = null;
  try {
    const direct = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
    });
    if (direct.ok) {
      directBlob = await direct.blob();
    }
  } catch {
    // CORS / 网络错误 → 继续走 proxy
  }

  if (directBlob) {
    // 后台推送到服务端缓存（不阻塞返回）
    if (!localProxyOrCacheUrl) {
      pushToServerCache(url, directBlob);
    }
    return directBlob;
  }

  if (localProxyOrCacheUrl) {
    return null;
  }

  // 2️⃣ 回退到服务端代理（proxy-download 也会自动写缓存）
  try {
    const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const proxyRes = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(timeout),
    });
    if (proxyRes.ok) {
      return await proxyRes.blob();
    }
  } catch {
    // 代理也失败
  }

  return null;
}

/**
 * 将浏览器端成功下载的 blob 异步推送到服务端 CDN 缓存，
 * 供其他员工/后续请求复用。不阻塞主流程。
 */
function pushToServerCache(url: string, blob: Blob) {
  if (_pushedCacheUrls.has(url)) return; // 已推送过，跳过
  _pushedCacheUrls.add(url);
  try {
    const cacheUrl = `/api/cdn-cache?url=${encodeURIComponent(url)}`;
    fetch(cacheUrl, {
      method: 'POST',
      body: blob,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { _pushedCacheUrls.delete(url); /* 推送失败，允许重试 */ });
  } catch {
    _pushedCacheUrls.delete(url);
  }
}

