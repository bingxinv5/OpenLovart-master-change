import { NextResponse } from 'next/server';
import {
  clearConfiguredCdnCacheDirectory,
  RemoteFetchError,
} from '../../_shared/cdn-cache';

export async function POST() {
  try {
    return NextResponse.json(await clearConfiguredCdnCacheDirectory());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '清空缓存失败';
    const status = error instanceof RemoteFetchError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}