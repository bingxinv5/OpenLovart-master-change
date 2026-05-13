import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMagicApiLocalImageJob } from '../_shared/magicapi-image-jobs';
import { GET } from './route';

function createRequest(taskId: string, headers: Record<string, string> = {}) {
    return new NextRequest(`http://localhost:3000/api/image-status?taskId=${encodeURIComponent(taskId)}`, {
        headers: {
            'x-ai-api-key': 'test-key',
            'x-ai-base-url': 'http://localhost:3001',
            ...headers,
        },
    });
}

describe('image-status route', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('recovers completed MagicAPI image tasks from platform log-shaped responses', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            task_id: 'gemini-img-0373aa1881d7',
            status: 'SUCCESS',
            data: {
                image_url: 'https://example.com/gemini-image.png',
                image_urls: ['https://example.com/gemini-image.png'],
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest('gemini-img-0373aa1881d7', {
            'x-ai-provider': 'magicapi',
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/gemini-img-0373aa1881d7');

        const body = await response.json();
        expect(body.status).toBe('completed');
        expect(body.imageUrl).toContain('/api/proxy-download');
        expect(body.images).toHaveLength(1);
    });

    it('auto-detects raw MagicAPI image task ids without an explicit provider header', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            task_id: 'image-961136b2a525',
            status: 'SUCCESS',
            data: {
                image_url: 'https://example.com/raw-magicapi-task.png',
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest('image-961136b2a525'));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/image-961136b2a525');

        const body = await response.json();
        expect(body.status).toBe('completed');
        expect(body.imageUrl).toContain('/api/proxy-download');
    });

    it('reports local MagicAPI bridge tasks as processing while the platform task id is still pending', async () => {
        const taskId = createMagicApiLocalImageJob(() => new Promise(() => {}));

        const response = await GET(createRequest(taskId));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: 'processing',
            progress: 1,
        });
    });

    it('returns completed results from local MagicAPI bridge tasks', async () => {
        const taskId = createMagicApiLocalImageJob(async () => ({
            data: {
                data: [{ url: 'https://example.com/local-bridge-result.png' }],
            },
        }));
        await Promise.resolve();
        await Promise.resolve();

        const response = await GET(createRequest(taskId));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.status).toBe('completed');
        expect(body.imageUrl).toContain('/api/proxy-download');
    });

    it('recovers completed MagicAPI image tasks from root result_url fields', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            task_id: 'image-result-url-only',
            status: 'SUCCESS',
            result_url: 'https://example.com/result-url-only.png',
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest('magicapi:image-result-url-only', {
            'x-ai-provider': 'magicapi',
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.status).toBe('completed');
        expect(body.imageUrl).toContain('/api/proxy-download');
    });

    it('falls back to the MagicAPI async task endpoint for prefixed task ids', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'not found' } }), {
                status: 404,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: {
                    task_id: 'image-28aba92cbfe0',
                    status: 'SUCCESS',
                    data: {
                        data: [
                            { url: 'https://example.com/gpt-image.png' },
                        ],
                    },
                },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }));

        const response = await GET(createRequest('magicapi:image-28aba92cbfe0', {
            'x-ai-provider': 'magicapi',
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/image-28aba92cbfe0');
        expect(fetchSpy.mock.calls[1]?.[0]).toBe('http://localhost:3001/v1/images/tasks/image-28aba92cbfe0');

        const body = await response.json();
        expect(body.status).toBe('completed');
        expect(body.imageUrl).toContain('/api/proxy-download');
    });

    it('explains when the MagicAPI gateway does not expose image task query URLs', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: 'Invalid URL (GET /v1/images/image-961136b2a525)',
            }), {
                status: 404,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: 'Invalid URL (GET /v1/images/tasks/image-961136b2a525)',
            }), {
                status: 404,
                headers: { 'content-type': 'application/json' },
            }));

        const response = await GET(createRequest('image-961136b2a525'));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.status).toBe('failed');
        expect(body.error).toContain('未开放图片 task_id 查询接口');
    });
});