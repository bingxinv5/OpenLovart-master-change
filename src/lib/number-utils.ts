export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampMarkerNumber(value: number | undefined) {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(999, Math.max(1, Math.round(value as number)));
}