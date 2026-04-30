function isTextDenseSourceMime(sourceMime: string): boolean {
  return sourceMime.startsWith('image/png') || sourceMime.includes('image/svg');
}

export function resolveLodQuality(sourceMime: string, level: number, qualities?: Record<number, number>): number {
  const baseQuality = qualities?.[level] ?? 0.7;

  if (!isTextDenseSourceMime(sourceMime)) {
    return baseQuality;
  }

  if (level <= 64) {
    return Math.max(baseQuality, 0.72);
  }

  if (level <= 256) {
    return Math.max(baseQuality, 0.84);
  }

  return baseQuality;
}

export function chooseLodEncodeType(sourceMime: string): 'image/webp' | 'image/jpeg' {
  return sourceMime.startsWith('image/png') ? 'image/webp' : 'image/jpeg';
}

export async function encodeLodBlob(
  canvas: OffscreenCanvas,
  sourceMime: string,
  quality: number,
): Promise<Blob> {
  const preferredType = chooseLodEncodeType(sourceMime);

  try {
    const preferredBlob = await canvas.convertToBlob({ type: preferredType, quality });
    if (preferredBlob.size > 0) {
      return preferredBlob;
    }
  } catch {
    // Fall through to jpeg.
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}
