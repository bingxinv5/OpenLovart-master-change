import { NextRequest } from 'next/server';
import { proxyUpscaleJsonRequest } from '../../_shared/upscale-service';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  return proxyUpscaleJsonRequest(
    '/api/upscale/base64',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: rawBody,
    },
    'AI 放大请求失败',
    {
      timeoutMs: 3 * 60_000,
      retries: 1,
      retryDelayMs: 1_500,
      timeoutHint: 'AI 放大服务响应超时。请确认 Upscayl 进程仍在运行、GPU 没有卡死，或降低并发后重试。',
      retryableStatusCodes: [500, 502, 503, 504],
    },
  );
}