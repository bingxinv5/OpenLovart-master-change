export const DEFAULT_AI_BASE_URL = 'https://api.bltcy.ai';

const INTERNAL_HOST_SUFFIXES = ['.local', '.lan', '.internal', '.corp', '.home', '.localdomain'];

type ValidateAiBaseUrlOptions = {
  allowedPublicPatterns?: string[];
  defaultBaseUrl?: string;
};

export function validateAiGatewayBaseUrl(
  rawValue: string,
  options: ValidateAiBaseUrlOptions = {},
): { normalizedBaseUrl: string; url: URL } {
  const trimmedValue = rawValue.trim();

  if (!trimmedValue) {
    throw new Error('AI 服务地址不能为空');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new Error('AI 服务地址格式无效');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('AI 服务地址仅支持 HTTP/HTTPS');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('AI 服务地址不能包含用户名或密码');
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error('AI 服务地址不能包含查询参数或片段');
  }

  const normalizedBaseUrl = normalizeConfiguredBaseUrl(parsedUrl);
  const hostname = parsedUrl.hostname.toLowerCase();
  const defaultHostname = new URL(options.defaultBaseUrl || DEFAULT_AI_BASE_URL).hostname.toLowerCase();

  if (isInternalAiHost(hostname)) {
    return { normalizedBaseUrl, url: parsedUrl };
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('公网 AI 服务地址必须使用 HTTPS');
  }

  if (hostname === defaultHostname) {
    return { normalizedBaseUrl, url: parsedUrl };
  }

  const allowedPatterns = (options.allowedPublicPatterns || []).map((pattern) => pattern.trim()).filter(Boolean);

  if (allowedPatterns.some((pattern) => matchesAllowedHostPattern(parsedUrl, pattern))) {
    return { normalizedBaseUrl, url: parsedUrl };
  }

  throw new Error(
    'AI 服务地址不在允许范围内。公网网关请通过 AI_API_ALLOWED_HOSTS 明确放行；内网网关可使用 localhost、私网 IP 或常见内网域名。',
  );
}

export function isInternalAiHost(hostname: string): boolean {
  const normalizedHost = hostname.trim().toLowerCase();

  if (!normalizedHost) {
    return false;
  }

  if (normalizedHost === 'localhost') {
    return true;
  }

  if (isIpv4Literal(normalizedHost)) {
    return isPrivateOrLoopbackIpv4(normalizedHost);
  }

  if (isIpv6Literal(normalizedHost)) {
    return isPrivateOrLoopbackIpv6(normalizedHost);
  }

  if (!normalizedHost.includes('.')) {
    return true;
  }

  return INTERNAL_HOST_SUFFIXES.some((suffix) => normalizedHost.endsWith(suffix));
}

function normalizeConfiguredBaseUrl(url: URL): string {
  const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${pathname}`;
}

function matchesAllowedHostPattern(url: URL, pattern: string): boolean {
  const normalizedPattern = pattern.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const host = url.host.toLowerCase();
  const origin = url.origin.toLowerCase();

  if (!normalizedPattern) {
    return false;
  }

  if (normalizedPattern.startsWith('http://') || normalizedPattern.startsWith('https://')) {
    try {
      const parsedPattern = new URL(normalizedPattern);
      return parsedPattern.origin.toLowerCase() === origin;
    } catch {
      return false;
    }
  }

  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(1);
    return hostname.endsWith(suffix) && hostname !== suffix.slice(1);
  }

  return normalizedPattern === hostname || normalizedPattern === host;
}

function isIpv4Literal(value: string): boolean {
  const segments = value.split('.');

  if (segments.length !== 4) {
    return false;
  }

  return segments.every((segment) => /^\d+$/.test(segment) && Number(segment) >= 0 && Number(segment) <= 255);
}

function isPrivateOrLoopbackIpv4(value: string): boolean {
  const [a, b] = value.split('.').map(Number);

  return a === 10
    || a === 127
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function isIpv6Literal(value: string): boolean {
  return value.includes(':');
}

function isPrivateOrLoopbackIpv6(value: string): boolean {
  const normalized = value.toLowerCase();

  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('::ffff:127.');
}