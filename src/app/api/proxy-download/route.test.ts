import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_shared/cdn-cache', () => ({
    fetchRemoteAsset: vi.fn(),
    MAX_REMOTE_ASSET_BYTES: 25 * 1024 * 1024,
    readCachedAsset: vi.fn(),
    RemoteFetchError: class RemoteFetchError extends Error {
        status: number;

        constructor(message: string, status = 400) {
            super(message);
            this.status = status;
        }
    },
    validateRemoteUrl: vi.fn(),
    writeCachedAsset: vi.fn(),
}));

import { GET } from './route';
import { fetchRemoteAsset, readCachedAsset, validateRemoteUrl, writeCachedAsset } from '../_shared/cdn-cache';

function createRequest(headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/proxy-download?url=https%3A%2F%2Fexample.com%2Fvideo.mp4&filename=test-video&inline=1', {
        headers,
    });
}

async function readText(response: Response) {
    return Buffer.from(await response.arrayBuffer()).toString('utf-8');
}

describe('proxy-download route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(validateRemoteUrl).mockResolvedValue(new URL('https://example.com/video.mp4'));
        vi.mocked(writeCachedAsset).mockResolvedValue({ cacheKey: 'video.mp4' });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('serves byte ranges from cached video assets', async () => {
        vi.mocked(readCachedAsset).mockResolvedValue({
            data: Buffer.from('abcdefghij'),
            contentType: 'video/mp4',
            cacheKey: 'cached-video.mp4',
        });

        const response = await GET(createRequest({ range: 'bytes=2-5' }));

        expect(response.status).toBe(206);
        expect(response.headers.get('accept-ranges')).toBe('bytes');
        expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
        expect(response.headers.get('content-length')).toBe('4');
        expect(response.headers.get('x-cache')).toBe('HIT');
        await expect(readText(response)).resolves.toBe('cdef');
        expect(fetchRemoteAsset).not.toHaveBeenCalled();
    });

    it('caches remote video assets before serving requested ranges', async () => {
        vi.mocked(readCachedAsset).mockResolvedValue(null);
        vi.mocked(fetchRemoteAsset).mockResolvedValue({
            buffer: Buffer.from('0123456789'),
            contentType: 'video/mp4',
            url: new URL('https://example.com/video.mp4'),
        });

        const response = await GET(createRequest({ range: 'bytes=1-3' }));

        expect(writeCachedAsset).toHaveBeenCalledWith('https://example.com/video.mp4', Buffer.from('0123456789'), 'video/mp4');
        expect(response.status).toBe(206);
        expect(response.headers.get('content-range')).toBe('bytes 1-3/10');
        expect(response.headers.get('x-cache')).toBe('MISS');
        await expect(readText(response)).resolves.toBe('123');
    });

    it('returns 416 for invalid media ranges', async () => {
        vi.mocked(readCachedAsset).mockResolvedValue({
            data: Buffer.from('abc'),
            contentType: 'video/mp4',
            cacheKey: 'cached-video.mp4',
        });

        const response = await GET(createRequest({ range: 'bytes=20-30' }));

        expect(response.status).toBe(416);
        expect(response.headers.get('content-range')).toBe('bytes */3');
        expect(response.headers.get('accept-ranges')).toBe('bytes');
    });
});