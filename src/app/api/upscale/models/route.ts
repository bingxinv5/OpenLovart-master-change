import { proxyUpscaleJsonRequest } from '../../_shared/upscale-service';

export const runtime = 'nodejs';

export async function GET() {
  return proxyUpscaleJsonRequest('/api/models', { method: 'GET' }, '获取 AI 放大模型失败', {
    timeoutMs: 5_000,
  });
}