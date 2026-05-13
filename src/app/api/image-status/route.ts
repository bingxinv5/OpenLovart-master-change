import { NextRequest, NextResponse } from 'next/server';
import { debugLog } from '@/lib/debug-log';
import { isMagicApiProvider } from '@/lib/ai-providers';
import {
    getMagicApiLocalImageJob,
    isMagicApiLocalImageTaskId,
    isMagicApiPlatformImageTaskId,
    stripMagicApiImageTaskPrefix,
} from '../_shared/magicapi-image-jobs';
import {
    AI_UPSTREAM_TIMEOUT_MS,
    createAiHeaders,
    extractImageResult,
    getApiErrorMessage,
    inferGenerationTaskKind,
    getNestedValue,
    handleApiRouteError,
    parseJsonResponse,
    parseTaskProgress,
    proxyImageResultUrls,
    resolveRequestOrigin,
    resolveAiServiceConfig,
} from '../_shared/ai-service';

export async function GET(request: NextRequest) {
    try {
        const taskId = request.nextUrl.searchParams.get('taskId')?.trim();
        if (!taskId) {
            return NextResponse.json({ error: '缺少 taskId 参数' }, { status: 400 });
        }

        const localJob = isMagicApiLocalImageTaskId(taskId) ? getMagicApiLocalImageJob(taskId) : null;
        if (isMagicApiLocalImageTaskId(taskId) && !localJob) {
            return NextResponse.json({
                status: 'failed',
                error: '本地 MagicAPI 提交任务已失效，请复制平台任务记录中的 task_id 重新恢复。',
            });
        }

        if (localJob?.status === 'submitting') {
            return NextResponse.json({ status: 'processing', progress: 1 });
        }

        if (localJob?.status === 'failed') {
            return NextResponse.json({ status: 'failed', error: localJob.error });
        }

        if (localJob?.status === 'completed') {
            return buildCompletedImageStatusResponse(localJob.data, request);
        }

        const shouldResolveMagicApi = !!localJob || isMagicApiPlatformImageTaskId(taskId);
        const { providerId, apiKey, baseUrl } = resolveAiServiceConfig(request, {
            providerId: shouldResolveMagicApi ? 'magicapi' : undefined,
        });
        const isMagicApiTask = shouldResolveMagicApi || isMagicApiProvider(providerId);
        const upstreamTaskId = localJob?.status === 'upstream'
            ? localJob.upstreamTaskId
            : stripMagicApiImageTaskPrefix(taskId);

        const { response, data } = isMagicApiTask
            ? await fetchMagicApiImageStatus({ apiKey, baseUrl, taskId: upstreamTaskId })
            : await fetchDefaultImageStatus({ apiKey, baseUrl, taskId: upstreamTaskId });

        if (!response.ok) {
            console.error('[image-status] API error:', data);
            const apiErrorMessage = getApiErrorMessage(data, JSON.stringify(data));
            if (isMagicApiTask && apiErrorMessage.includes('Invalid URL')) {
                return NextResponse.json({
                    status: 'failed',
                    error: '当前 MagicAPI / GeekNow 网关未开放图片 task_id 查询接口，无法直接恢复平台后台复制的 image- 开头任务号。请优先使用本页面生成时返回的任务，或在平台后台复制最终图片链接导入。',
                });
            }
            throw new Error(apiErrorMessage);
        }

        debugLog('[image-status] Response:', JSON.stringify(data).substring(0, 500));

        // The API may return status at root level or nested in data
        const status = getNestedValue(data, 'status') || getNestedValue(data, 'data', 'status');
        const failReason = getNestedValue(data, 'fail_reason')
            || getNestedValue(data, 'data', 'fail_reason')
            || getNestedValue(data, 'data', 'error');
        const rawProgress = getNestedValue(data, 'progress') || getNestedValue(data, 'data', 'progress');

        if (status === 'SUCCESS' || status === 'success' || status === 'succeeded' || status === 'completed') {
            return buildCompletedImageStatusResponse(data, request);
        }

        if (status === 'FAILURE' || status === 'failure' || status === 'failed' || status === 'cancelled' || status === 'canceled') {
            return NextResponse.json({
                status: 'failed',
                error: typeof failReason === 'string' ? failReason : '图片生成失败',
            });
        }

        // IN_PROGRESS or other
        const progressNum = parseTaskProgress(rawProgress);

        return NextResponse.json({
            status: 'processing',
            progress: progressNum,
        });

    } catch (error: unknown) {
        return handleApiRouteError(error, '查询图片状态失败', 'image-status');
    }
}

async function fetchDefaultImageStatus(params: { apiKey: string; baseUrl: string; taskId: string }) {
    const response = await fetch(`${params.baseUrl}/v1/images/tasks/${encodeURIComponent(params.taskId)}`, {
        method: 'GET',
        headers: createAiHeaders(params.apiKey),
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS.status)
            : undefined,
    });
    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};
    return { response, data };
}

function buildCompletedImageStatusResponse(data: Record<string, unknown>, request: NextRequest) {
    const rawImageResult = extractImageResult(data);
    const imageResult = proxyImageResultUrls(rawImageResult, resolveRequestOrigin(request.headers, request.nextUrl.origin), {
        filenamePrefix: 'lovart-image-status',
    });

    if (!imageResult.imageUrl && !imageResult.imageData && imageResult.images.length === 0) {
        if (inferGenerationTaskKind(data) === 'video') {
            return NextResponse.json({
                status: 'failed',
                error: '该 task_id 对应的是视频生成任务，请在视频生成器中恢复，或填写正确的图片 task_id。',
            });
        }

        return NextResponse.json({
            status: 'failed',
            error: '任务已完成，但未获取到图片结果链接',
        });
    }

    return NextResponse.json({
        status: 'completed',
        imageUrl: imageResult.imageUrl,
        imageData: imageResult.imageData,
        images: imageResult.images,
    });
}

async function fetchMagicApiImageStatus(params: { apiKey: string; baseUrl: string; taskId: string }) {
    const endpoints = [
        `${params.baseUrl}/v1/images/${encodeURIComponent(params.taskId)}`,
        `${params.baseUrl}/v1/images/tasks/${encodeURIComponent(params.taskId)}`,
    ];
    let lastResponse: Response | null = null;
    let lastData: Record<string, unknown> = {};

    for (const endpoint of endpoints) {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: createAiHeaders(params.apiKey),
            signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                ? AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS.status)
                : undefined,
        });
        const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};
        if (response.ok) {
            return { response, data };
        }

        lastResponse = response;
        lastData = data;
    }

    return {
        response: lastResponse || new Response(null, { status: 502 }),
        data: lastData,
    };
}
