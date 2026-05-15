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

    it('queries JieKou prefixed video tasks and extracts videos array URLs', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            task: {
                task_id: 'jk-video-1',
                status: 'TASK_STATUS_SUCCEED',
            },
            videos: [
                { video_url: 'https://example.com/jiekou-video.mp4' },
            ],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest('jiekou:jk-video-1'));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v3/async/task-result?task_id=jk-video-1');
        await expect(response.json()).resolves.toEqual({
            status: 'completed',
            videoUrl: 'https://example.com/jiekou-video.mp4',
        });
    });

    it('maps JieKou processing progress and failure reason fields', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy
            .mockResolvedValueOnce(new Response(JSON.stringify({
                task: {
                    status: 'TASK_STATUS_PROCESSING',
                    progress_percent: 37,
                },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                task: {
                    status: 'TASK_STATUS_FAILED',
                    reason: 'render failed',
                },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }));

        const processing = await GET(createRequest('jiekou:jk-video-processing'));
        expect(processing.status).toBe(200);
        await expect(processing.json()).resolves.toEqual({
            status: 'processing',
            progress: 37,
        });

        const failed = await GET(createRequest('jiekou:jk-video-failed'));
        expect(failed.status).toBe(200);
        await expect(failed.json()).resolves.toEqual({
            status: 'failed',
            error: 'render failed',
        });
    });

    it('queries V-API video status and falls back to content URL lookup', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy
            .mockResolvedValueOnce(new Response(JSON.stringify({
                id: 'video_vapi_1',
                object: 'video',
                status: 'completed',
                progress: 100,
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                url: 'https://example.com/vapi-video.mp4',
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }));

        const response = await GET(createRequest('vapi:video_vapi_1'));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/videos/video_vapi_1');
        expect(fetchSpy.mock.calls[1]?.[0]).toBe('http://localhost:3001/v1/videos/video_vapi_1/content');
        await expect(response.json()).resolves.toEqual({
            status: 'completed',
            videoUrl: 'https://example.com/vapi-video.mp4',
        });
    });
});
