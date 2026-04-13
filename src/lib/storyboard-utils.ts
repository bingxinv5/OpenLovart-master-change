export interface ParsedStoryboardShotCode {
  prefix: string;
  number: number;
  digits: number;
  suffix: string;
}

const STORYBOARD_SHOT_CODE_PATTERN = /^[A-Z\-]*\d+[A-Z0-9\-]*$/i;
const STORYBOARD_DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|秒|帧|f)?$/i;

export function parseStoryboardShotCode(value?: string): ParsedStoryboardShotCode | null {
  const rawValue = value?.trim();
  if (!rawValue) return null;

  const match = rawValue.toUpperCase().match(/^([A-Z\-]*?)(\d+)(.*)$/);
  if (!match) return null;

  return {
    prefix: match[1] || 'A',
    number: Number.parseInt(match[2], 10),
    digits: match[2].length,
    suffix: match[3] || '',
  };
}

export function validateStoryboardShotCode(value?: string): string | null {
  const rawValue = value?.trim();
  if (!rawValue) return null;
  if (!STORYBOARD_SHOT_CODE_PATTERN.test(rawValue)) {
    return '镜头号建议使用 A01、SC02、A01-B 这类格式。';
  }
  return null;
}

export function validateStoryboardDuration(value?: string): string | null {
  const rawValue = value?.trim();
  if (!rawValue) return null;
  if (!STORYBOARD_DURATION_PATTERN.test(rawValue)) {
    return '时长建议使用 3s、1.5s、12帧、800ms 这类格式。';
  }
  return null;
}

export function getStoryboardShotSortTuple(
  shotCode: string | undefined,
  fallbackText = '',
): [number, string, number, string] {
  const rawShotCode = shotCode?.trim() || '';
  const fallback = fallbackText.trim().toLowerCase();

  if (!rawShotCode) {
    return [1, 'zzzz', Number.MAX_SAFE_INTEGER, fallback];
  }

  const normalized = rawShotCode.toUpperCase();
  const match = normalized.match(/^([A-Z\-]*?)(\d+)(.*)$/);
  if (!match) {
    return [0, normalized, Number.MAX_SAFE_INTEGER, fallback];
  }

  return [
    0,
    match[1] || normalized,
    Number.parseInt(match[2], 10),
    `${match[3] || ''}-${fallback}`,
  ];
}

export function normalizeStoryboardMetaText(value?: string): string | undefined {
  const nextValue = value?.trim();
  return nextValue ? nextValue : undefined;
}