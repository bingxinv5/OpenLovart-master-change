import { captureVideoThumbnailDataUrl } from './project-thumbnail';

const failedVideoSources = new Set<string>();
const thumbnailPromiseCache = new Map<string, Promise<string | null>>();

function normalizeVideoSource(src: string | undefined | null) {
  return src?.trim() || '';
}

export function hasVideoSourceFailed(src: string | undefined | null) {
  const normalized = normalizeVideoSource(src);
  return normalized ? failedVideoSources.has(normalized) : false;
}

export function markVideoSourceFailed(src: string | undefined | null) {
  const normalized = normalizeVideoSource(src);
  if (normalized) {
    failedVideoSources.add(normalized);
  }
}

export function getCachedVideoThumbnailDataUrl(
  src: string,
  options?: { maxWidth?: number; quality?: number; seekTime?: number },
) {
  const normalized = normalizeVideoSource(src);
  if (!normalized || hasVideoSourceFailed(normalized)) {
    return Promise.resolve(null);
  }

  const cacheKey = `${normalized}|${options?.maxWidth ?? ''}|${options?.quality ?? ''}|${options?.seekTime ?? ''}`;
  const cached = thumbnailPromiseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = captureVideoThumbnailDataUrl(normalized, options).catch(() => null);
  thumbnailPromiseCache.set(cacheKey, promise);
  return promise;
}