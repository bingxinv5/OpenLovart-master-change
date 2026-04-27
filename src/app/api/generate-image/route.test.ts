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

    it('routes gpt-image-2 reference-image requests through edits multipart', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            taskId: 'task-gpt-edits-1',
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '根据参考图生成海报',
            model: 'gpt-image-2',
            aspectRatio: '16:9',
            imageSize: '2048x1152',
            quality: 'high',
            referenceImages: ['data:image/png;base64,aGVsbG8='],
            forceAsync: true,
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/images/edits?async=true');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
            Authorization: 'Bearer test-key',
        });
        expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
        expect(init?.body).toBeInstanceOf(FormData);

        const formData = init?.body as FormData;
        expect(formData.get('model')).toBe('gpt-image-2');
        expect(formData.get('size')).toBe('2048x1152');
        expect(formData.get('quality')).toBe('high');
        expect(formData.get('response_format')).toBe('url');
        expect(formData.getAll('image')).toHaveLength(1);

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'task-gpt-edits-1',
        });
    });

    it('passes gpt-image-2 auto size through generations without ratio compensation', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            task_id: 'task-gpt-auto-1',
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '自动尺寸构图',
            model: 'gpt-image-2',
            aspectRatio: '16:9',
            imageSize: 'auto',
            quality: 'low',
            forceAsync: true,
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/images/generations?async=true');
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
            model: 'gpt-image-2',
            prompt: '自动尺寸构图',
            size: 'auto',
            quality: 'low',
        });
        expect(body.prompt).not.toContain('Composition requirements:');

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'task-gpt-auto-1',
        });
    });
});