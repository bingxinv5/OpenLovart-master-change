import { NextRequest, NextResponse } from 'next/server';
import {
    readCachedAsset,
    validateRemoteUrl,
    writeCachedAsset,
} from '../_shared/cdn-cache';

/**
 * CDN 本地缓存路由
 *
 * GET  ?url=<remote>  → 从缓存目录读取，命中则直接返回文件，未命中返回 404
 * POST ?url=<remote>  → 浏览器端下载成功后将 blob 推送到服务端缓存
 *
 * 缓存目录：当前运行实例配置目录，未配置时回退到默认 .cdn-cache/
 * 文件名：URL 的 sha256 前 16 字符 + 原始扩展名
 */

// ── GET: 读取缓存 ──────────────────────────────────────────
export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
        return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
    }

    try {
        const cachedAsset = await readCachedAsset(url);
        if (!cachedAsset) {
            return NextResponse.json({ cached: false }, { status: 404 });
        }

        return new NextResponse(new Uint8Array(cachedAsset.data), {
            headers: {
                'Content-Type': cachedAsset.contentType,
                'Content-Length': cachedAsset.data.byteLength.toString(),
                'Cache-Control': 'public, max-age=86400',
                'X-Cache': 'HIT',
            },
        });
    } catch {
        return NextResponse.json({ cached: false }, { status: 404 });
    }
}

// ── POST: 写入缓存 ─────────────────────────────────────────
export async function POST(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
        return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
    }

    // 验证 URL 合法性，防止任意路径写入
    try {
        await validateRemoteUrl(url);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '无效的 URL' },
            { status: 400 },
        );
    }

    try {
        const blob = await request.blob();
        if (blob.size === 0 || blob.size > 50 * 1024 * 1024) {
            return NextResponse.json({ error: '数据为空或超过 50MB 限制' }, { status: 400 });
        }

        const buffer = Buffer.from(await blob.arrayBuffer());
        const { cacheKey } = await writeCachedAsset(url, buffer, blob.type || 'image/png');

        console.log(`[cdn-cache] Cached ${blob.size} bytes → ${cacheKey}`);

        return NextResponse.json({ cached: true, size: blob.size });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[cdn-cache] Write error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
