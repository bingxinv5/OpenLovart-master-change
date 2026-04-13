import { proxyUpscaleJsonRequest } from '../../_shared/upscale-service';

export const runtime = 'nodejs';

export async function GET() {
  return proxyUpscaleJsonRequest('/api/health', { method: 'GET' }, 'AI 放大服务不可用', {
    timeoutMs: 3_000,
  });
}