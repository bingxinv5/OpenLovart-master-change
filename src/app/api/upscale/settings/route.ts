import { NextRequest, NextResponse } from 'next/server';
import {
  getUpscaleServiceSettingsStatus,
  resetConfiguredUpscaleApiBaseUrl,
  updateConfiguredUpscaleApiBaseUrl,
  UpscaleServiceError,
} from '../../_shared/upscale-service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(await getUpscaleServiceSettingsStatus());
  } catch (error: unknown) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { baseUrl?: unknown };
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl : '';

    if (!baseUrl.trim()) {
      return NextResponse.json(await resetConfiguredUpscaleApiBaseUrl());
    }

    return NextResponse.json(await updateConfiguredUpscaleApiBaseUrl(baseUrl));
  } catch (error: unknown) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    return NextResponse.json(await resetConfiguredUpscaleApiBaseUrl());
  } catch (error: unknown) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Upscayl 服务设置失败';
  const status = error instanceof UpscaleServiceError ? error.status : 500;
  return NextResponse.json({ error: message }, { status });
}