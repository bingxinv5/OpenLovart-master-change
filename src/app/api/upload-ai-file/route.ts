import { NextRequest, NextResponse } from 'next/server';
import {
    AI_UPSTREAM_TIMEOUT_MS,
    createAiHeaders,
    createUpstreamConnectionError,
    getApiErrorMessage,
    getErrorMessage,
    getNestedValue,
    handleApiRouteError,
    parseJsonResponse,
    resolveAiServiceConfig,
} from '../_shared/ai-service';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!(file instanceof File)) {
            return NextResponse.json({ error: '缺少上传文件' }, { status: 400 });
        }

        const { apiKey, baseUrl } = resolveAiServiceConfig(request);
        const upstreamFormData = new FormData();
        upstreamFormData.append('file', file, file.name);

        let response: Response;

        try {
            response = await fetch(`${baseUrl}/v1/files`, {
                method: 'POST',
                headers: createAiHeaders(apiKey),
                body: upstreamFormData,
                signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                    ? AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS.submit)
                    : undefined,
            });
        } catch (error: unknown) {
            throw createUpstreamConnectionError(baseUrl, error);
        }

        const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};

        if (!response.ok) {
            throw new Error(getApiErrorMessage(data, JSON.stringify(data)));
        }

        const rawUrl = getNestedValue(data, 'url')
            ?? getNestedValue(data, 'data', 'url');
        const rawId = getNestedValue(data, 'id')
            ?? getNestedValue(data, 'data', 'id');

        const reference = typeof rawUrl === 'string' && rawUrl.trim()
            ? rawUrl.trim()
            : typeof rawId === 'string' && rawId.trim()
                ? `asset://${rawId.trim()}`
                : null;

        if (!reference) {
            console.error('[upload-ai-file] Invalid upstream response:', JSON.stringify(data));
            return NextResponse.json({ error: '上传成功，但未获取到可用素材地址' }, { status: 502 });
        }

        return NextResponse.json({
            reference,
            filename: file.name,
            mimeType: file.type || undefined,
            bytes: file.size,
        });
    } catch (error: unknown) {
        console.error('[upload-ai-file] Error:', getErrorMessage(error));
        return handleApiRouteError(error, '上传参考素材失败', 'upload-ai-file');
    }
}