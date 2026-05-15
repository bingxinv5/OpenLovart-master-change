import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultLocalImageJob } from '../_shared/default-image-tasks';
import { createJieKouLocalImageJob } from '../_shared/jiekou-image-tasks';
import { createMagicApiLocalImageJob } from '../_shared/magicapi-image-jobs';
import { createVApiLocalImageJob } from '../_shared/vapi-image-tasks';
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

    it('returns completed results from local JieKou bridge tasks', async () => {
        const taskId = createJieKouLocalImageJob(async () => ({
            data: {
                image_urls: ['https://example.com/jiekou-local-result.png'],
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

    it('returns completed results from local V-API bridge tasks', async () => {
        const taskId = createVApiLocalImageJob(async () => ({
            data: {
                data: [{ url: 'https://example.com/vapi-local-result.png' }],
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

    it('returns completed results from local default bridge tasks', async () => {
        const taskId = createDefaultLocalImageJob(async () => ({
            data: {
                data: [{ url: 'https://example.com/default-local-result.png' }],
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

    it('reports local JieKou bridge submission failures', async () => {
        const taskId = createJieKouLocalImageJob(async () => {
            throw new Error('route not found');
        });
        await Promise.resolve();
        await Promise.resolve();

        const response = await GET(createRequest(taskId));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: 'failed',
            error: 'route not found',
        });
    });

    it('polls upstream task ids from local V-API bridge tasks', async () => {
        const taskId = createVApiLocalImageJob(async () => ({
            data: { id: 'vapi-upstream-1' },
            upstreamTaskId: 'vapi-upstream-1',
        }));
        await Promise.resolve();
        await Promise.resolve();

        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            id: 'vapi-upstream-1',
            status: 'completed',
            data: [{ url: 'https://example.com/vapi-upstream-result.png' }],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest(taskId));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/tasks/vapi-upstream-1');
        const body = await response.json();
        expect(body.status).toBe('completed');
        expect(body.imageUrl).toContain('/api/proxy-download');
    });

    it('polls upstream task ids from local default bridge tasks', async () => {
        const taskId = createDefaultLocalImageJob(async () => ({
            data: { taskId: 'default-upstream-1' },
            upstreamTaskId: 'default-upstream-1',
        }));
        await Promise.resolve();
        await Promise.resolve();

        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            taskId: 'default-upstream-1',
            status: 'completed',
            data: [{ url: 'https://example.com/default-upstream-result.png' }],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest(taskId));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/tasks/default-upstream-1');
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

    it('polls completed JieKou image tasks through the unified async task-result endpoint', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            task: {
                task_id: 'jk-image-1',
                status: 'TASK_STATUS_SUCCEED',
            },
            images: [
                { image_url: 'https://example.com/jiekou-image.png' },
            ],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest('jiekou:jk-image-1'));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v3/async/task-result?task_id=jk-image-1');

        const body = await response.json();
        expect(body.status).toBe('completed');
        expect(body.imageUrl).toContain('/api/proxy-download');
        expect(body.images).toHaveLength(1);
    });

    it('maps JieKou processing and failed image task statuses', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy
            .mockResolvedValueOnce(new Response(JSON.stringify({
                task: {
                    task_id: 'jk-image-processing',
                    status: 'TASK_STATUS_PROCESSING',
                    progress_percent: 37,
                },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                task: {
                    task_id: 'jk-image-failed',
                    status: 'TASK_STATUS_FAILED',
                    reason: '余额不足',
                },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }));

        const processing = await GET(createRequest('jiekou:jk-image-processing'));
        expect(processing.status).toBe(200);
        await expect(processing.json()).resolves.toEqual({
            status: 'processing',
            progress: 37,
        });

        const failed = await GET(createRequest('jiekou:jk-image-failed'));
        expect(failed.status).toBe(200);
        await expect(failed.json()).resolves.toEqual({
            status: 'failed',
            error: '余额不足',
        });
    });

    it('polls completed V-API image tasks through the OpenAI-compatible task endpoint', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            id: 'vapi-image-1',
            status: 'completed',
            data: [
                { url: 'https://example.com/vapi-image.png' },
            ],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await GET(createRequest('vapi:vapi-image-1'));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:3001/v1/images/tasks/vapi-image-1');

        const body = await response.json();
        expect(body.status).toBe('completed');
        expect(body.imageUrl).toContain('/api/proxy-download');
        expect(body.images).toHaveLength(1);
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