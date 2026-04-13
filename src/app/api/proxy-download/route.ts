import { NextRequest, NextResponse } from 'next/server';
import {
    fetchRemoteAsset,
    MAX_REMOTE_ASSET_BYTES,
    readCachedAsset,
    RemoteFetchError,
    validateRemoteUrl,
    writeCachedAsset,
} from '../_shared/cdn-cache';

export async function GET(request: NextRequest) {
    try {
        const url = request.nextUrl.searchParams.get('url');
        const filename = request.nextUrl.searchParams.get('filename') || 'lovart-download';
        const inline = request.nextUrl.searchParams.get('inline') === '1';
        const disposition = `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(sanitizeFilename(filename))}"`;

        if (!url) {
            return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
        }

        // Validate URL
        try {
            await validateRemoteUrl(url);
        } catch (error) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : '无效的 URL' },
                { status: error instanceof RemoteFetchError ? error.status : 400 },
            );
        }

        // ── 优先从本地缓存读取 ──────────────────────────────
        try {
            const cachedAsset = await readCachedAsset(url);

            if (cachedAsset) {
                console.log(`[proxy-download] Cache HIT: ${cachedAsset.cacheKey}`);
                return new NextResponse(new Uint8Array(cachedAsset.data), {
                    headers: {
                        'Content-Type': cachedAsset.contentType,
                        'Content-Disposition': disposition,
                        'Content-Length': cachedAsset.data.byteLength.toString(),
                        'Cache-Control': 'no-cache',
                        'X-Cache': 'HIT',
                    },
                });
            }
        } catch {
            // 缓存未命中，继续远程下载
        }

        try {
            const { buffer, contentType } = await fetchRemoteAsset(url, {
                timeoutMs: 60_000,
                maxBytes: MAX_REMOTE_ASSET_BYTES,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            // ── 异步写入本地缓存（不阻塞响应）────────────────────
            try {
                void writeCachedAsset(url, buffer, contentType)
                    .then(({ cacheKey }) => {
                        console.log(`[proxy-download] Cached ${buffer.byteLength} bytes → ${cacheKey}`);
                    })
                    .catch(() => {});
            } catch { /* 缓存写入失败不影响正常响应 */ }

            return new NextResponse(new Uint8Array(buffer), {
                headers: {
                    'Content-Type': contentType,
                    'Content-Disposition': disposition,
                    'Content-Length': buffer.byteLength.toString(),
                    'Cache-Control': 'no-cache',
                },
            });
        } catch (fetchErr: unknown) {
            const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            console.error('[proxy-download] Fetch failed:', errMsg);
            return NextResponse.json(
                { error: '无法下载文件', details: errMsg },
                { status: fetchErr instanceof RemoteFetchError ? fetchErr.status : 502 }
            );
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '未知错误';
        console.error('[proxy-download] Error:', message);
        return NextResponse.json(
            { error: '下载失败', details: message },
            { status: 500 }
        );
    }
}

function sanitizeFilename(filename: string): string {
    const trimmed = filename.trim();
    const safeName = trimmed.replace(/[\\/:*?"<>|\r\n]+/g, '_');
    return safeName || 'lovart-download';
}
