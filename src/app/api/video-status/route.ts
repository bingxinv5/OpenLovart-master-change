import { NextRequest, NextResponse } from 'next/server';
import { debugLog } from '@/lib/debug-log';
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

        const { apiKey, baseUrl } = resolveAiServiceConfig(request);

        const { transport, upstreamTaskId } = parseVideoTaskId(taskId);
        const preferredTransports: VideoGenerationTransport[] = transport === 'domestic-official'
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

        const rawStatus = getNestedValue(data, 'status') || getNestedValue(data, 'data', 'status');
        const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';

        // Extract video URL — handle both direct string and nested object structures
        // e.g. { data: { output: "url" } } or { data: { output: { video_url: "url" } } }
        const videoUrl = extractVideoUrl(data);

        const failReason = getNestedValue(data, 'fail_reason')
            || getNestedValue(data, 'data', 'fail_reason')
            || getNestedValue(data, 'data', 'error');
        const rawProgress = getNestedValue(data, 'progress') || getNestedValue(data, 'data', 'progress');
        const taskKind = inferGenerationTaskKind(data);

        if (status === 'success' || status === 'succeeded') {
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

        if (status === 'failure' || status === 'failed' || status === 'expired') {
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
        const endpoint = transport === 'domestic-official'
            ? `${baseUrl}/seedance/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`
            : `${baseUrl}/v2/videos/generations/${encodeURIComponent(taskId)}`;
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

function resolveVideoStatusProgress(status: string, rawProgress: unknown): number {
    const progressNum = parseTaskProgress(rawProgress);
    if (status === 'not_start') {
        return 0;
    }

    if (status === 'queued') {
        return progressNum || 10;
    }

    if (status === 'running' || status === 'in_progress') {
        return progressNum || 50;
    }

    return progressNum || 10;
}
