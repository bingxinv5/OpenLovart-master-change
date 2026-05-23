import { NextRequest, NextResponse } from 'next/server';
import { isLaomandiProvider } from '@/lib/ai-providers';
import {
    AI_UPSTREAM_TIMEOUT_MS,
    ApiRouteError,
    createAiHeaders,
    createUpstreamConnectionError,
    getApiErrorMessage,
    getErrorMessage,
    getNestedValue,
    handleApiRouteError,
    resolveAiServiceConfig,
} from '../_shared/ai-service';

const LAOMANDI_ASSET_BASE_URL = 'https://api.laomandi.com';
const PURPOSE_FALLBACK = 'assistants';

type UploadAttempt = {
    endpoint: string;
    purpose: string | null;
};

type UpstreamUploadPayload = {
    data: Record<string, unknown>;
    rawText: string;
};

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!(file instanceof File)) {
            return NextResponse.json({ error: '缺少上传文件' }, { status: 400 });
        }

        if (file.size <= 0) {
            return NextResponse.json({ error: '上传文件为空' }, { status: 400 });
        }

        const { providerId, apiKey, baseUrl } = resolveAiServiceConfig(request);
        const attempts = buildUploadAttempts(providerId, baseUrl);
        const failures: string[] = [];

        for (const attempt of attempts) {
            let response: Response;

            try {
                response = await fetch(attempt.endpoint, {
                    method: 'POST',
                    headers: createAiHeaders(apiKey),
                    body: createUploadFormData(file, attempt.purpose),
                    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                        ? AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS.submit)
                        : undefined,
                });
            } catch (error: unknown) {
                throw createUpstreamConnectionError(attempt.endpoint, error);
            }

            const { data, rawText } = await readUpstreamUploadPayload(response);

            if (!response.ok) {
                const fallbackMessage = normalizeRawUploadErrorText(rawText) || `HTTP ${response.status}`;
                const message = getApiErrorMessage(data, fallbackMessage);
                failures.push(`${describeAttempt(attempt)}: ${message}`);
                continue;
            }

            const reference = resolveUploadedReference(data);

            if (reference) {
                return NextResponse.json({
                    reference,
                    filename: file.name,
                    mimeType: file.type || undefined,
                    bytes: file.size,
                });
            }

            console.error('[upload-ai-file] Invalid upstream response:', JSON.stringify(data));
            failures.push(`${describeAttempt(attempt)}: 上传成功，但未获取到可用素材地址`);
        }

        throw new ApiRouteError(
            '上传参考素材失败',
            502,
            failures.length > 0 ? failures.join('；') : '上游文件上传服务未返回可用素材地址',
        );
    } catch (error: unknown) {
        console.error('[upload-ai-file] Error:', getErrorMessage(error));
        return handleApiRouteError(error, '上传参考素材失败', 'upload-ai-file');
    }
}

function createUploadFormData(file: File, purpose: string | null): FormData {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (purpose) {
        formData.append('purpose', purpose);
    }
    return formData;
}

function buildUploadAttempts(providerId: unknown, baseUrl: string): UploadAttempt[] {
    const endpoints = resolveUploadEndpoints(providerId, baseUrl);
    return endpoints.flatMap((endpoint) => [
        { endpoint, purpose: null },
        { endpoint, purpose: PURPOSE_FALLBACK },
    ]);
}

function resolveUploadEndpoints(providerId: unknown, baseUrl: string): string[] {
    const endpoints = new Set<string>();
    const uploadBaseUrl = isLaomandiProvider(providerId) && isArkOfficialBaseUrl(baseUrl)
        ? LAOMANDI_ASSET_BASE_URL
        : baseUrl;

    endpoints.add(buildFilesEndpoint(uploadBaseUrl));

    if (isLaomandiProvider(providerId) && uploadBaseUrl !== LAOMANDI_ASSET_BASE_URL) {
        endpoints.add(buildFilesEndpoint(LAOMANDI_ASSET_BASE_URL));
    }

    return [...endpoints];
}

function buildFilesEndpoint(baseUrl: string): string {
    const parsedUrl = new URL(baseUrl);
    const pathname = parsedUrl.pathname.replace(/\/+$/, '');
    parsedUrl.pathname = pathname.endsWith('/v1') ? `${pathname}/files` : `${pathname}/v1/files`;
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString();
}

function isArkOfficialBaseUrl(baseUrl: string): boolean {
    try {
        return new URL(baseUrl).hostname.toLowerCase() === 'ark.cn-beijing.volces.com';
    } catch {
        return false;
    }
}

async function readUpstreamUploadPayload(response: Response): Promise<UpstreamUploadPayload> {
    const rawText = await response.text();
    if (!rawText.trim()) {
        return { data: {}, rawText: '' };
    }

    try {
        const parsed = JSON.parse(rawText) as unknown;
        return {
            data: parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {},
            rawText,
        };
    } catch {
        return { data: {}, rawText };
    }
}

function resolveUploadedReference(data: Record<string, unknown>): string | null {
    const rawUrl = getNestedValue(data, 'url')
        ?? getNestedValue(data, 'data', 'url')
        ?? getNestedValue(data, 'file', 'url')
        ?? getNestedValue(data, 'data', 'file', 'url')
        ?? getNestedValue(data, 'result', 'url');
    const rawId = getNestedValue(data, 'id')
        ?? getNestedValue(data, 'data', 'id')
        ?? getNestedValue(data, 'file', 'id')
        ?? getNestedValue(data, 'data', 'file', 'id')
        ?? getNestedValue(data, 'file_id')
        ?? getNestedValue(data, 'data', 'file_id');

    if (typeof rawUrl === 'string' && rawUrl.trim()) {
        return rawUrl.trim();
    }

    if (typeof rawId === 'string' && rawId.trim()) {
        return `asset://${rawId.trim()}`;
    }

    return null;
}

function normalizeRawUploadErrorText(rawText: string): string {
    const normalized = rawText.trim();
    return normalized === '{}' ? '' : normalized;
}

function describeAttempt(attempt: UploadAttempt): string {
    const purposeSuffix = attempt.purpose ? ` purpose=${attempt.purpose}` : ' 默认上传';
    return `${attempt.endpoint}${purposeSuffix}`;
}
