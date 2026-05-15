import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

function createRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/generate-video', {
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

    it('submits JieKou Sora 2 text-to-video requests to the async endpoint', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ task_id: 'jk-sora-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'JieKou Sora 横版视频',
            model: 'jiekou-sora-2',
            aspectRatio: '16:9',
            duration: '12s',
            resolution: '720p',
        }, { 'x-ai-provider': 'jiekou' }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v3/async/sora-2-text2video');
        expect(JSON.parse(String(init?.body))).toEqual({
            prompt: 'JieKou Sora 横版视频',
            duration: 12,
            professional: false,
            size: '1280*720',
        });

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'jiekou:jk-sora-1',
        });
    });

    it('submits JieKou Veo 3.1 image-to-video requests with first and last frames', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ task_id: 'jk-veo-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'JieKou Veo 首尾帧视频',
            model: 'jiekou-veo-3.1',
            aspectRatio: '9:16',
            duration: '6s',
            resolution: '1080p',
            generateAudio: false,
            seed: 123,
            images: [
                { image: 'data:image/png;base64,QUFBQQ==', image_type: 'first_frame' },
                { image: 'data:image/png;base64,QkJCQg==', image_type: 'last_frame' },
            ],
        }, { 'x-ai-provider': 'jiekou' }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v3/async/veo-3.1-generate-img2video');
        expect(JSON.parse(String(init?.body))).toEqual({
            prompt: 'JieKou Veo 首尾帧视频',
            aspect_ratio: '9:16',
            duration_seconds: 6,
            enhance_prompt: true,
            generate_audio: false,
            resolution: '1080p',
            sample_count: 1,
            seed: 123,
            image: 'QUFBQQ==',
            last_image: 'QkJCQg==',
        });

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'jiekou:jk-veo-1',
        });
    });

    it('submits MagicAPI Sora videos as multipart form data', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'video-sora-1', status: 'queued' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '电影感雨夜街头',
            model: 'sora-2',
            aspectRatio: '16:9',
            duration: '10s',
            images: [{ image: 'data:image/png;base64,QUFBQQ==', image_type: 'first_frame' }],
        }, { 'x-ai-provider': 'magicapi' }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/videos');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();

        const upstreamBody = init?.body as FormData;
        expect(upstreamBody.get('model')).toBe('sora-2');
        expect(upstreamBody.get('prompt')).toBe('电影感雨夜街头');
        expect(upstreamBody.get('size')).toBe('1280x720');
        expect(upstreamBody.get('seconds')).toBe('10');
        expect(upstreamBody.get('input_reference')).toBeTruthy();

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'magicapi:video-sora-1',
        });
    });

    it('submits V-API Sora Pro text-to-video requests as JSON with fixed size mapping', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'video_vapi_text_1', status: 'queued' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'V-API Sora Pro 横版视频',
            model: 'ssora-2-pro_1280x720',
            duration: '12s',
        }, { 'x-ai-provider': 'vapi' }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/videos');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
        expect(JSON.parse(String(init?.body))).toEqual({
            model: 'sora-2-pro',
            prompt: 'V-API Sora Pro 横版视频',
            seconds: '12',
            size: '1280x720',
        });

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'vapi:video_vapi_text_1',
        });
    });

    it('submits V-API Sora image-to-video requests as multipart input_reference', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'video_vapi_image_1', status: 'queued' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'V-API Sora 首帧视频',
            model: 'sora-2-pro_1792x1024',
            duration: '8s',
            images: [{ image: 'data:image/png;base64,QUFBQQ==', image_type: 'first_frame' }],
        }, { 'x-ai-provider': 'vapi' }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/videos');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();

        const upstreamBody = init?.body as FormData;
        expect(upstreamBody.get('model')).toBe('sora-2-pro');
        expect(upstreamBody.get('prompt')).toBe('V-API Sora 首帧视频');
        expect(upstreamBody.get('seconds')).toBe('8');
        expect(upstreamBody.get('size')).toBe('1792x1024');
        expect(upstreamBody.get('input_reference')).toBeTruthy();

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'vapi:video_vapi_image_1',
        });
    });

    it('submits MKEAI Sora 2 requests as documented multipart form data', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({
            id: 'video_mkeai_1',
            object: 'video',
            status: 'queued',
            progress: 0,
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: 'MKEAI Sora 竖版首帧视频',
            model: 'mkeai-sora-2',
            aspectRatio: '9:16',
            duration: '12s',
            images: [{ image: 'data:image/png;base64,QUFBQQ==', image_type: 'first_frame' }],
        }, { 'x-ai-provider': 'mkeai' }));

        expect(response.status).toBe(200);
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3001/v1/videos');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();

        const upstreamBody = init?.body as FormData;
        expect(upstreamBody.get('model')).toBe('sora-2');
        expect(upstreamBody.get('prompt')).toBe('MKEAI Sora 竖版首帧视频');
        expect(upstreamBody.get('seconds')).toBe('12');
        expect(upstreamBody.get('size')).toBe('720x1280');
        expect(upstreamBody.get('input_reference')).toBeTruthy();

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'mkeai:video_mkeai_1',
        });
    });

    it('submits MagicAPI Grok videos with fixed pro duration and resolution', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: { task_id: 'video-grok-pro-1' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '产品广告旋转镜头',
            model: 'grok-video-3-pro',
            aspectRatio: '2:3',
            duration: '6s',
            resolution: '720p',
        }, { 'x-ai-provider': 'magicapi' }));

        expect(response.status).toBe(200);
        const [, init] = fetchSpy.mock.calls[0] ?? [];
        const upstreamBody = init?.body as FormData;
        expect(upstreamBody.get('model')).toBe('grok-video-3-pro');
        expect(upstreamBody.get('aspect_ratio')).toBe('2:3');
        expect(upstreamBody.get('seconds')).toBe('10');
        expect(upstreamBody.get('size')).toBe('720P');

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'magicapi:video-grok-pro-1',
        });
    });

    it('retries unavailable MagicAPI Veo models with Sora 2', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: {
                    code: 'model_not_found',
                    message: 'Failed to get available channel for model veo_3_1 under group default (distributor): channel not found',
                },
            }), {
                status: 400,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'video-veo-fallback-1', status: 'queued' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }));

        const response = await POST(createRequest({
            prompt: '一只老虎在跳舞',
            model: 'veo_3_1',
            aspectRatio: '16:9',
            duration: '8s',
        }, { 'x-ai-provider': 'magicapi' }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(2);

        const firstBody = fetchSpy.mock.calls[0]?.[1]?.body as FormData;
        const secondBody = fetchSpy.mock.calls[1]?.[1]?.body as FormData;
        expect(firstBody.get('model')).toBe('veo_3_1');
        expect(secondBody.get('model')).toBe('sora-2');
        expect(secondBody.get('prompt')).toBe('一只老虎在跳舞');

        await expect(response.json()).resolves.toEqual({
            status: 'pending',
            taskId: 'magicapi:video-veo-fallback-1',
        });
    });

    it('submits MagicAPI Wan models as JSON with upstream model and size split', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'video-wan-1', status: 'queued' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '雨夜街头电影镜头',
            model: 'wan2.6-t2v:1920*1080',
            aspectRatio: '16:9',
            duration: '25s',
        }, { 'x-ai-provider': 'magicapi' }));

        expect(response.status).toBe(200);
        const [, init] = fetchSpy.mock.calls[0] ?? [];
        expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');

        const upstreamBody = JSON.parse(String(init?.body));
        expect(upstreamBody).toMatchObject({
            model: 'wan2.6-t2v',
            prompt: '雨夜街头电影镜头',
            size: '1920*1080',
            seconds: '25',
            metadata: {
                output_config: {
                    aspect_ratio: '16:9',
                    audio_generation: 'Disabled',
                    resolution: '1080P',
                },
            },
        });
    });

    it('submits MagicAPI Doubao Seed 2.0 Pro models as URL-based JSON payloads', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'video-doubao-seed-pro-1', status: 'queued' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '角色从首帧走到尾帧',
            model: 'doubao-seed-2-0-pro-260215',
            aspectRatio: '9:16',
            duration: '15s',
            referenceImages: ['https://example.com/first-frame.png'],
            generationMode: 'first-last-frame',
            resolution: '720p',
            generateAudio: true,
        }, { 'x-ai-provider': 'magicapi' }));

        expect(response.status).toBe(200);
        const [, init] = fetchSpy.mock.calls[0] ?? [];
        expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');

        const upstreamBody = JSON.parse(String(init?.body));
        expect(upstreamBody).toMatchObject({
            model: 'doubao-seed-2-0-pro-260215',
            prompt: '角色从首帧走到尾帧',
            duration: 15,
            ratio: '9:16',
            resolution: '720p',
            generate_audio: true,
            reference_image_urls: ['https://example.com/first-frame.png'],
        });
    });

    it('submits MagicAPI Doubao videos as URL-based JSON payloads', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'dbv1_xxxxx', status: 'queued' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            prompt: '使用参考素材生成广告视频',
            model: 'doubao-seedance-2-0-260128',
            aspectRatio: '4:3',
            duration: '6s',
            generationMode: 'omni-reference',
            referenceImages: ['https://example.com/ref.png'],
            videos: ['https://example.com/ref.mp4'],
            audios: ['https://example.com/ref.mp3'],
            resolution: '480p',
            generateAudio: true,
        }, { 'x-ai-provider': 'magicapi' }));

        expect(response.status).toBe(200);
        const [, init] = fetchSpy.mock.calls[0] ?? [];
        expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');

        const upstreamBody = JSON.parse(String(init?.body));
        expect(upstreamBody).toMatchObject({
            model: 'doubao-seedance-2-0-260128',
            prompt: '使用参考素材生成广告视频',
            duration: 6,
            ratio: '4:3',
            resolution: '480p',
            watermark: false,
            generate_audio: true,
            reference_image_urls: ['https://example.com/ref.png'],
            reference_video_url: 'https://example.com/ref.mp4',
            audio_url: 'https://example.com/ref.mp3',
        });
    });
});
