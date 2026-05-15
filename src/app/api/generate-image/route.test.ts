import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { GET as GET_IMAGE_STATUS } from '../image-status/route';

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

    it('returns a local task when upstream returns an immediate image result', async () => {
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
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/generations?async=true');

        const body = await response.json();
        expect(body).toMatchObject({
            status: 'pending',
        });
        expect(body.taskId).toMatch(/^image-local:/);
        expect(body.imageUrl).toBeUndefined();
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
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/generations?async=true');

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^image-local:/);
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

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^image-local:/);
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

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^image-local:/);
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
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^magicapi-local:/);
        expect(payload.imageUrl).toBeUndefined();
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
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^magicapi-local:/);
        expect(payload.imageUrl).toBeUndefined();
    });

    it('routes JieKou Gemini 3 Pro text-to-image requests through a local task bridge', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            image_urls: ['https://example.com/jiekou-gemini.png'],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'JieKou Gemini 生图',
            model: 'gemini-3-pro-image',
            aspectRatio: '21:9',
            imageSize: '4K',
        }, {
            'x-ai-provider': 'jiekou',
        }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v3/gemini-3-pro-image-text-to-image');
        expect(JSON.parse(String(init?.body))).toEqual({
            prompt: 'JieKou Gemini 生图',
            size: '4K',
            aspect_ratio: '21:9',
            output_format: 'image/png',
        });

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^jiekou-local:/);
    });

    it('routes JieKou Nano Banana 2 image-to-image requests with size and quality mapping', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            images: ['https://example.com/jiekou-nano.png'],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'JieKou Nano 图生图',
            model: 'nano-banana-2',
            aspectRatio: '16:9',
            imageSize: '4K',
            referenceImages: ['data:image/png;base64,aGVsbG8='],
        }, {
            'x-ai-provider': 'jiekou',
        }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v3/nano-banana-2-i2i');
        expect(JSON.parse(String(init?.body))).toEqual({
            prompt: 'JieKou Nano 图生图',
            image: 'aGVsbG8=',
            size: '16x9',
            quality: '4k',
            response_format: 'url',
        });

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^jiekou-local:/);
    });

    it('routes JieKou GPT Image 2 text-to-image requests with documented size and quality', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            images: ['https://example.com/jiekou-gpt.png'],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'JieKou GPT 生图',
            model: 'gpt-image-2',
            aspectRatio: '9:16',
            imageSize: '2160x3840',
            quality: 'high',
            generateCount: 2,
        }, {
            'x-ai-provider': 'jiekou',
        }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v3/gpt-image-2-text-to-image');
        expect(JSON.parse(String(init?.body))).toEqual({
            prompt: 'JieKou GPT 生图',
            n: 2,
            size: '2160x3840',
            quality: 'high',
            background: 'auto',
            output_format: 'png',
        });

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^jiekou-local:/);
    });

    it('submits V-API nano-banana-pro text-to-image requests through image generations', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            data: [{ url: 'https://example.com/vapi-nano.png' }],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'V-API Nano 生图',
            model: 'nano-banana-pro',
            aspectRatio: '16:9',
            imageSize: '2K',
            generateCount: 2,
        }, {
            'x-ai-provider': 'vapi',
        }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/images/generations');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');

        expect(JSON.parse(String(init?.body))).toEqual({
            model: 'nano-banana-pro',
            prompt: 'V-API Nano 生图',
            response_format: 'url',
            size: '2K',
            aspect_ratio: '16:9',
            n: 2,
        });

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^vapi-local:/);
        expect(payload.imageUrl).toBeUndefined();
    });

    it('submits V-API gpt-image-2 reference edits as multipart with a V-API task id', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            id: 'vapi-image-edit-1',
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'V-API GPT 图生图',
            model: 'gpt-image-2',
            aspectRatio: '16:9',
            imageSize: '2048x1152',
            quality: 'medium',
            referenceImages: ['data:image/png;base64,aGVsbG8='],
        }, {
            'x-ai-provider': 'vapi',
        }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/images/edits');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();

        const formData = init?.body as FormData;
        expect(formData.get('model')).toBe('gpt-image-2');
        expect(formData.get('size')).toBe('2048x1152');
        expect(formData.get('quality')).toBe('medium');
        expect(formData.get('response_format')).toBe('url');
        expect(String(formData.get('prompt'))).toContain('preserve the reference subject and style');
        expect(formData.getAll('image')).toHaveLength(1);

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^vapi-local:/);
    });

    it('submits MKEAI Gemini image requests through async image generations', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            data: { task_id: 'mkeai-image-1' },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MKEAI Gemini 生图',
            model: 'gemini-3-pro-image-preview',
            aspectRatio: '9:16',
            imageSize: '4K',
            generateCount: 2,
        }, {
            'x-ai-provider': 'mkeai',
        }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/images/generations?async=true');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');

        expect(JSON.parse(String(init?.body))).toEqual({
            model: 'gemini-3-pro-image-preview',
            prompt: 'MKEAI Gemini 生图',
            response_format: 'url',
            size: '4K',
            aspect_ratio: '9:16',
            n: 2,
        });

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^mkeai-local:/);
    });

    it('submits MKEAI gpt-image-2 edits as multipart with an MKEAI task id', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            task_id: 'mkeai-gpt-edit-1',
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MKEAI GPT 图生图',
            model: 'gpt-image-2',
            aspectRatio: '16:9',
            imageSize: '2048x1152',
            quality: 'high',
            referenceImages: ['data:image/png;base64,aGVsbG8='],
        }, {
            'x-ai-provider': 'mkeai',
        }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/images/edits?async=true');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();

        const formData = init?.body as FormData;
        expect(formData.get('model')).toBe('gpt-image-2');
        expect(formData.get('size')).toBe('2048x1152');
        expect(formData.get('quality')).toBe('high');
        expect(formData.get('response_format')).toBe('url');
        expect(formData.getAll('image')).toHaveLength(1);

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^mkeai-local:/);
    });

    it('requires MKEAI image submissions to return task_id instead of accepting sync image results', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            data: [{ url: 'https://example.com/sync-mkeai-image.png' }],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MKEAI 同步兜底检查',
            model: 'gemini-3.1-flash-image-preview',
        }, {
            'x-ai-provider': 'mkeai',
        }));

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^mkeai-local:/);

        await new Promise((resolve) => setTimeout(resolve, 0));

        const statusResponse = await GET_IMAGE_STATUS(new NextRequest(`http://localhost:3000/api/image-status?taskId=${encodeURIComponent(payload.taskId)}`, {
            headers: {
                'x-ai-api-key': 'test-key',
                'x-ai-base-url': 'http://localhost:3001',
                'x-ai-provider': 'mkeai',
            },
        }));
        expect(statusResponse.status).toBe(200);
        await expect(statusResponse.json()).resolves.toEqual({
            status: 'failed',
            error: 'MKEAI 图片生成未返回 task_id，无法按异步任务查询结果',
        });
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
        expect(timeoutSpy).toHaveBeenCalledWith(300000);
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

    it('returns a local task for MagicAPI GPT image submissions even when background submit times out', async () => {
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
        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^magicapi-local:/);
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

        const payload = await response.json();
        expect(payload.status).toBe('pending');
        expect(payload.taskId).toMatch(/^magicapi-local:/);
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