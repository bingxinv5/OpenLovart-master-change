import { NextRequest, NextResponse } from 'next/server';
import {
  getCdnCacheDirectoryStatus,
  RemoteFetchError,
  resetConfiguredCdnCacheDirectory,
  updateConfiguredCdnCacheDirectory,
} from '../../_shared/cdn-cache';

export async function GET() {
  try {
    return NextResponse.json(await getCdnCacheDirectoryStatus());
  } catch (error: unknown) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { directory?: unknown };
    const directory = typeof body.directory === 'string' ? body.directory : '';

    if (!directory.trim()) {
      return NextResponse.json(await resetConfiguredCdnCacheDirectory());
    }

    return NextResponse.json(await updateConfiguredCdnCacheDirectory(directory));
  } catch (error: unknown) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    return NextResponse.json(await resetConfiguredCdnCacheDirectory());
  } catch (error: unknown) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '缓存目录设置失败';
  const status = error instanceof RemoteFetchError ? error.status : 500;
  return NextResponse.json({ error: message }, { status });
}