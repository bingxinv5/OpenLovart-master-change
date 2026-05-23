import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

function createRequest(headers: Record<string, string> = {}, file = createTestFile()) {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return new NextRequest('http://localhost:3000/api/upload-ai-file', {
        method: 'POST',
        headers: {
            'x-ai-api-key': 'test-key',
            ...headers,
        },
        body: formData,
    });
}

function createTestFile() {
    return new File([new Uint8Array([0, 1, 2, 3])], 'reference.mp4', { type: 'video/mp4' });
}

async function readJson(response: Response) {
    return await response.json() as Record<string, unknown>;
}

describe('upload-ai-file route', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uploads reference files through the configured file endpoint', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            data: { url: 'https://assets.example.com/reference.mp4' },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({ 'x-ai-base-url': 'https://api.bltcy.ai/v1' }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.bltcy.ai/v1/files');
        const [, init] = fetchSpy.mock.calls[0] ?? [];
        expect(init?.body).toBeInstanceOf(FormData);
        const upstreamForm = init?.body as FormData;
        expect(upstreamForm.get('file')).toBeInstanceOf(File);
        expect(upstreamForm.get('purpose')).toBeNull();
        await expect(readJson(response)).resolves.toMatchObject({
            reference: 'https://assets.example.com/reference.mp4',
            filename: 'reference.mp4',
            mimeType: 'video/mp4',
            bytes: 4,
        });
    });

    it('retries with an assistants purpose when the default upload fails', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'file-reference-video' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }));

        const response = await POST(createRequest({ 'x-ai-base-url': 'https://api.bltcy.ai' }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.bltcy.ai/v1/files');
        expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://api.bltcy.ai/v1/files');
        expect((fetchSpy.mock.calls[0]?.[1]?.body as FormData).get('purpose')).toBeNull();
        expect((fetchSpy.mock.calls[1]?.[1]?.body as FormData).get('purpose')).toBe('assistants');
        await expect(readJson(response)).resolves.toMatchObject({
            reference: 'asset://file-reference-video',
        });
    });

    it('uses the Laomandi asset endpoint when the video base URL points at Ark official APIs', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            data: { url: 'https://assets.laomandi.com/reference.mp4' },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));

        const response = await POST(createRequest({
            'x-ai-provider': 'laomandi',
            'x-ai-base-url': 'https://ark.cn-beijing.volces.com/api/v3',
        }));

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.laomandi.com/v1/files');
    });

    it('returns a readable gateway error when all upload attempts fail', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }))
            .mockResolvedValueOnce(new Response('upstream file upload disabled', { status: 404 }));

        const response = await POST(createRequest({ 'x-ai-base-url': 'https://api.bltcy.ai' }));
        const body = await readJson(response);

        expect(response.status).toBe(502);
        expect(body.error).toBe('上传参考素材失败');
        expect(String(body.details)).toContain('HTTP 500');
        expect(String(body.details)).toContain('upstream file upload disabled');
    });
});
