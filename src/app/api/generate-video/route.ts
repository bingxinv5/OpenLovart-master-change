import { NextRequest, NextResponse } from 'next/server';
import { decodeDataUrlBytes, extractDataUrlBase64, isDataUrl } from '@/lib/data-url';
import { debugLog } from '@/lib/debug-log';
import { isJieKouProvider, isMagicApiProvider, isVApiProvider } from '@/lib/ai-providers';
import { encodeVideoTaskId, getVideoGenerationTransport } from '@/lib/video-generation-transport';
import {
    getMaxImagesForVideoModel,
    isMagicApiDoubaoMultipartVideoModel,
    isMagicApiDoubaoUrlVideoModel,
    isMagicApiGrokVideoModel,
    isMagicApiHailuoVideoModel,
    isMagicApiJsonVideoModel,
    isMagicApiKlingVideoModel,
    isMagicApiMultipartVideoModel,
    isMagicApiVeoVideoModel,
    isMagicApiViduVideoModel,
    isMagicApiWanImageToVideoModel,
    isMagicApiWanVideoModel,
    isJieKouSoraVideoModel,
    isJieKouVeoVideoModel,
    isVApiSoraVideoModel,
    resolveMagicApiGrokResolution,
    resolveMagicApiVideoPixelSize,
    resolveMagicApiVideoSeconds,
    resolveVApiSoraModelAndSize,
    supportsVideoAudioGeneration,
} from '@/lib/video-generation-models';
import {
    AI_UPSTREAM_TIMEOUT_MS,
    ApiRouteError,
    createUpstreamConnectionError,
    createAiHeaders,
    extractVideoUrl,
    fetchWithRetry,
    getApiErrorMessage,
    getErrorMessage,
    handleApiRouteError,
    getNestedValue,
    parseJsonResponse,
    resolveAiServiceConfig,
} from '../_shared/ai-service';

const MAX_VIDEO_REFERENCE_IMAGES = 9;
const MAX_VIDEO_REFERENCE_VIDEOS = 3;
const MAX_VIDEO_REFERENCE_AUDIOS = 3;
const MAX_VIDEO_REFERENCE_IMAGE_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
    try {
        const {
            prompt,
            model,
            aspectRatio,
            duration,
            generationMode,
            enhancePrompt,
            referenceImages,
            images,
            videos,
            audios,
            enableUpsample,
            resolution,
            generateAudio,
            watermark,
            seed,
            returnLastFrame,
            tools,
        } = await request.json();

        const { providerId, apiKey, baseUrl } = resolveAiServiceConfig(request);

        const requestedModel = typeof model === 'string' && model.trim()
            ? model.trim()
            : isJieKouProvider(providerId)
                ? 'jiekou-sora-2'
            : isVApiProvider(providerId)
                ? 'sora-2_1280x720'
            : isMagicApiProvider(providerId)
                ? 'sora-2'
                : 'veo3.1';
        const selectedModel = resolveUpstreamVideoModel(requestedModel);
        const transport = getVideoGenerationTransport(requestedModel);
        const normalizedPrompt = typeof prompt === 'string' ? prompt : '';
        const normalizedDuration = normalizeVideoDuration(duration, selectedModel);
        const normalizedImageEntries = normalizeSubmissionVideoImageEntries(images, referenceImages, selectedModel);
        const normalizedVideos = normalizeReferenceAssetList(videos);
        const normalizedAudios = normalizeReferenceAssetList(audios);
        const normalizedAspectRatio = normalizeVideoAspectRatio(selectedModel, aspectRatio, normalizedImageEntries.length > 0);
        const normalizedResolution = normalizeVideoResolution(selectedModel, resolution);
        const normalizedSeed = normalizeGenerationSeed(seed);
        const normalizedTools = normalizeVideoTools(tools);
        const isDomesticOfficialTransport = transport === 'domestic-official';
        const hasReferenceInputs = normalizedImageEntries.length > 0 || normalizedVideos.length > 0 || normalizedAudios.length > 0;

        if (!normalizedPrompt.trim() && !(isDomesticOfficialTransport && hasReferenceInputs)) {
            return NextResponse.json({ error: '请输入提示词' }, { status: 400 });
        }

        const body = isDomesticOfficialTransport
            ? buildDomesticOfficialVideoBody({
                model: selectedModel,
                prompt: normalizedPrompt,
                aspectRatio: normalizedAspectRatio,
                duration: normalizedDuration,
                generationMode: normalizeDomesticVideoGenerationMode(generationMode, normalizedImageEntries, normalizedVideos, normalizedAudios),
                imageEntries: normalizedImageEntries,
                videos: normalizedVideos,
                audios: normalizedAudios,
                resolution: normalizedResolution,
                generateAudio,
                returnLastFrame,
                tools: normalizedTools,
            })
            : buildStandardVideoBody({
                model: selectedModel,
                prompt: normalizedPrompt,
                aspectRatio: normalizedAspectRatio,
                duration: normalizedDuration,
                enhancePrompt,
                enableUpsample,
                imageEntries: normalizedImageEntries,
                videos: normalizedVideos,
                audios: normalizedAudios,
                resolution: normalizedResolution,
                generateAudio,
                watermark,
                seed: normalizedSeed,
                returnLastFrame,
                tools: normalizedTools,
            });

        debugLog(`[generate-video] model=${requestedModel}, upstreamModel=${selectedModel}, transport=${transport}, prompt="${normalizedPrompt.substring(0, 50)}...", images=${normalizedImageEntries.length}, videos=${normalizedVideos.length}, audios=${normalizedAudios.length}`);

        if (isVApiProvider(providerId)) {
            return await submitVApiVideoGeneration({
                apiKey,
                baseUrl,
                selectedModel,
                prompt: normalizedPrompt,
                duration: normalizedDuration,
                imageEntries: normalizedImageEntries,
                videos: normalizedVideos,
                audios: normalizedAudios,
            });
        }

        if (isMagicApiProvider(providerId)) {
            return await submitMagicApiVideoGeneration({
                apiKey,
                baseUrl,
                selectedModel,
                prompt: normalizedPrompt,
                aspectRatio: normalizedAspectRatio,
                duration: normalizedDuration,
                generationMode,
                imageEntries: normalizedImageEntries,
                videos: normalizedVideos,
                audios: normalizedAudios,
                resolution: normalizedResolution,
                enableUpsample,
                generateAudio,
                watermark,
                seed: normalizedSeed,
                returnLastFrame,
                tools: normalizedTools,
            });
        }

        if (isJieKouProvider(providerId)) {
            return await submitJieKouVideoGeneration({
                apiKey,
                baseUrl,
                selectedModel,
                prompt: normalizedPrompt,
                aspectRatio: normalizedAspectRatio,
                duration: normalizedDuration,
                imageEntries: normalizedImageEntries,
                videos: normalizedVideos,
                audios: normalizedAudios,
                resolution: normalizedResolution,
                enhancePrompt,
                generateAudio,
                seed: normalizedSeed,
            });
        }

        const targetUrl = isDomesticOfficialTransport
            ? `${baseUrl}/seedance/v3/contents/generations/tasks`
            : `${baseUrl}/v2/videos/generations`;
        let response: Response;

        try {
            response = await fetchWithRetry(
                targetUrl,
                {
                    method: 'POST',
                    headers: createAiHeaders(apiKey, true),
                    body: JSON.stringify(body),
                },
                { label: 'generate-video', timeoutMs: AI_UPSTREAM_TIMEOUT_MS.submit },
            );
        } catch (error: unknown) {
            console.error('[generate-video] Upstream fetch failed after retries:', getErrorMessage(error));
            throw createUpstreamConnectionError(baseUrl, error);
        }

        const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};

        if (!response.ok) {
            console.error('[generate-video] API error:', data);
            throw new Error(getApiErrorMessage(data, JSON.stringify(data)));
        }

        debugLog('[generate-video] Full response:', JSON.stringify(data));

        // Try multiple possible paths for task_id in the response.
        const rawTaskId = getNestedValue(data, 'data', 'task_id')
            || getNestedValue(data, 'task_id')
            || getNestedValue(data, 'data', 'id')
            || getNestedValue(data, 'id')
            || getNestedValue(data, 'data', 'taskId')
            || getNestedValue(data, 'taskId');
        const taskId = typeof rawTaskId === 'string' && rawTaskId.length > 0
            ? encodeVideoTaskId(rawTaskId, transport)
            : null;

        // If the API returned video data directly (unlikely but handle it)
        const videoUrl = extractVideoUrl(data);

        if (videoUrl) {
            return NextResponse.json({ status: 'completed', taskId, videoUrl });
        }

        if (taskId) {
            return NextResponse.json({ taskId, status: 'pending' });
        }

        console.error('[generate-video] Could not extract task_id from response:', JSON.stringify(data));
        return NextResponse.json(
            { error: '未获取到任务ID', details: `API 响应结构异常: ${JSON.stringify(data).substring(0, 500)}` },
            { status: 502 }
        );

    } catch (error: unknown) {
        return handleApiRouteError(error, '视频生成失败', 'generate-video');
    }
}

async function submitVApiVideoGeneration(params: {
    apiKey: string;
    baseUrl: string;
    selectedModel: string;
    prompt: string;
    duration?: number;
    imageEntries: Array<{ image: string; imageType?: string }>;
    videos: string[];
    audios: string[];
}) {
    const upstreamRequest = buildVApiVideoRequest(params);
    const targetUrl = `${params.baseUrl}/v1/videos`;
    let response: Response;

    try {
        response = await fetchWithRetry(
            targetUrl,
            {
                method: 'POST',
                headers: createAiHeaders(params.apiKey, upstreamRequest.format === 'json'),
                body: upstreamRequest.body,
            },
            { label: 'generate-video:vapi', timeoutMs: AI_UPSTREAM_TIMEOUT_MS.submit },
        );
    } catch (error: unknown) {
        console.error('[generate-video][vapi] Upstream fetch failed after retries:', getErrorMessage(error));
        throw createUpstreamConnectionError(params.baseUrl, error);
    }

    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};
    if (!response.ok) {
        console.error('[generate-video][vapi] API error:', data);
        throw new Error(getApiErrorMessage(data, JSON.stringify(data)));
    }

    debugLog('[generate-video][vapi] Full response:', JSON.stringify(data));

    const rawTaskId = getNestedValue(data, 'id')
        || getNestedValue(data, 'data', 'id')
        || getNestedValue(data, 'task_id')
        || getNestedValue(data, 'data', 'task_id')
        || getNestedValue(data, 'taskId')
        || getNestedValue(data, 'data', 'taskId');
    const taskId = typeof rawTaskId === 'string' && rawTaskId.length > 0
        ? encodeVideoTaskId(rawTaskId, 'vapi')
        : null;
    const videoUrl = extractVideoUrl(data);

    if (videoUrl) {
        return NextResponse.json({ status: 'completed', taskId, videoUrl });
    }

    if (taskId) {
        return NextResponse.json({ taskId, status: 'pending' });
    }

    console.error('[generate-video][vapi] Could not extract task id from response:', JSON.stringify(data));
    return NextResponse.json(
        { error: '未获取到任务ID', details: `API 响应结构异常: ${JSON.stringify(data).substring(0, 500)}` },
        { status: 502 },
    );
}

function buildVApiVideoRequest(params: {
    selectedModel: string;
    prompt: string;
    duration?: number;
    imageEntries: Array<{ image: string; imageType?: string }>;
    videos: string[];
    audios: string[];
}): { format: 'json' | 'multipart'; body: BodyInit } {
    if (!isVApiSoraVideoModel(params.selectedModel)) {
        throw new ApiRouteError('V-API 暂不支持该视频模型', 400);
    }

    if (params.videos.length > 0 || params.audios.length > 0) {
        throw new ApiRouteError('V-API Sora 2 暂不支持参考视频或参考音频', 400);
    }

    if (params.imageEntries.length > 1) {
        throw new ApiRouteError('V-API Sora 2 图生视频最多支持 1 张参考图', 400);
    }

    const { model, size } = resolveVApiSoraModelAndSize(params.selectedModel);
    const seconds = resolveVApiSoraSeconds(params.duration);
    const firstImage = params.imageEntries[0]?.image;

    if (firstImage) {
        const formData = new FormData();
        formData.append('model', model);
        formData.append('prompt', params.prompt.trim());
        formData.append('seconds', seconds);
        formData.append('size', size);
        appendMagicApiMultipartImage(formData, 'input_reference', firstImage, 0);
        return { format: 'multipart', body: formData };
    }

    return {
        format: 'json',
        body: JSON.stringify({
            model,
            prompt: params.prompt.trim(),
            seconds,
            size,
        }),
    };
}

function resolveVApiSoraSeconds(duration: number | undefined): '4' | '8' | '12' {
    if (duration === 8) return '8';
    if (duration === 12) return '12';
    return '4';
}

async function submitMagicApiVideoGeneration(params: {
    apiKey: string;
    baseUrl: string;
    selectedModel: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    generationMode: unknown;
    imageEntries: Array<{ image: string; imageType?: string }>;
    videos: string[];
    audios: string[];
    resolution?: '480p' | '720p' | '1080p';
    enableUpsample: unknown;
    generateAudio: unknown;
    watermark: unknown;
    seed?: number;
    returnLastFrame: unknown;
    tools: Array<{ type: string }>;
}) {
    const upstreamRequest = buildMagicApiVideoRequest(params);
    const targetUrl = `${params.baseUrl}/v1/videos`;
    let response: Response;

    try {
        response = await fetchWithRetry(
            targetUrl,
            {
                method: 'POST',
                headers: createAiHeaders(params.apiKey, upstreamRequest.format === 'json'),
                body: upstreamRequest.body,
            },
            { label: 'generate-video:magicapi', timeoutMs: AI_UPSTREAM_TIMEOUT_MS.submit },
        );
    } catch (error: unknown) {
        console.error('[generate-video][magicapi] Upstream fetch failed after retries:', getErrorMessage(error));
        throw createUpstreamConnectionError(params.baseUrl, error);
    }

    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};

    if (!response.ok) {
        const fallbackModel = resolveMagicApiUnavailableModelFallback(params.selectedModel, data);
        if (fallbackModel) {
            console.warn(`[generate-video][magicapi] ${params.selectedModel} is unavailable for this channel; retrying with ${fallbackModel}.`);
            return await submitMagicApiVideoGeneration({
                ...params,
                selectedModel: fallbackModel,
            });
        }

        console.error('[generate-video][magicapi] API error:', data);
        throw new Error(getApiErrorMessage(data, JSON.stringify(data)));
    }

    debugLog('[generate-video][magicapi] Full response:', JSON.stringify(data));

    const rawTaskId = getNestedValue(data, 'data', 'task_id')
        || getNestedValue(data, 'task_id')
        || getNestedValue(data, 'data', 'id')
        || getNestedValue(data, 'id')
        || getNestedValue(data, 'data', 'taskId')
        || getNestedValue(data, 'taskId');
    const taskId = typeof rawTaskId === 'string' && rawTaskId.length > 0
        ? encodeVideoTaskId(rawTaskId, 'magicapi')
        : null;
    const videoUrl = extractVideoUrl(data);

    if (videoUrl) {
        return NextResponse.json({ status: 'completed', taskId, videoUrl });
    }

    if (taskId) {
        return NextResponse.json({ taskId, status: 'pending' });
    }

    console.error('[generate-video][magicapi] Could not extract task_id from response:', JSON.stringify(data));
    return NextResponse.json(
        { error: '未获取到任务ID', details: `API 响应结构异常: ${JSON.stringify(data).substring(0, 500)}` },
        { status: 502 },
    );
}

async function submitJieKouVideoGeneration(params: {
    apiKey: string;
    baseUrl: string;
    selectedModel: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    imageEntries: Array<{ image: string; imageType?: string }>;
    videos: string[];
    audios: string[];
    resolution?: '480p' | '720p' | '1080p';
    enhancePrompt: unknown;
    generateAudio: unknown;
    seed?: number;
}) {
    const upstreamRequest = buildJieKouVideoRequest(params);
    const targetUrl = `${params.baseUrl}${upstreamRequest.path}`;
    let response: Response;

    try {
        response = await fetchWithRetry(
            targetUrl,
            {
                method: 'POST',
                headers: createAiHeaders(params.apiKey, true),
                body: JSON.stringify(upstreamRequest.body),
            },
            { label: 'generate-video:jiekou', timeoutMs: AI_UPSTREAM_TIMEOUT_MS.submit },
        );
    } catch (error: unknown) {
        console.error('[generate-video][jiekou] Upstream fetch failed after retries:', getErrorMessage(error));
        throw createUpstreamConnectionError(params.baseUrl, error);
    }

    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};
    if (!response.ok) {
        console.error('[generate-video][jiekou] API error:', data);
        throw new Error(getApiErrorMessage(data, JSON.stringify(data)));
    }

    debugLog('[generate-video][jiekou] Full response:', JSON.stringify(data));

    const rawTaskId = getNestedValue(data, 'data', 'task_id')
        || getNestedValue(data, 'task_id')
        || getNestedValue(data, 'data', 'id')
        || getNestedValue(data, 'id')
        || getNestedValue(data, 'data', 'taskId')
        || getNestedValue(data, 'taskId');
    const taskId = typeof rawTaskId === 'string' && rawTaskId.length > 0
        ? encodeVideoTaskId(rawTaskId, 'jiekou')
        : null;
    const videoUrl = extractVideoUrl(data);

    if (videoUrl) {
        return NextResponse.json({ status: 'completed', taskId, videoUrl });
    }

    if (taskId) {
        return NextResponse.json({ taskId, status: 'pending' });
    }

    console.error('[generate-video][jiekou] Could not extract task_id from response:', JSON.stringify(data));
    return NextResponse.json(
        { error: '未获取到任务ID', details: `API 响应结构异常: ${JSON.stringify(data).substring(0, 500)}` },
        { status: 502 },
    );
}

function buildJieKouVideoRequest(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    imageEntries: Array<{ image: string; imageType?: string }>;
    videos: string[];
    audios: string[];
    resolution?: '480p' | '720p' | '1080p';
    enhancePrompt: unknown;
    generateAudio: unknown;
    seed?: number;
}): { path: string; body: Record<string, unknown> } {
    if (params.videos.length > 0 || params.audios.length > 0) {
        throw new ApiRouteError('JieKou Sora 2 / Veo 3.1 暂不支持参考视频或参考音频', 400);
    }

    const images = orderJieKouVideoImages(params.imageEntries).map(normalizeJieKouVideoImageInput);

    if (isJieKouSoraVideoModel(params.selectedModel)) {
        if (images.length > 1) {
            throw new ApiRouteError('JieKou Sora 2 图生视频最多支持 1 张参考图', 400);
        }

        const professional = params.resolution === '1080p';
        const body: Record<string, unknown> = {
            prompt: params.prompt.trim(),
            duration: resolveJieKouSoraDuration(params.duration),
            professional,
        };

        if (images.length > 0) {
            body.image = images[0];
            body.resolution = params.resolution === '1080p' ? '1080p' : '720p';
            return { path: '/v3/async/sora-2-img2video', body };
        }

        body.size = resolveJieKouSoraSize(params.aspectRatio, professional);
        return { path: '/v3/async/sora-2-text2video', body };
    }

    if (isJieKouVeoVideoModel(params.selectedModel)) {
        if (images.length > 2) {
            throw new ApiRouteError('JieKou Veo 3.1 图生视频最多支持首帧和尾帧 2 张图片', 400);
        }

        const body: Record<string, unknown> = {
            prompt: params.prompt.trim(),
            aspect_ratio: params.aspectRatio === '9:16' ? '9:16' : '16:9',
            duration_seconds: resolveJieKouVeoDuration(params.duration),
            enhance_prompt: true,
            generate_audio: typeof params.generateAudio === 'boolean' ? params.generateAudio : true,
            resolution: params.resolution === '1080p' ? '1080p' : '720p',
            sample_count: 1,
        };

        if (params.seed !== undefined && params.seed >= 0) {
            body.seed = params.seed;
        }

        if (images.length > 0) {
            body.image = images[0];
            if (images[1]) {
                body.last_image = images[1];
            }
            return { path: '/v3/async/veo-3.1-generate-img2video', body };
        }

        return { path: '/v3/async/veo-3.1-generate-text2video', body };
    }

    throw new ApiRouteError('JieKou AI 暂不支持该视频模型', 400);
}

function orderJieKouVideoImages(imageEntries: Array<{ image: string; imageType?: string }>): Array<{ image: string; imageType?: string }> {
    if (imageEntries.length <= 1) {
        return imageEntries;
    }

    const firstFrame = imageEntries.find((item) => item.imageType === 'first_frame') ?? imageEntries[0];
    const lastFrame = imageEntries.find((item) => item.imageType === 'last_frame')
        ?? imageEntries.find((item) => item !== firstFrame);

    return lastFrame ? [firstFrame, lastFrame] : [firstFrame];
}

function normalizeJieKouVideoImageInput(entry: { image: string }): string {
    const image = entry.image.trim();
    if (!image) {
        throw new ApiRouteError('参考图不能为空', 400);
    }

    if (!isDataUrl(image)) {
        return image;
    }

    const base64 = extractDataUrlBase64(image);
    if (estimateBase64Bytes(base64) > MAX_VIDEO_REFERENCE_IMAGE_BYTES) {
        throw new ApiRouteError(
            `单张参考图不能超过 ${(MAX_VIDEO_REFERENCE_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB`,
            413,
        );
    }

    return base64;
}

function resolveJieKouSoraDuration(duration: number | undefined): number {
    if (duration === 8 || duration === 12) {
        return duration;
    }

    return 4;
}

function resolveJieKouVeoDuration(duration: number | undefined): number {
    if (duration === 4 || duration === 6 || duration === 8) {
        return duration;
    }

    return 8;
}

function resolveJieKouSoraSize(aspectRatio: string | undefined, professional: boolean): string {
    if (aspectRatio === '16:9') {
        return professional ? '1792*1024' : '1280*720';
    }

    return professional ? '1024*1792' : '720*1280';
}

function buildMagicApiVideoRequest(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    generationMode: unknown;
    imageEntries: Array<{ image: string; imageType?: string }>;
    videos: string[];
    audios: string[];
    resolution?: '480p' | '720p' | '1080p';
    enableUpsample: unknown;
    generateAudio: unknown;
    watermark: unknown;
    seed?: number;
    returnLastFrame: unknown;
    tools: Array<{ type: string }>;
}): { format: 'json' | 'multipart'; body: BodyInit } {
    if (isMagicApiDoubaoUrlVideoModel(params.selectedModel)) {
        return {
            format: 'json',
            body: JSON.stringify(buildMagicApiDoubaoVideoBody(params)),
        };
    }

    if (isMagicApiJsonVideoModel(params.selectedModel)) {
        return {
            format: 'json',
            body: JSON.stringify(buildMagicApiPluginJsonVideoBody(params)),
        };
    }

    if (!isMagicApiMultipartVideoModel(params.selectedModel)) {
        throw new ApiRouteError(`MagicAPI 暂不支持视频模型 ${params.selectedModel}`, 400);
    }

    return {
        format: 'multipart',
        body: buildMagicApiMultipartVideoBody(params),
    };
}

function resolveMagicApiUnavailableModelFallback(model: string, payload: unknown): string | null {
    if (!isMagicApiVeoVideoModel(model)) {
        return null;
    }

    const errorCode = getNestedValue(payload, 'error', 'code');
    const errorMessage = getApiErrorMessage(payload, '');
    const normalizedError = `${typeof errorCode === 'string' ? errorCode : ''} ${errorMessage}`.toLowerCase();
    const isUnavailable = normalizedError.includes('model_not_found')
        || normalizedError.includes('channel not found')
        || normalizedError.includes('available channel');

    return isUnavailable ? 'sora-2' : null;
}

function buildMagicApiMultipartVideoBody(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    imageEntries: Array<{ image: string; imageType?: string }>;
    resolution?: '480p' | '720p' | '1080p';
    enableUpsample?: unknown;
    generateAudio?: unknown;
}) {
    if (isMagicApiDoubaoMultipartVideoModel(params.selectedModel)) {
        return buildMagicApiDoubaoMultipartVideoBody(params);
    }

    const formData = new FormData();
    const seconds = resolveMagicApiVideoSeconds(params.selectedModel, params.duration);

    formData.append('model', params.selectedModel);
    formData.append('prompt', params.prompt);
    formData.append('seconds', String(seconds));

    if (isMagicApiGrokVideoModel(params.selectedModel)) {
        formData.append('aspect_ratio', params.aspectRatio || '16:9');
        formData.append('size', resolveMagicApiGrokResolution(params.resolution));
    } else {
        formData.append('size', resolveMagicApiVideoPixelSize(params.aspectRatio));
    }

    if (typeof params.enableUpsample === 'boolean') {
        formData.append('enable_upsample', String(params.enableUpsample));
    }

    if (supportsVideoAudioGeneration(params.selectedModel)) {
        formData.append('metadata', JSON.stringify({
            output_config: {
                aspect_ratio: params.aspectRatio || '16:9',
                audio_generation: params.generateAudio === true ? 'Enabled' : 'Disabled',
            },
        }));
    }

    appendMagicApiMultipartImages(formData, params.selectedModel, params.imageEntries, 'input_reference');
    return formData;
}

function buildMagicApiDoubaoVideoBody(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    generationMode: unknown;
    imageEntries: Array<{ image: string; imageType?: string }>;
    videos: string[];
    audios: string[];
    resolution?: '480p' | '720p' | '1080p';
    generateAudio: unknown;
    watermark: unknown;
    tools: Array<{ type: string }>;
}) {
    const imageUrls = normalizeMagicApiDoubaoImageUrls(params.imageEntries);
    const body: Record<string, unknown> = {
        model: params.selectedModel,
        prompt: params.prompt,
        duration: resolveMagicApiVideoSeconds(params.selectedModel, params.duration),
        ratio: params.aspectRatio || '16:9',
        resolution: params.resolution === '480p' ? '480p' : '720p',
        watermark: typeof params.watermark === 'boolean' ? params.watermark : false,
    };

    if (typeof params.generateAudio === 'boolean') {
        body.generate_audio = params.generateAudio;
    }

    const firstFrame = imageUrls.find((entry) => entry.imageType === 'first_frame');
    const lastFrame = imageUrls.find((entry) => entry.imageType === 'last_frame');
    const references = imageUrls.filter((entry) => entry.imageType === 'reference');
    const fallbackFirstFrame = !firstFrame && references.length === 0 ? imageUrls[0] : undefined;
    const effectiveFirstFrame = firstFrame ?? fallbackFirstFrame;

    if (effectiveFirstFrame) {
        body.first_frame_url = effectiveFirstFrame.image;
    }

    if (lastFrame && lastFrame.image !== effectiveFirstFrame?.image) {
        body.last_frame_url = lastFrame.image;
    }

    if (references.length > 0) {
        body.reference_image_urls = references.map((entry) => entry.image);
    }

    if (params.videos.length === 1) {
        body.reference_video_url = params.videos[0];
    } else if (params.videos.length > 1) {
        body.reference_video_urls = params.videos;
    }

    if (params.audios.length > 0) {
        if (imageUrls.length === 0 && params.videos.length === 0) {
            throw new ApiRouteError('参考音频不能单独使用，至少还需要一条参考图或参考视频', 400);
        }
        body.audio_url = params.audios[0];
    }

    if (params.tools.length > 0) {
        body.tools = params.tools;
    }

    return body;
}

function buildMagicApiDoubaoMultipartVideoBody(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    imageEntries: Array<{ image: string; imageType?: string }>;
}) {
    const formData = new FormData();
    const seconds = resolveMagicApiVideoSeconds(params.selectedModel, params.duration);
    const firstFrame = params.imageEntries.find((entry) => entry.imageType === 'first_frame') ?? params.imageEntries[0];
    const lastFrame = params.imageEntries.find((entry) => entry.imageType === 'last_frame')
        ?? params.imageEntries.find((entry) => entry.image !== firstFrame?.image);

    formData.append('model', params.selectedModel);
    formData.append('prompt', params.prompt);
    formData.append('seconds', String(seconds));
    formData.append('size', params.aspectRatio || '16:9');

    if (firstFrame) {
        appendMagicApiMultipartImage(formData, 'first_frame_image', firstFrame.image, 0);
    }

    if (lastFrame && lastFrame.image !== firstFrame?.image) {
        appendMagicApiMultipartImage(formData, 'last_frame_image', lastFrame.image, 1);
    }

    return formData;
}

function buildMagicApiPluginJsonVideoBody(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    imageEntries: Array<{ image: string; imageType?: string }>;
    generateAudio: unknown;
}) {
    const { model, size } = resolveMagicApiJsonModelAndSize(params.selectedModel, params.aspectRatio);
    const seconds = resolveMagicApiVideoSeconds(params.selectedModel, params.duration);
    const outputConfig: Record<string, unknown> = isMagicApiHailuoVideoModel(params.selectedModel)
        ? { resolution: '720P' }
        : {
            aspect_ratio: params.aspectRatio || '16:9',
            audio_generation: params.generateAudio === true ? 'Enabled' : 'Disabled',
        };
    const resolution = inferMagicApiResolutionFromSize(size);

    if (resolution && !isMagicApiHailuoVideoModel(params.selectedModel)) {
        outputConfig.resolution = resolution;
    }

    if (isMagicApiKlingVideoModel(params.selectedModel)) {
        outputConfig.duration = seconds;
    }

    const body: Record<string, unknown> = {
        model,
        prompt: params.prompt,
        seconds: String(seconds),
        metadata: { output_config: outputConfig },
    };

    if (size && (isMagicApiWanVideoModel(params.selectedModel) || isMagicApiKlingVideoModel(params.selectedModel))) {
        body.size = size;
    }

    const firstFrame = params.imageEntries.find((entry) => entry.imageType === 'first_frame') ?? params.imageEntries[0];
    const lastFrame = params.imageEntries.find((entry) => entry.imageType === 'last_frame')
        ?? params.imageEntries.find((entry) => entry.image !== firstFrame?.image);
    const referenceImages = params.imageEntries.filter((entry) => entry.imageType === 'reference');

    if (isMagicApiWanImageToVideoModel(params.selectedModel) && firstFrame) {
        body.image = firstFrame.image;
    } else if (isMagicApiViduVideoModel(params.selectedModel)) {
        if (firstFrame) {
            body.image = firstFrame.image;
        }
        if (lastFrame && lastFrame.image !== firstFrame?.image) {
            body.metadata = {
                ...(body.metadata as Record<string, unknown>),
                last_frame_url: lastFrame.image,
            };
        }
        if (referenceImages.length > 0) {
            body.images = referenceImages.map((entry) => entry.image).slice(0, 3);
        }
    } else if (isMagicApiHailuoVideoModel(params.selectedModel) && firstFrame) {
        body.image = firstFrame.image;
    } else if (isMagicApiKlingVideoModel(params.selectedModel) && params.imageEntries.length > 0) {
        const references = params.imageEntries.map((entry) => entry.image);
        body.input_reference = references.length === 1 ? references[0] : references;
    }

    return body;
}

function resolveMagicApiJsonModelAndSize(model: string, aspectRatio?: string): { model: string; size: string } {
    if (isMagicApiWanVideoModel(model) && model.includes(':')) {
        const [upstreamModel, size] = model.split(':', 2);
        return { model: upstreamModel || model, size: size || '' };
    }

    if (isMagicApiKlingVideoModel(model)) {
        return { model, size: resolveMagicApiVideoPixelSize(aspectRatio) };
    }

    return { model, size: '' };
}

function inferMagicApiResolutionFromSize(size: string): string | undefined {
    const normalized = size.toLowerCase();
    if (normalized.includes('1920') || normalized.includes('1080')) return '1080P';
    if (normalized.includes('1280') || normalized.includes('720')) return '720P';
    if (normalized.includes('540')) return '540P';
    return undefined;
}

function appendMagicApiMultipartImages(
    formData: FormData,
    model: string,
    imageEntries: Array<{ image: string; imageType?: string }>,
    fieldName: string,
) {
    const maxImages = getMaxImagesForVideoModel(model);
    const images = imageEntries.slice(0, maxImages);

    if (imageEntries.length > maxImages) {
        throw new ApiRouteError(`参考图数量不能超过 ${maxImages} 张`, 400);
    }

    images.forEach((entry, index) => {
        const image = entry.image.trim();
        if (!image) {
            return;
        }

        appendMagicApiMultipartImage(formData, fieldName, image, index);
    });
}

function appendMagicApiMultipartImage(formData: FormData, fieldName: string, image: string, index: number) {
    if (!isDataUrl(image)) {
        formData.append(fieldName, image);
        return;
    }

    const { bytes, mime } = decodeDataUrlBytes(image);
    if (bytes.byteLength > MAX_VIDEO_REFERENCE_IMAGE_BYTES) {
        throw new ApiRouteError(
            `单张参考图不能超过 ${(MAX_VIDEO_REFERENCE_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB`,
            413,
        );
    }

    const extension = mime.includes('jpeg') ? 'jpg' : mime.split('/')[1]?.split(';')[0] || 'png';
    const normalizedBytes = new Uint8Array(bytes.byteLength);
    normalizedBytes.set(bytes);
    const blob = new Blob([normalizedBytes.buffer], { type: mime });
    formData.append(fieldName, blob, `reference-${index + 1}.${extension}`);
}

function normalizeMagicApiDoubaoImageUrls(imageEntries: Array<{ image: string; imageType?: string }>): Array<{ image: string; imageType?: string }> {
    const normalized: Array<{ image: string; imageType?: string }> = [];

    imageEntries.forEach((entry) => {
        const image = entry.image.trim();
        if (!image) {
            return;
        }

        if (isDataUrl(image)) {
            throw new ApiRouteError('MagicAPI 豆包视频参考图需要先上传为可访问 URL；请先使用图片素材库或上传服务生成链接。', 400);
        }

        normalized.push({ image, imageType: entry.imageType });
    });

    return normalized;
}

function resolveUpstreamVideoModel(model: string): string {
    // veo3.1-fast is exposed as a cheaper UI alias. Upstream capability parity currently
    // matches the documented veo3.1 model, so requests are normalized before submission.
    return model === 'veo3.1-fast' ? 'veo3.1' : model;
}

function estimateBase64Bytes(value: string): number {
    const normalized = value.trim();
    if (!normalized) return 0;

    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.floor((normalized.length * 3) / 4) - padding;
}

function isVeoModel(model: string): boolean {
    return model.startsWith('veo');
}

function isSdolsVideoModel(model: string): boolean {
    return model.startsWith('sdols') || model.startsWith('doubao-seedance');
}

function isVeoComponentsModel(model: string): boolean {
    return model.includes('components');
}

function getMaxVideoReferenceImages(model: string): number {
    if (isSdolsVideoModel(model)) {
        return MAX_VIDEO_REFERENCE_IMAGES;
    }

    if (isVeoComponentsModel(model)) {
        return 3;
    }

    if (isVeoModel(model)) {
        return 2;
    }

    return MAX_VIDEO_REFERENCE_IMAGES;
}

function normalizeVideoDuration(value: unknown, model: string): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && (value > 0 || value === -1)) {
        return isSdolsVideoModel(model) ? normalizeSdolsDuration(value) : value;
    }

    if (typeof value !== 'string') {
        return undefined;
    }

    const match = value.trim().match(/^(-?\d+)(?:s)?$/i);
    if (!match) {
        return undefined;
    }

    const duration = Number.parseInt(match[1], 10);
    if (!Number.isFinite(duration) || duration === 0) {
        return undefined;
    }

    if (isSdolsVideoModel(model)) {
        return normalizeSdolsDuration(duration);
    }

    return duration > 0 ? duration : undefined;
}

function normalizeSdolsDuration(duration: number): number {
    if (duration === -1) {
        return -1;
    }

    if (duration < 4) {
        return 4;
    }

    if (duration > 15) {
        return 15;
    }

    return Math.trunc(duration);
}

function normalizeVideoAspectRatio(
    model: string,
    rawAspectRatio: unknown,
    hasImages: boolean,
): string | undefined {
    if (typeof rawAspectRatio !== 'string') {
        return undefined;
    }

    const aspectRatio = rawAspectRatio.trim();
    if (!aspectRatio) {
        return undefined;
    }

    if (!isVeoModel(model)) {
        return aspectRatio;
    }

    if (aspectRatio === '16:9' || aspectRatio === '9:16') {
        return aspectRatio;
    }

    if (aspectRatio === '4:3') {
        return '16:9';
    }

    if (aspectRatio === '3:4') {
        return '9:16';
    }

    // Veo docs only list 16:9 and 9:16. For square/other values, omit the field so
    // the upstream can infer from the reference frame or fall back to its default.
    return hasImages ? undefined : '16:9';
}

type IncomingVideoImage = string | { image?: unknown; image_type?: unknown };

function normalizeVideoReferenceImages(rawReferenceImages: unknown): string[] {
    if (!Array.isArray(rawReferenceImages)) {
        return [];
    }

    return rawReferenceImages
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function normalizeSubmissionVideoImageEntries(
    rawImages: unknown,
    rawReferenceImages: unknown,
    model: string,
): Array<{ image: string; imageType?: string }> {
    const normalizedImages = normalizeVideoImageEntries(rawImages, model);
    const normalizedReferenceImages = normalizeVideoReferenceImages(rawReferenceImages).map((image) => ({
        image,
        imageType: 'reference',
    }));

    if (normalizedReferenceImages.length === 0) {
        return normalizedImages;
    }

    if (normalizedImages.length === 0) {
        return normalizedReferenceImages;
    }

    const mergedImages = [...normalizedImages];
    normalizedReferenceImages.forEach((entry) => {
        if (mergedImages.some((existing) => existing.image === entry.image)) {
            return;
        }

        mergedImages.push(entry);
    });

    return mergedImages;
}

function normalizeVideoImageEntries(rawImages: unknown, model: string): Array<{ image: string; imageType?: string }> {
    if (!Array.isArray(rawImages)) {
        return [];
    }

    return rawImages
        .map((item, index) => normalizeVideoImageEntry(item as IncomingVideoImage, index, model))
        .filter((item): item is { image: string; imageType?: string } => !!item);
}

function normalizeVideoImages(rawImages: unknown, model: string): string[] {
    const entries = normalizeVideoImageEntries(rawImages, model);

    if (entries.length === 0) {
        return [];
    }

    if (isVeoComponentsModel(model)) {
        return entries.slice(0, 3).map((item) => item.image);
    }

    if (isVeoModel(model)) {
        const ordered: string[] = [];
        const firstFrame = entries.find((item) => item.imageType === 'first_frame')?.image ?? entries[0]?.image;
        const lastFrame = entries.find((item) => item.imageType === 'last_frame')?.image
            ?? entries.find((item) => item.image !== firstFrame)?.image;

        if (firstFrame) {
            ordered.push(firstFrame);
        }

        if (lastFrame && lastFrame !== firstFrame) {
            ordered.push(lastFrame);
        }

        return ordered;
    }

    return entries.map((item) => item.image);
}

function normalizeReferenceAssetList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function normalizeVideoResolution(model: string, value: unknown): '480p' | '720p' | '1080p' | undefined {
    if (value !== '480p' && value !== '720p' && value !== '1080p') {
        return undefined;
    }

    if (isSdolsVideoModel(model) && value === '1080p') {
        return undefined;
    }

    return value;
}

function normalizeGenerationSeed(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        return undefined;
    }

    return value >= -1 && value <= 4294967295 ? value : undefined;
}

function normalizeVideoTools(value: unknown): Array<{ type: string }> {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (!item || typeof item !== 'object') {
                return null;
            }

            const type = typeof (item as { type?: unknown }).type === 'string'
                ? (item as { type: string }).type.trim()
                : '';
            if (!type) {
                return null;
            }

            return { type };
        })
        .filter((item): item is { type: string } => !!item);
}

function normalizeVideoImageEntry(
    item: IncomingVideoImage,
    index: number,
    model: string,
): { image: string; imageType?: string } | null {
    if (typeof item === 'string') {
        const image = item.trim();
        if (!image) {
            return null;
        }

        return {
            image,
            imageType: inferVideoImageType(index, model),
        };
    }

    if (!item || typeof item !== 'object') {
        return null;
    }

    const image = typeof item.image === 'string' ? item.image.trim() : '';
    if (!image) {
        return null;
    }

    const imageType = typeof item.image_type === 'string' ? item.image_type : inferVideoImageType(index, model);
    return { image, imageType };
}

function inferVideoImageType(index: number, model: string): string | undefined {
    if (isVeoComponentsModel(model)) {
        return 'reference';
    }

    if (isSdolsVideoModel(model)) {
        return 'reference';
    }

    if (isVeoModel(model)) {
        return index === 0 ? 'first_frame' : 'last_frame';
    }

    return undefined;
}

type DomesticVideoGenerationMode = 'first-last-frame' | 'omni-reference';

function normalizeDomesticVideoGenerationMode(
    value: unknown,
    imageEntries: Array<{ image: string; imageType?: string }>,
    videos: string[],
    audios: string[],
): DomesticVideoGenerationMode {
    if (value === 'first-last-frame' || value === 'omni-reference') {
        return value;
    }

    if (videos.length > 0 || audios.length > 0) {
        return 'omni-reference';
    }

    if (imageEntries.some((item) => item.imageType === 'first_frame' || item.imageType === 'last_frame')) {
        return 'first-last-frame';
    }

    return 'omni-reference';
}

function buildStandardVideoBody(params: {
    model: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    enhancePrompt: unknown;
    enableUpsample: unknown;
    imageEntries: Array<{ image: string; imageType?: string }>;
    videos: string[];
    audios: string[];
    resolution?: '480p' | '720p' | '1080p';
    generateAudio: unknown;
    watermark: unknown;
    seed?: number;
    returnLastFrame: unknown;
    tools: Array<{ type: string }>;
}) {
    const {
        model,
        prompt,
        aspectRatio,
        duration,
        enhancePrompt,
        enableUpsample,
        imageEntries,
        videos,
        audios,
        resolution,
        generateAudio,
        watermark,
        seed,
        returnLastFrame,
        tools,
    } = params;
    const body: Record<string, unknown> = {
        model,
        prompt,
    };
    const normalizedImages = normalizeVideoImages(imageEntries, model);

    if (aspectRatio) {
        if (isSdolsVideoModel(model)) {
            body.ratio = aspectRatio;
        } else {
            body.aspect_ratio = aspectRatio;
        }
    }

    if (duration !== undefined && !isVeoModel(model)) {
        body.duration = duration;
    }

    if (enhancePrompt !== undefined && isVeoModel(model)) {
        body.enhance_prompt = enhancePrompt;
    }

    if (enableUpsample !== undefined && isVeoModel(model)) {
        body.enable_upsample = enableUpsample;
    }

    if (isSdolsVideoModel(model)) {
        if (videos.length > 0) {
            body.videos = videos;
        }

        if (audios.length > 0) {
            body.audios = audios;
        }

        if (resolution) {
            body.resolution = resolution;
        }

        if (typeof generateAudio === 'boolean') {
            body.generate_audio = generateAudio;
        }

        if (typeof watermark === 'boolean') {
            body.watermark = watermark;
        }

        if (seed !== undefined) {
            body.seed = seed;
        }

        if (typeof returnLastFrame === 'boolean') {
            body.return_last_frame = returnLastFrame;
        }

        if (tools.length > 0) {
            body.tools = tools;
        }
    }

    if (normalizedImages.length > 0) {
        const maxImages = getMaxVideoReferenceImages(model);
        if (normalizedImages.length > maxImages) {
            throw new ApiRouteError(`参考图数量不能超过 ${maxImages} 张`, 400);
        }

        body.images = normalizedImages.map((image) => {
            let cleanImage = image;
            if (isDataUrl(cleanImage)) {
                cleanImage = extractDataUrlBase64(cleanImage);
            }

            if (estimateBase64Bytes(cleanImage) > MAX_VIDEO_REFERENCE_IMAGE_BYTES) {
                throw new ApiRouteError(
                    `单张参考图不能超过 ${(MAX_VIDEO_REFERENCE_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB`,
                    413,
                );
            }

            return cleanImage;
        });
    }

    return body;
}

function buildDomesticOfficialVideoBody(params: {
    model: string;
    prompt: string;
    aspectRatio?: string;
    duration?: number;
    generationMode: DomesticVideoGenerationMode;
    imageEntries: Array<{ image: string; imageType?: string }>;
    videos: string[];
    audios: string[];
    resolution?: '480p' | '720p' | '1080p';
    generateAudio: unknown;
    returnLastFrame: unknown;
    tools: Array<{ type: string }>;
}) {
    const {
        model,
        prompt,
        aspectRatio,
        duration,
        generationMode,
        imageEntries,
        videos,
        audios,
        resolution,
        generateAudio,
        returnLastFrame,
        tools,
    } = params;

    const content: Array<Record<string, unknown>> = [];
    const trimmedPrompt = prompt.trim();

    if (trimmedPrompt) {
        content.push({
            type: 'text',
            text: trimmedPrompt,
        });
    }

    const appendImageContent = (entry: { image: string; imageType?: string }, role: 'reference_image' | 'first_frame' | 'last_frame') => {
        const rawImage = entry.image.trim();
        if (!rawImage) {
            return;
        }

        if (isDataUrl(rawImage)) {
            const base64 = extractDataUrlBase64(rawImage);
            if (estimateBase64Bytes(base64) > MAX_VIDEO_REFERENCE_IMAGE_BYTES) {
                throw new ApiRouteError(
                    `单张参考图不能超过 ${(MAX_VIDEO_REFERENCE_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB`,
                    413,
                );
            }
        }

        content.push({
            type: 'image_url',
            image_url: { url: rawImage },
            role,
        });
    };

    if (generationMode === 'first-last-frame') {
        if (videos.length > 0 || audios.length > 0) {
            throw new ApiRouteError('首尾帧模式不支持参考视频或参考音频，请切换到全能参考模式', 400);
        }

        if (imageEntries.length === 0) {
            throw new ApiRouteError('首尾帧模式至少需要上传一张首帧图片', 400);
        }

        if (imageEntries.length > 2) {
            throw new ApiRouteError('首尾帧模式最多支持 2 张图片', 400);
        }

        const firstFrame = imageEntries.find((entry) => entry.imageType === 'first_frame') ?? imageEntries[0];
        const lastFrame = imageEntries.find((entry) => entry.imageType === 'last_frame')
            ?? imageEntries.find((entry) => entry !== firstFrame);

        appendImageContent(firstFrame, 'first_frame');
        if (lastFrame) {
            appendImageContent(lastFrame, 'last_frame');
        }
    } else {
        if (imageEntries.length > MAX_VIDEO_REFERENCE_IMAGES) {
            throw new ApiRouteError(`参考图数量不能超过 ${MAX_VIDEO_REFERENCE_IMAGES} 张`, 400);
        }

        if (videos.length > MAX_VIDEO_REFERENCE_VIDEOS) {
            throw new ApiRouteError(`参考视频数量不能超过 ${MAX_VIDEO_REFERENCE_VIDEOS} 条`, 400);
        }

        if (audios.length > MAX_VIDEO_REFERENCE_AUDIOS) {
            throw new ApiRouteError(`参考音频数量不能超过 ${MAX_VIDEO_REFERENCE_AUDIOS} 条`, 400);
        }

        if (audios.length > 0 && imageEntries.length === 0 && videos.length === 0) {
            throw new ApiRouteError('参考音频不能单独使用，至少还需要一条参考图或参考视频', 400);
        }

        imageEntries.forEach((entry) => {
            appendImageContent(entry, 'reference_image');
        });

        videos.forEach((video) => {
            content.push({
                type: 'video_url',
                video_url: { url: video },
                role: 'reference_video',
            });
        });

        audios.forEach((audio) => {
            content.push({
                type: 'audio_url',
                audio_url: { url: audio },
                role: 'reference_audio',
            });
        });
    }

    if (content.length === 0) {
        throw new ApiRouteError('官方格式请求至少需要提示词或参考素材', 400);
    }

    const body: Record<string, unknown> = {
        model,
        content,
    };

    if (typeof generateAudio === 'boolean') {
        body.generate_audio = generateAudio;
    }

    if (aspectRatio) {
        body.ratio = aspectRatio;
    }

    if (duration !== undefined) {
        body.duration = duration;
    }

    body.watermark = false;

    if (resolution) {
        body.resolution = resolution;
    }

    if (typeof returnLastFrame === 'boolean') {
        body.return_last_frame = returnLastFrame;
    }

    if (tools.length > 0) {
        body.tools = tools;
    }

    return body;
}
