import { captureVideoThumbnailDataUrl } from './project-thumbnail';

export const VIDEO_SOURCE_FAILURE_TTL_MS = 30_000;

type VideoFailureRecord = {
  failedAt: number;
  failureCount: number;
};

const failedVideoSources = new Map<string, VideoFailureRecord>();
const thumbnailPromiseCache = new Map<string, Promise<string | null>>();

function normalizeVideoSource(src: string | undefined | null) {
  return src?.trim() || '';
}

export function hasVideoSourceFailed(src: string | undefined | null) {
  const normalized = normalizeVideoSource(src);
  if (!normalized) return false;

  const record = failedVideoSources.get(normalized);
  if (!record) return false;

  if (Date.now() - record.failedAt >= VIDEO_SOURCE_FAILURE_TTL_MS) {
    failedVideoSources.delete(normalized);
    return false;
  }

  return true;
}

export function markVideoSourceFailed(src: string | undefined | null) {
  const normalized = normalizeVideoSource(src);
  if (normalized) {
    const previous = failedVideoSources.get(normalized);
    failedVideoSources.set(normalized, {
      failedAt: Date.now(),
      failureCount: (previous?.failureCount ?? 0) + 1,
    });
    clearCachedVideoThumbnails(normalized);
  }
}

export function clearVideoSourceFailure(src: string | undefined | null) {
  const normalized = normalizeVideoSource(src);
  if (normalized) {
    failedVideoSources.delete(normalized);
  }
}

export function markVideoSourceLoaded(src: string | undefined | null) {
  const normalized = normalizeVideoSource(src);
  if (normalized) {
    failedVideoSources.delete(normalized);
  }
}

function clearCachedVideoThumbnails(src: string) {
  const prefix = `${src}|`;
  for (const key of thumbnailPromiseCache.keys()) {
    if (key.startsWith(prefix)) {
      thumbnailPromiseCache.delete(key);
    }
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

  const promise = captureVideoThumbnailDataUrl(normalized, options)
    .then((thumbnail) => {
      if (!thumbnail) {
        thumbnailPromiseCache.delete(cacheKey);
      }
      return thumbnail;
    })
    .catch(() => {
      thumbnailPromiseCache.delete(cacheKey);
      return null;
    });
  thumbnailPromiseCache.set(cacheKey, promise);
  return promise;
}