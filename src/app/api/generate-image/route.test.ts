import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

function createRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost:3000/api/generate-image', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-ai-api-key': 'test-key',
            'x-ai-base-url': 'http://localhost:3001',
        },
        body: JSON.stringify(body),
    });
}

describe('generate-image route', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('preserves taskId when upstream returns an immediate image result', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            taskId: 'task-direct-image-1',
            data: {
                images: ['https://example.com/direct-image.png'],
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '直接返回图片并保留 taskId',
            model: 'nano-banana-2',
            aspectRatio: '21:9',
            imageSize: '2K',
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const body = await response.json();
        expect(body).toMatchObject({
            status: 'completed',
            taskId: 'task-direct-image-1',
        });
        expect(typeof body.imageUrl).toBe('string');
        expect(body.imageUrl.length).toBeGreaterThan(0);
    });

    it('accepts camelCase taskId when the upstream only returns a pending task', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            data: {
                taskId: 'task-pending-image-1',
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '仅返回待轮询任务',
            model: 'gemini-3.1-flash-image-preview',
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'task-pending-image-1',
        });
    });
});