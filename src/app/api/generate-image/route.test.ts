import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

function createRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/generate-image', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-ai-api-key': 'test-key',
            'x-ai-base-url': 'http://localhost:3001',
            ...headers,
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

    it('routes MagicAPI Gemini image models through native generateContent', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'image/png',
                                    data: 'aW1hZ2UtZGF0YQ==',
                                },
                            },
                        ],
                    },
                },
            ],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MagicAPI Gemini 原生生图',
            model: 'gemini-3-pro-image-preview',
            aspectRatio: '16:9',
            imageSize: '2K',
            referenceImages: ['data:image/png;base64,aGVsbG8='],
            forceAsync: true,
        }, {
            'x-ai-provider': 'magicapi',
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1beta/models/gemini-3-pro-image-preview:generateContent');
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                mimeType: 'image/png',
                                data: 'aGVsbG8=',
                            },
                        },
                        { text: 'MagicAPI Gemini 原生生图' },
                    ],
                },
            ],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
                temperature: 1,
                topP: 0.95,
                maxOutputTokens: 8192,
                imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
            },
        });

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^magicapi-local:/);
    });

    it('passes documented MagicAPI Gemini 4K image size through native payloads', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            status: 'SUCCESS',
            data: {
                image_url: 'https://example.com/gemini-flash-4k.png',
                image_urls: ['https://example.com/gemini-flash-4k.png'],
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MagicAPI Gemini Flash 4K',
            model: 'gemini-3.1-flash-image-preview',
            aspectRatio: '1:1',
            imageSize: '4K',
        }, {
            'x-ai-provider': 'magicapi',
        }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1beta/models/gemini-3.1-flash-image-preview:generateContent');
        const body = JSON.parse(String(init?.body));
        expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '1:1', imageSize: '4K' });

        const payload = await response.json();
        expect(payload.status).toBe('completed');
        expect(payload.imageUrl).toContain('/api/proxy-download');
        expect(payload.images).toHaveLength(1);
    });

    it('extracts MagicAPI Gemini markdown image URLs from native text parts', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: '生成完成：![image](https://example.com/gemini-from-text.png)',
                            },
                        ],
                    },
                },
            ],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MagicAPI Gemini 文本图片链接',
            model: 'gemini-3-pro-image-preview',
            aspectRatio: '1:1',
            imageSize: '1K',
        }, {
            'x-ai-provider': 'magicapi',
        }));

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.status).toBe('completed');
        expect(payload.imageUrl).toContain('/api/proxy-download');
        expect(payload.images).toHaveLength(1);
    });

    it('builds MagicAPI GPT image payloads with the GeekNow option profile', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            task_id: 'image-async-gpt-pro-1',
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MagicAPI GPT 生图',
            model: 'gpt-image-2-pro',
            aspectRatio: '16:9',
            imageSize: '3840x2160',
            quality: 'low',
            generateCount: 4,
            forceAsync: true,
        }, {
            'x-ai-provider': 'magicapi',
        }));

        expect(response.status).toBe(200);
        expect(timeoutSpy).not.toHaveBeenCalled();
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/images/generations');
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
            model: 'gpt-image-2-pro',
            prompt: 'MagicAPI GPT 生图',
            n: 1,
            size: '3840x2160',
            quality: 'high',
            response_format: 'url',
        });

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^magicapi-local:/);
    });

    it('returns a local task for MagicAPI background GPT image submissions even if background submit later fails', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const timeoutError = new Error('The operation was aborted due to timeout');
        timeoutError.name = 'TimeoutError';
        fetchSpy.mockRejectedValue(timeoutError);

        const response = await POST(createRequest({
            prompt: 'MagicAPI GPT 异步慢提交',
            model: 'gpt-image-2-pro',
            aspectRatio: '1:1',
            imageSize: '2048x2048',
            forceAsync: true,
        }, {
            'x-ai-provider': 'magicapi',
        }));

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/generations');
        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^magicapi-local:/);
    });

    it('does not retry MagicAPI GPT image submissions after a long synchronous submit timeout', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const timeoutError = new Error('The operation was aborted due to timeout');
        timeoutError.name = 'TimeoutError';
        fetchSpy.mockRejectedValue(timeoutError);

        const response = await POST(createRequest({
            prompt: 'MagicAPI GPT 慢任务',
            model: 'gpt-image-2-pro',
            aspectRatio: '1:1',
            imageSize: '2048x2048',
        }, {
            'x-ai-provider': 'magicapi',
        }));

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(504);
        const payload = await response.json();
        expect(payload.details).toContain('上游生成耗时过长');
        expect(payload.details).toContain('已等待约 300 秒');
    });

    it('builds MagicAPI Doubao image payloads from the plugin aspect-ratio size map', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            data: [{ url: 'https://example.com/doubao.png' }],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MagicAPI Doubao 生图',
            model: 'doubao-seedream-5-0-260128',
            aspectRatio: '21:9',
            imageSize: '2K',
            generateCount: 3,
        }, {
            'x-ai-provider': 'magicapi',
        }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/images/generations');
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({
            model: 'doubao-seedream-5-0-260128',
            prompt: 'MagicAPI Doubao 生图',
            n: 1,
            size: '3024x1296',
        });
    });

    it('returns a local task for MagicAPI Doubao submissions when forceAsync is enabled', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            data: [{ url: 'https://example.com/doubao-async.png' }],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MagicAPI Doubao 异步生图',
            model: 'doubao-seedream-5-0-260128',
            aspectRatio: '16:9',
            imageSize: '2K',
            forceAsync: true,
        }, {
            'x-ai-provider': 'magicapi',
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/generations');

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^magicapi-local:/);
    });
});