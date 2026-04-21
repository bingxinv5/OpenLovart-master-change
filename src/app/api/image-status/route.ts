import { NextRequest, NextResponse } from 'next/server';
import {
    AI_UPSTREAM_TIMEOUT_MS,
    createAiHeaders,
    extractImageResult,
    getApiErrorMessage,
    inferGenerationTaskKind,
    getNestedValue,
    handleApiRouteError,
    inspectImageResultDimensions,
    parseJsonResponse,
    parseTaskProgress,
    proxyImageResultUrls,
    resolveRequestOrigin,
    resolveAiServiceConfig,
} from '../_shared/ai-service';

export async function GET(request: NextRequest) {
    try {
        const taskId = request.nextUrl.searchParams.get('taskId');
        if (!taskId) {
            return NextResponse.json({ error: '缺少 taskId 参数' }, { status: 400 });
        }

        const { apiKey, baseUrl } = resolveAiServiceConfig(request);

        const response = await fetch(`${baseUrl}/v1/images/tasks/${taskId}`, {
            method: 'GET',
            headers: createAiHeaders(apiKey),
            signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                ? AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS.status)
                : undefined,
        });

        const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};

        if (!response.ok) {
            console.error('[image-status] API error:', data);
            throw new Error(getApiErrorMessage(data, JSON.stringify(data)));
        }

        console.log('[image-status] Response:', JSON.stringify(data).substring(0, 500));

        // The API may return status at root level or nested in data
        const status = getNestedValue(data, 'status') || getNestedValue(data, 'data', 'status');
        const failReason = getNestedValue(data, 'fail_reason')
            || getNestedValue(data, 'data', 'fail_reason')
            || getNestedValue(data, 'data', 'error');
        const rawProgress = getNestedValue(data, 'progress') || getNestedValue(data, 'data', 'progress');

        if (status === 'SUCCESS') {
            const rawImageResult = extractImageResult(data);
            const imageDimensions = await inspectImageResultDimensions(rawImageResult);
            if (imageDimensions) {
                console.log(`[image-status] task=${taskId} completed image=${imageDimensions.width}x${imageDimensions.height} (${imageDimensions.format}, ${imageDimensions.source})`);
            } else {
                console.log(`[image-status] task=${taskId} completed but image dimensions could not be inspected`);
            }

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

        if (status === 'FAILURE') {
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
