import { NextRequest, NextResponse } from 'next/server';
import { extractDataUrlBase64, isDataUrl } from '@/lib/data-url';
import { encodeVideoTaskId, getVideoGenerationTransport } from '@/lib/video-generation-transport';
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

        const { apiKey, baseUrl } = resolveAiServiceConfig(request);

        const requestedModel = typeof model === 'string' && model.trim() ? model.trim() : 'veo3.1';
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

        console.log(`[generate-video] model=${requestedModel}, upstreamModel=${selectedModel}, transport=${transport}, prompt="${normalizedPrompt.substring(0, 50)}...", images=${normalizedImageEntries.length}, videos=${normalizedVideos.length}, audios=${normalizedAudios.length}`);

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

        console.log('[generate-video] Full response:', JSON.stringify(data));

        // Try multiple possible paths for task_id in the response
        const taskId = getNestedValue(data, 'data', 'task_id')
            || getNestedValue(data, 'task_id')
            || getNestedValue(data, 'data', 'id')
            || getNestedValue(data, 'id')
            || getNestedValue(data, 'data', 'taskId')
            || getNestedValue(data, 'taskId');

        if (typeof taskId === 'string' && taskId.length > 0) {
            return NextResponse.json({ taskId: encodeVideoTaskId(taskId, transport), status: 'pending' });
        }

        // If the API returned video data directly (unlikely but handle it)
        const videoUrl = extractVideoUrl(data);

        if (videoUrl) {
            return NextResponse.json({ status: 'completed', videoUrl });
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
