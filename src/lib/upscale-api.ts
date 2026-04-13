const UPSCALE_API_PATH = '/api/upscale';

export const UPSCALE_MODELS = [
  { id: 'upscayl-standard-4x', label: '标准' },
  { id: 'upscayl-lite-4x', label: '轻量' },
  { id: 'high-fidelity-4x', label: '高保真' },
  { id: 'remacri-4x', label: 'Remacri' },
  { id: 'ultramix-balanced-4x', label: '均衡混合' },
  { id: 'ultrasharp-4x', label: '超锐利' },
  { id: 'digital-art-4x', label: '数字艺术' },
] as const;

export type UpscaleModelId = (typeof UPSCALE_MODELS)[number]['id'];

export interface UpscaleOptions {
  model: UpscaleModelId;
  scale: number;
}

export async function checkUpscaleApiHealth(): Promise<{ ok: boolean; gpu?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${UPSCALE_API_PATH}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (data.status === 'ok') {
      return { ok: true, gpu: data.gpu };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('无效的 base64 数据');
  const mime = match[1];
  const raw = atob(match[2]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function upscaleImageBlob(
  blob: Blob,
  options: UpscaleOptions,
): Promise<Blob> {
  const base64 = await blobToBase64(blob);

  const response = await fetch(`${UPSCALE_API_PATH}/base64`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64,
      model: options.model,
      scale: options.scale,
      format: 'png',
    }),
  });

  const result = await response.json().catch(() => ({})) as {
    status?: string;
    data?: { image?: string };
    error?: string;
    hint?: string;
    details?: string;
  };
  if (result.status === 'success' && result.data?.image) {
    return base64ToBlob(result.data.image);
  }

  const messageParts = [result.error || 'AI 放大失败'];
  if (result.hint) {
    messageParts.push(result.hint);
  } else if (result.details) {
    messageParts.push(result.details);
  }

  throw new Error(messageParts.join('：'));
}
