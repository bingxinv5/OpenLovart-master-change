const DEFAULT_VIDEO_FILENAME = 'lovart-video-preview';

function getCurrentOrigin(fallbackOrigin?: string) {
  if (fallbackOrigin) return fallbackOrigin;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost';
}

function isHttpUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

function toLocalApiPath(url: URL) {
  if (url.pathname === '/api/proxy-download' || url.pathname === '/api/cdn-cache') {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return null;
}

export function resolveVideoPlaybackSource(
  src: string | undefined | null,
  options: {
    filename?: string;
    baseOrigin?: string;
  } = {},
) {
  const normalized = src?.trim() || '';
  if (!normalized) return '';

  if (!isHttpUrl(normalized)) {
    return normalized;
  }

  const origin = getCurrentOrigin(options.baseOrigin);

  try {
    const parsedUrl = new URL(normalized, origin);
    const localApiPath = toLocalApiPath(parsedUrl);
    if (localApiPath) {
      return localApiPath;
    }

    if (parsedUrl.origin === origin) {
      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }
  } catch {
    return normalized;
  }

  const proxyUrl = new URL('/api/proxy-download', origin);
  proxyUrl.searchParams.set('url', normalized);
  proxyUrl.searchParams.set('filename', options.filename || DEFAULT_VIDEO_FILENAME);
  proxyUrl.searchParams.set('inline', '1');
  return `${proxyUrl.pathname}${proxyUrl.search}`;
}