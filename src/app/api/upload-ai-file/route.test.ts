import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

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
    const originalPublicBaseUrl = process.env.OPENLOVART_PUBLIC_BASE_URL;
    const originalUploadDir = process.env.OPENLOVART_REFERENCE_UPLOAD_DIR;
    let tempRoot: string;

    beforeEach(() => {
        vi.restoreAllMocks();
        tempRoot = '';
        delete process.env.OPENLOVART_PUBLIC_BASE_URL;
        delete process.env.OPENLOVART_REFERENCE_UPLOAD_DIR;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        if (originalPublicBaseUrl === undefined) {
            delete process.env.OPENLOVART_PUBLIC_BASE_URL;
        } else {
            process.env.OPENLOVART_PUBLIC_BASE_URL = originalPublicBaseUrl;
        }
        if (originalUploadDir === undefined) {
            delete process.env.OPENLOVART_REFERENCE_UPLOAD_DIR;
        } else {
            process.env.OPENLOVART_REFERENCE_UPLOAD_DIR = originalUploadDir;
        }
        if (tempRoot) {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    async function configurePublicUploadRuntime() {
        tempRoot = await fs.mkdtemp(path.join(tmpdir(), 'openlovart-upload-test-'));
        process.env.OPENLOVART_PUBLIC_BASE_URL = 'https://lovart-public.example.com';
        process.env.OPENLOVART_REFERENCE_UPLOAD_DIR = tempRoot;
    }

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

    it('creates a Laomandi asset from a public file URL and waits until it is active', async () => {
        await configurePublicUploadRuntime();
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({ Id: 'group-reference-media' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ Id: 'Asset-reference-video' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ Id: 'Asset-reference-video', Status: 'Active' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }));

        const response = await POST(createRequest({
            'x-ai-provider': 'laomandi',
            'x-ai-base-url': 'https://ark.cn-beijing.volces.com/api/v3',
        }));
        const body = await readJson(response);

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.laomandi.com/asset/CreateAssetGroup');
        expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://api.laomandi.com/asset/CreateAsset');
        expect(fetchSpy.mock.calls[2]?.[0]).toBe('https://api.laomandi.com/asset/GetAsset');
        expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
            'Content-Type': 'application/json',
            'sd-key': 'test-key',
        });
        const createAssetBody = JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
        expect(createAssetBody.GroupId).toBe('group-reference-media');
        expect(createAssetBody.AssetType).toBe('Video');
        expect(createAssetBody.URL).toMatch(/^https:\/\/lovart-public\.example\.com\/api\/upload-ai-file\?asset=/);
        expect(body).toMatchObject({
            reference: 'asset://Asset-reference-video',
            filename: 'reference.mp4',
        });

        const publicUrl = new URL(String(createAssetBody.URL));
        const servedResponse = await GET(new NextRequest(publicUrl));
        expect(servedResponse.status).toBe(200);
        expect(servedResponse.headers.get('content-type')).toBe('video/mp4');
        await expect(servedResponse.arrayBuffer()).resolves.toHaveProperty('byteLength', 4);
    });

    it('explains that Laomandi local uploads need a public HTTPS base URL', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const response = await POST(createRequest({
            'x-ai-provider': 'laomandi',
            'x-ai-base-url': 'https://ark.cn-beijing.volces.com/api/v3',
        }));
        const body = await readJson(response);

        expect(response.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(body.error).toBe('上传参考素材失败');
        expect(String(body.details)).toContain('HTTPS 公网访问地址');
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
