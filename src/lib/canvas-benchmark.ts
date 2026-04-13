'use client';

export interface BenchmarkSeed {
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
}

export interface CanvasBenchmarkResult {
  id: string;
  timestamp: string;
  count: number;
  durationMs: number;
  storageUsageBytes: number;
  quotaBytes: number;
  mode: 'replace' | 'append';
}

const STORAGE_KEY = 'lovart_canvas_benchmark_results';

export function createBenchmarkImageDataUrl(index: number, width = 4096, height = 4096): string {
  const hue = (index * 37) % 360;
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g${index}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue} 88% 62%)" />
        <stop offset="100%" stop-color="hsl(${(hue + 72) % 360} 82% 42%)" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g${index})" rx="64" />
    <g fill="rgba(255,255,255,0.92)">
      <circle cx="${width * 0.24}" cy="${height * 0.22}" r="${width * 0.08}" />
      <circle cx="${width * 0.78}" cy="${height * 0.3}" r="${width * 0.05}" />
      <circle cx="${width * 0.68}" cy="${height * 0.76}" r="${width * 0.09}" />
    </g>
    <text x="50%" y="44%" text-anchor="middle" font-size="280" font-family="Arial, sans-serif" fill="white" font-weight="700">Bench ${index + 1}</text>
    <text x="50%" y="56%" text-anchor="middle" font-size="120" font-family="Arial, sans-serif" fill="rgba(255,255,255,0.78)">4096 × 4096 synthetic</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function generateBenchmarkSeeds(count: number): BenchmarkSeed[] {
  const columns = Math.max(6, Math.ceil(Math.sqrt(count)));
  const gap = 36;
  const tile = 240;

  return Array.from({ length: count }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: col * (tile + gap),
      y: row * (tile + gap),
      width: tile,
      height: tile,
      content: createBenchmarkImageDataUrl(index),
    };
  });
}

export function getCanvasBenchmarkResults(): CanvasBenchmarkResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CanvasBenchmarkResult[]) : [];
  } catch {
    return [];
  }
}

export function saveCanvasBenchmarkResult(result: CanvasBenchmarkResult): CanvasBenchmarkResult[] {
  const results = [result, ...getCanvasBenchmarkResults()].slice(0, 12);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  }
  return results;
}

export function clearCanvasBenchmarkResults(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
