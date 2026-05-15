import { NextRequest, NextResponse } from 'next/server';
import { debugLog } from '@/lib/debug-log';
import { DEFAULT_AI_PROVIDER_ID, isJieKouProvider, isMagicApiProvider, isVApiProvider } from '@/lib/ai-providers';
import {
    getDefaultLocalImageJob,
    isDefaultLocalImageTaskId,
} from '../_shared/default-image-tasks';
import {
    getJieKouLocalImageJob,
    isJieKouImageTaskId,
    isJieKouLocalImageTaskId,
    stripJieKouImageTaskPrefix,
} from '../_shared/jiekou-image-tasks';
import {
    getMagicApiLocalImageJob,
    isMagicApiLocalImageTaskId,
    isMagicApiPlatformImageTaskId,
    stripMagicApiImageTaskPrefix,
} from '../_shared/magicapi-image-jobs';
import {
    getVApiLocalImageJob,
    isVApiImageTaskId,
    isVApiLocalImageTaskId,
    stripVApiImageTaskPrefix,
} from '../_shared/vapi-image-tasks';
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

        const magicApiLocalJob = isMagicApiLocalImageTaskId(taskId) ? getMagicApiLocalImageJob(taskId) : null;
        const jieKouLocalJob = isJieKouLocalImageTaskId(taskId) ? getJieKouLocalImageJob(taskId) : null;
        const vApiLocalJob = isVApiLocalImageTaskId(taskId) ? getVApiLocalImageJob(taskId) : null;
        const defaultLocalJob = isDefaultLocalImageTaskId(taskId) ? getDefaultLocalImageJob(taskId) : null;
        if (isMagicApiLocalImageTaskId(taskId) && !magicApiLocalJob) {
            return NextResponse.json({
                status: 'failed',
                error: '本地 MagicAPI 提交任务已失效，请复制平台任务记录中的 task_id 重新恢复。',
            });
        }
        if (isJieKouLocalImageTaskId(taskId) && !jieKouLocalJob) {
            return NextResponse.json({
                status: 'failed',
                error: '本地 JieKou 图片任务已失效，请重新发起生成。',
            });
        }
        if (isVApiLocalImageTaskId(taskId) && !vApiLocalJob) {
            return NextResponse.json({
                status: 'failed',
                error: '本地 V-API 图片任务已失效，请重新发起生成。',
            });
        }
        if (isDefaultLocalImageTaskId(taskId) && !defaultLocalJob) {
            return NextResponse.json({
                status: 'failed',
                error: '本地图片生成任务已失效，请重新发起生成。',
            });
        }

        if (
            magicApiLocalJob?.status === 'submitting'
            || jieKouLocalJob?.status === 'submitting'
            || vApiLocalJob?.status === 'submitting'
            || defaultLocalJob?.status === 'submitting'
        ) {
            return NextResponse.json({ status: 'processing', progress: 1 });
        }

        if (magicApiLocalJob?.status === 'failed') {
            return NextResponse.json({ status: 'failed', error: magicApiLocalJob.error });
        }
        if (jieKouLocalJob?.status === 'failed') {
            return NextResponse.json({ status: 'failed', error: jieKouLocalJob.error });
        }
        if (vApiLocalJob?.status === 'failed') {
            return NextResponse.json({ status: 'failed', error: vApiLocalJob.error });
        }
        if (defaultLocalJob?.status === 'failed') {
            return NextResponse.json({ status: 'failed', error: defaultLocalJob.error });
        }

        if (magicApiLocalJob?.status === 'completed') {
            return buildCompletedImageStatusResponse(magicApiLocalJob.data, request);
        }
        if (jieKouLocalJob?.status === 'completed') {
            return buildCompletedImageStatusResponse(jieKouLocalJob.data, request);
        }
        if (vApiLocalJob?.status === 'completed') {
            return buildCompletedImageStatusResponse(vApiLocalJob.data, request);
        }
        if (defaultLocalJob?.status === 'completed') {
            return buildCompletedImageStatusResponse(defaultLocalJob.data, request);
        }

        const shouldResolveMagicApi = !!magicApiLocalJob || isMagicApiPlatformImageTaskId(taskId);
        const shouldResolveJieKou = !!jieKouLocalJob || isJieKouImageTaskId(taskId);
        const shouldResolveVApi = !!vApiLocalJob || isVApiImageTaskId(taskId);
        const shouldResolveDefault = !!defaultLocalJob;
        const { providerId, apiKey, baseUrl } = resolveAiServiceConfig(request, {
            providerId: shouldResolveMagicApi ? 'magicapi' : shouldResolveJieKou ? 'jiekou' : shouldResolveVApi ? 'vapi' : shouldResolveDefault ? DEFAULT_AI_PROVIDER_ID : undefined,
        });
        const isMagicApiTask = shouldResolveMagicApi || isMagicApiProvider(providerId);
        const isJieKouTask = shouldResolveJieKou || isJieKouProvider(providerId);
        const isVApiTask = shouldResolveVApi || isVApiProvider(providerId);
        const upstreamTaskId = magicApiLocalJob?.status === 'upstream'
            ? magicApiLocalJob.upstreamTaskId
            : jieKouLocalJob?.status === 'upstream'
                ? jieKouLocalJob.upstreamTaskId
                : vApiLocalJob?.status === 'upstream'
                    ? vApiLocalJob.upstreamTaskId
                    : defaultLocalJob?.status === 'upstream'
                        ? defaultLocalJob.upstreamTaskId
                        : isJieKouTask
                            ? stripJieKouImageTaskPrefix(taskId)
                            : isVApiTask
                                ? stripVApiImageTaskPrefix(taskId)
                                : stripMagicApiImageTaskPrefix(taskId);

        const { response, data } = isJieKouTask
            ? await fetchJieKouImageStatus({ apiKey, baseUrl, taskId: upstreamTaskId })
            : isMagicApiTask
                ? await fetchMagicApiImageStatus({ apiKey, baseUrl, taskId: upstreamTaskId })
                : isVApiTask
                    ? await fetchVApiImageStatus({ apiKey, baseUrl, taskId: upstreamTaskId })
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
        const rawStatus = getNestedValue(data, 'status')
            || getNestedValue(data, 'data', 'status')
            || getNestedValue(data, 'task', 'status')
            || getNestedValue(data, 'data', 'task', 'status');
        const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
        const failReason = getNestedValue(data, 'fail_reason')
            || getNestedValue(data, 'data', 'fail_reason')
            || getNestedValue(data, 'task', 'reason')
            || getNestedValue(data, 'data', 'task', 'reason')
            || getNestedValue(data, 'error', 'message')
            || getNestedValue(data, 'data', 'error', 'message')
            || getNestedValue(data, 'data', 'error');
        const rawProgress = getNestedValue(data, 'task', 'progress_percent')
            || getNestedValue(data, 'data', 'task', 'progress_percent')
            || getNestedValue(data, 'progress')
            || getNestedValue(data, 'data', 'progress');

        if (status === 'success' || status === 'succeeded' || status === 'completed' || status === 'task_status_succeed') {
            return buildCompletedImageStatusResponse(data, request);
        }

        if (status === 'failure' || status === 'failed' || status === 'expired' || status === 'cancelled' || status === 'canceled' || status === 'task_status_failed') {
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

async function fetchVApiImageStatus(params: { apiKey: string; baseUrl: string; taskId: string }) {
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

async function fetchJieKouImageStatus(params: { apiKey: string; baseUrl: string; taskId: string }) {
    const response = await fetch(`${params.baseUrl}/v3/async/task-result?task_id=${encodeURIComponent(params.taskId)}`, {
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
