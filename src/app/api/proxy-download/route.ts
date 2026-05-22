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
        const rangeHeader = request.headers.get('range');

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
                return createAssetResponse(cachedAsset.data, cachedAsset.contentType, disposition, rangeHeader, 'HIT');
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
                const { cacheKey } = await writeCachedAsset(url, buffer, contentType);
                console.log(`[proxy-download] Cached ${buffer.byteLength} bytes → ${cacheKey}`);
            } catch { /* 缓存写入失败不影响正常响应 */ }

            return createAssetResponse(buffer, contentType, disposition, rangeHeader, 'MISS');
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

type ByteRange = {
    start: number;
    end: number;
};

function parseByteRange(rangeHeader: string | null, size: number): ByteRange | null | 'invalid' {
    if (!rangeHeader) return null;

    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match || size <= 0) return 'invalid';

    const [, rawStart, rawEnd] = match;
    if (!rawStart && !rawEnd) return 'invalid';

    if (!rawStart) {
        const suffixLength = Number.parseInt(rawEnd, 10);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) return 'invalid';
        const start = Math.max(size - suffixLength, 0);
        return { start, end: size - 1 };
    }

    const start = Number.parseInt(rawStart, 10);
    const end = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
        return 'invalid';
    }

    return { start, end: Math.min(end, size - 1) };
}

function createAssetResponse(
    data: Buffer,
    contentType: string,
    disposition: string,
    rangeHeader: string | null,
    cacheStatus: 'HIT' | 'MISS',
) {
    const size = data.byteLength;
    const parsedRange = parseByteRange(rangeHeader, size);
    const baseHeaders = {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'no-cache',
        'Accept-Ranges': 'bytes',
        'X-Cache': cacheStatus,
    };

    if (parsedRange === 'invalid') {
        return new NextResponse(null, {
            status: 416,
            headers: {
                ...baseHeaders,
                'Content-Range': `bytes */${size}`,
            },
        });
    }

    if (parsedRange) {
        const chunk = data.subarray(parsedRange.start, parsedRange.end + 1);
        return new NextResponse(new Uint8Array(chunk), {
            status: 206,
            headers: {
                ...baseHeaders,
                'Content-Length': chunk.byteLength.toString(),
                'Content-Range': `bytes ${parsedRange.start}-${parsedRange.end}/${size}`,
            },
        });
    }

    return new NextResponse(new Uint8Array(data), {
        headers: {
            ...baseHeaders,
            'Content-Length': size.toString(),
        },
    });
}
