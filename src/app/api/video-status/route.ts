import { NextRequest, NextResponse } from 'next/server';
import { debugLog } from '@/lib/debug-log';
import { isJieKouProvider, isMagicApiProvider, isMkeaiProvider, isVApiProvider } from '@/lib/ai-providers';
import {
    AI_UPSTREAM_TIMEOUT_MS,
    createAiHeaders,
    inferGenerationTaskKind,
    extractVideoUrl,
    getApiErrorMessage,
    getNestedValue,
    handleApiRouteError,
    parseJsonResponse,
    parseTaskProgress,
    resolveAiServiceConfig,
} from '../_shared/ai-service';
import {
    looksLikeDomesticOfficialTaskId,
    parseVideoTaskId,
    type VideoGenerationTransport,
} from '@/lib/video-generation-transport';

export async function GET(request: NextRequest) {
    try {
        const taskId = request.nextUrl.searchParams.get('taskId');
        if (!taskId) {
            return NextResponse.json({ error: '缺少 taskId 参数' }, { status: 400 });
        }

        const { transport, upstreamTaskId } = parseVideoTaskId(taskId);
        const forcedProviderId = transport === 'mkeai'
            ? 'mkeai'
            : transport === 'vapi'
                ? 'vapi'
                : transport === 'jiekou'
                    ? 'jiekou'
                    : transport === 'magicapi'
                        ? 'magicapi'
                        : undefined;
        const { providerId, apiKey, baseUrl } = resolveAiServiceConfig(request, { providerId: forcedProviderId });
        const preferredTransports: VideoGenerationTransport[] = transport === 'mkeai' || isMkeaiProvider(providerId)
            ? ['mkeai']
            : transport === 'vapi' || isVApiProvider(providerId)
            ? ['vapi']
            : transport === 'jiekou' || isJieKouProvider(providerId)
            ? ['jiekou']
            : transport === 'magicapi' || isMagicApiProvider(providerId)
            ? ['magicapi']
            : transport === 'domestic-official'
                ? ['domestic-official']
                : looksLikeDomesticOfficialTaskId(upstreamTaskId)
                    ? ['domestic-official', 'standard']
                    : ['standard', 'domestic-official'];
        const { data, transport: resolvedTransport } = await fetchVideoStatusWithFallback({
            apiKey,
            baseUrl,
            taskId: upstreamTaskId,
            transports: preferredTransports,
        });

        debugLog(`[video-status] transport=${resolvedTransport} response:`, JSON.stringify(data).substring(0, 500));

        const rawStatus = getNestedValue(data, 'status')
            || getNestedValue(data, 'data', 'status')
            || getNestedValue(data, 'task', 'status')
            || getNestedValue(data, 'data', 'task', 'status');
        const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';

        // Extract video URL — handle both direct string and nested object structures
        // e.g. { data: { output: "url" } } or { data: { output: { video_url: "url" } } }
        let videoUrl = extractVideoUrl(data);

        const failReason = getNestedValue(data, 'fail_reason')
            || getNestedValue(data, 'data', 'fail_reason')
            || getNestedValue(data, 'detail', 'pending_info', 'failure_reason')
            || getNestedValue(data, 'detail', 'failure_reason')
            || getNestedValue(data, 'task', 'reason')
            || getNestedValue(data, 'data', 'task', 'reason')
            || getNestedValue(data, 'error', 'message')
            || getNestedValue(data, 'data', 'error', 'message')
            || getNestedValue(data, 'data', 'error')
            || getNestedValue(data, 'error');
        const rawProgress = getNestedValue(data, 'detail', 'pending_info', 'progress_pct')
            || getNestedValue(data, 'task', 'progress_percent')
            || getNestedValue(data, 'data', 'task', 'progress_percent')
            || getNestedValue(data, 'progress')
            || getNestedValue(data, 'data', 'progress');
        const taskKind = inferGenerationTaskKind(data);

        if (status === 'success' || status === 'succeeded' || status === 'completed' || status === 'task_status_succeed') {
            if (!videoUrl && (resolvedTransport === 'vapi' || resolvedTransport === 'mkeai')) {
                const contentData = await fetchOpenAiCompatibleVideoContent({ apiKey, baseUrl, taskId: upstreamTaskId });
                videoUrl = extractVideoUrl(contentData);
            }

            if (!videoUrl) {
                if (taskKind === 'image') {
                    return NextResponse.json({
                        status: 'failed',
                        error: '该 task_id 对应的是图片生成任务，请在图片生成器中恢复，或填写正确的视频 task_id。',
                    });
                }

                console.error('[video-status] Status is SUCCESS but no video URL found in response:', JSON.stringify(data).substring(0, 800));
                return NextResponse.json({
                    status: 'failed',
                    error: '任务已完成，但未获取到视频结果链接',
                });
            }

            return NextResponse.json({
                status: 'completed',
                videoUrl,
            });
        }

        if (status === 'failure' || status === 'failed' || status === 'expired' || status === 'cancelled' || status === 'canceled' || status === 'task_status_failed') {
            return NextResponse.json({
                status: 'failed',
                error: typeof failReason === 'string' ? failReason : '视频生成失败',
            });
        }

        const progressNum = resolveVideoStatusProgress(status, rawProgress);

        return NextResponse.json({
            status: 'processing',
            progress: progressNum,
        });

    } catch (error: unknown) {
        return handleApiRouteError(error, '查询视频状态失败', 'video-status');
    }
}

async function fetchVideoStatusWithFallback(params: {
    apiKey: string;
    baseUrl: string;
    taskId: string;
    transports: VideoGenerationTransport[];
}) {
    const { apiKey, baseUrl, taskId, transports } = params;
    let lastPayload: Record<string, unknown> = {};
    let lastStatus = 500;

    for (const transport of transports) {
        const endpoint = resolveVideoStatusEndpoint(baseUrl, taskId, transport);
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: createAiHeaders(apiKey),
            signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                ? AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS.status)
                : undefined,
        });

        const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};
        if (response.ok) {
            return { data, transport };
        }

        lastPayload = data;
        lastStatus = response.status;
        console.warn(`[video-status] ${transport} query failed:`, JSON.stringify(data).substring(0, 300));
    }

    console.error('[video-status] API error:', lastPayload);
    throw new Error(getApiErrorMessage(lastPayload, `视频状态查询失败 (${lastStatus})`));
}

function resolveVideoStatusEndpoint(baseUrl: string, taskId: string, transport: VideoGenerationTransport): string {
    if (transport === 'mkeai') {
        return `${baseUrl}/v1/videos/${encodeURIComponent(taskId)}`;
    }

    if (transport === 'vapi') {
        return `${baseUrl}/v1/videos/${encodeURIComponent(taskId)}`;
    }

    if (transport === 'magicapi') {
        return `${baseUrl}/v1/videos/${encodeURIComponent(taskId)}`;
    }

    if (transport === 'domestic-official') {
        return `${baseUrl}/seedance/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`;
    }

    if (transport === 'jiekou') {
        return `${baseUrl}/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`;
    }

    return `${baseUrl}/v2/videos/generations/${encodeURIComponent(taskId)}`;
}

async function fetchOpenAiCompatibleVideoContent(params: { apiKey: string; baseUrl: string; taskId: string }): Promise<Record<string, unknown>> {
    const endpoint = `${params.baseUrl}/v1/videos/${encodeURIComponent(params.taskId)}/content`;
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: createAiHeaders(params.apiKey),
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS.status)
            : undefined,
    });

    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};
    if (!response.ok) {
        throw new Error(getApiErrorMessage(data, `视频地址获取失败 (${response.status})`));
    }

    if (Object.keys(data).length > 0) {
        return data;
    }

    return response.url && response.url !== endpoint ? { url: response.url } : {};
}

function resolveVideoStatusProgress(status: string, rawProgress: unknown): number {
    const parsedProgress = parseTaskProgress(rawProgress);
    const progressNum = parsedProgress > 0 && parsedProgress <= 1
        ? Math.round(parsedProgress * 100)
        : parsedProgress;
    if (status === 'not_start') {
        return 0;
    }

    if (status === 'queued' || status === 'task_status_queued') {
        return progressNum || 10;
    }

    if (status === 'running' || status === 'in_progress' || status === 'processing' || status === 'task_status_processing') {
        return progressNum || 50;
    }

    return progressNum || 10;
}
