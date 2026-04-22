import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

function createRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost:3000/api/generate-video', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-ai-api-key': 'test-key',
            'x-ai-base-url': 'http://localhost:3001',
        },
        body: JSON.stringify(body),
    });
}

describe('generate-video route', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('submits referenceImages as real upstream images for standard video models', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ task_id: 'task-standard-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '保持 @参考图1 的角色姿态',
            model: 'veo3.1-components',
            aspectRatio: '16:9',
            duration: '5s',
            referenceImages: [
                'data:image/png;base64,QUFBQQ==',
                'data:image/png;base64,QkJCQg==',
            ],
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v2/videos/generations');

        const upstreamBody = JSON.parse(String(init?.body));
        expect(upstreamBody).toMatchObject({
            model: 'veo3.1-components',
            prompt: '保持 @参考图1 的角色姿态',
            aspect_ratio: '16:9',
            images: ['QUFBQQ==', 'QkJCQg=='],
        });
    });

    it('merges referenceImages into domestic official content payload', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: { task_id: 'task-domestic-1' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '',
            model: 'doubao-seedance-2-0-260128',
            generationMode: 'omni-reference',
            referenceImages: ['https://example.com/ref-1.png'],
            videos: ['https://example.com/ref-1.mp4'],
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/seedance/v3/contents/generations/tasks');

        const upstreamBody = JSON.parse(String(init?.body));
        expect(upstreamBody.model).toBe('doubao-seedance-2-0-260128');
        expect(upstreamBody.content).toEqual(expect.arrayContaining([
            {
                type: 'image_url',
                image_url: { url: 'https://example.com/ref-1.png' },
                role: 'reference_image',
            },
            {
                type: 'video_url',
                video_url: { url: 'https://example.com/ref-1.mp4' },
                role: 'reference_video',
            },
        ]));
    });

    it('preserves encoded taskId when upstream returns an immediate video result', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            data: {
                taskId: 'cgt-direct-video-1',
                output: {
                    video_url: 'https://example.com/direct-video.mp4',
                },
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '直接返回视频并保留 taskId',
            model: 'doubao-seedance-2-0-260128',
            aspectRatio: '16:9',
            duration: '5s',
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        await expect(response.json()).resolves.toMatchObject({
            status: 'completed',
            taskId: 'domestic-official:cgt-direct-video-1',
            videoUrl: 'https://example.com/direct-video.mp4',
        });
    });

    it('accepts camelCase taskId when the upstream only returns a pending task', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            data: {
                taskId: 'task-pending-video-1',
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '仅返回待轮询视频任务',
            model: 'veo3.1',
            aspectRatio: '16:9',
            duration: '5s',
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'task-pending-video-1',
        });
    });
});