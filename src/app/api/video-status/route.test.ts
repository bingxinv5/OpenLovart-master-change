import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

function createRequest(taskId: string, headers: Record<string, string> = {}) {
    return new NextRequest(`http://localhost:3000/api/video-status?taskId=${encodeURIComponent(taskId)}`, {
        headers: {
            'x-ai-api-key': 'test-key',
            'x-ai-base-url': 'http://localhost:3001',
            ...headers,
        },
    });
}

describe('video-status route', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('queries MagicAPI prefixed video tasks and extracts root output URLs', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            id: 'video_123',
            status: 'completed',
            output: { url: 'https://example.com/output.mp4' },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest('magicapi:video_123'));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/videos/video_123');
        await expect(response.json()).resolves.toEqual({
            status: 'completed',
            videoUrl: 'https://example.com/output.mp4',
        });
    });

    it('normalizes MagicAPI fractional progress from detail.pending_info', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            id: 'video_456',
            status: 'in_progress',
            detail: {
                pending_info: {
                    progress_pct: 0.42,
                },
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest('magicapi:video_456'));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: 'processing',
            progress: 42,
        });
    });

    it('extracts MagicAPI failure reasons from detail.pending_info', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            id: 'video_789',
            status: 'failed',
            detail: {
                pending_info: {
                    failure_reason: 'content rejected',
                },
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest('magicapi:video_789'));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: 'failed',
            error: 'content rejected',
        });
    });
});
