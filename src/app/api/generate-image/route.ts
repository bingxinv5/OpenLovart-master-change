import { NextRequest, NextResponse } from 'next/server';
import { extractDataUrlBase64, isDataUrl, parseDataUrl } from '@/lib/data-url';
import { debugLog } from '@/lib/debug-log';
import { fetchRemoteAsset, RemoteFetchError } from '../_shared/cdn-cache';
import {
    AI_UPSTREAM_TIMEOUT_MS,
    ApiRouteError,
    createUpstreamConnectionError,
    extractImageResult,
    getNestedValue,
    createAiHeaders,
    fetchWithRetry,
    getApiErrorMessage,
    getErrorMessage,
    handleApiRouteError,
    parseJsonResponse,
    resolveAiServiceConfig,
} from '../_shared/ai-service';
import { createDefaultLocalImageJob } from '../_shared/default-image-tasks';
import {
    createMagicApiLocalImageJob,
} from '../_shared/magicapi-image-jobs';
import {
    createJieKouLocalImageJob,
    encodeJieKouImageTaskId,
} from '../_shared/jiekou-image-tasks';
import { createVApiLocalImageJob } from '../_shared/vapi-image-tasks';
import {
    buildUpstreamImageGenerationBody,
    describeOpenAiGptImageAspectRatio,
    getMaxReferenceImagesForImageModel,
    getOpenAiGptImagePromptCompensation,
    isGeminiNativeImageModel,
    isJieKouGeminiImageModel,
    isJieKouGptImageModel,
    isJieKouNanoBananaImageModel,
    isMagicApiGptImageOfficialSize,
    isOpenAiGptImageAutoSize,
    isOpenAiGptImageModel,
    isVApiGeminiImageModel,
    isVApiImageModel,
    resolveJieKouGptImageQuality,
    resolveJieKouGptImageSize,
    resolveJieKouImageAspectRatio,
    resolveJieKouNanoBananaQuality,
    resolveJieKouNanoBananaSize,
    resolveJieKouStandardImageSize,
    resolveMagicApiGeminiImageSize,
    resolveMagicApiOpenAiStyleImageSize,
    resolveVApiGeminiImageSize,
} from '@/lib/image-generation-models';
import { isJieKouProvider, isMagicApiProvider, isVApiProvider } from '@/lib/ai-providers';

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

type NormalizedReferenceImage = {
    base64: string;
    mime: string;
};

type ImageResultShape = ReturnType<typeof extractImageResult>;

export async function POST(request: NextRequest) {
    try {
        const { prompt, model, aspectRatio, imageSize, quality, generateCount, referenceImages, referenceImage } = await request.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ error: '请输入提示词' }, { status: 400 });
        }

        const { providerId, apiKey, baseUrl } = resolveAiServiceConfig(request);

        const selectedModel = model || 'gemini-3.1-flash-image-preview';
        const maxReferenceImageCount = getMaxReferenceImagesForImageModel(selectedModel);

        // Reference images (array of base64 or URL strings)
        const imgList: string[] = referenceImages || (referenceImage ? [referenceImage] : []);
        const normalizedImages: NormalizedReferenceImage[] = [];
        if (imgList.length > 0) {
            if (imgList.length > maxReferenceImageCount) {
                return NextResponse.json({ error: `当前模型的参考图数量不能超过 ${maxReferenceImageCount} 张` }, { status: 400 });
            }

            for (const img of imgList) {
                let cleanData = img;
                let mime = 'image/png';
                if (img.startsWith('http://') || img.startsWith('https://')) {
                    debugLog(`[generate-image] Fetching reference image from URL: ${img.substring(0, 100)}...`);
                    try {
                        const { buffer, contentType } = await fetchRemoteAsset(img, {
                            timeoutMs: 20_000,
                            maxBytes: MAX_REFERENCE_IMAGE_BYTES,
                            allowedContentTypePrefixes: ['image/'],
                        });
                        cleanData = buffer.toString('base64');
                        mime = contentType || mime;
                    } catch (fetchErr: unknown) {
                        console.error('[generate-image] Failed to fetch reference image:', fetchErr);
                        return NextResponse.json(
                            { error: '参考图下载失败', details: getErrorMessage(fetchErr) },
                            { status: fetchErr instanceof RemoteFetchError ? fetchErr.status : 400 }
                        );
                    }
                } else if (isDataUrl(img)) {
                    mime = parseDataUrl(img).mime || mime;
                    cleanData = extractDataUrlBase64(img);
                }

                if (estimateBase64Bytes(cleanData) > MAX_REFERENCE_IMAGE_BYTES) {
                    return NextResponse.json(
                        { error: `参考图大小不能超过 ${(MAX_REFERENCE_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB` },
                        { status: 413 },
                    );
                }

                normalizedImages.push({ base64: cleanData, mime });
            }
        }

        const cleanImages = normalizedImages.map((image) => image.base64);

        const body = buildUpstreamImageGenerationBody({
            model: selectedModel,
            prompt,
            aspectRatio,
            imageSize,
            quality,
            generateCount: typeof generateCount === 'number' ? generateCount : undefined,
            referenceImages: cleanImages,
            responseFormat: 'url',
        });

        if (isOpenAiGptImageModel(selectedModel)) {
            const targetSize = typeof body.size === 'string' ? body.size : 'unknown';
            const targetAspectRatio = describeOpenAiGptImageAspectRatio(targetSize, aspectRatio);
            const compensation = isOpenAiGptImageAutoSize(targetSize)
                ? ''
                : getOpenAiGptImagePromptCompensation(targetSize, aspectRatio, cleanImages.length > 0);
            const hasRatioPriorityPrompt = !!compensation && typeof body.prompt === 'string' && body.prompt.includes(compensation);
            debugLog(
                `[generate-image][gpt-image-2] requestedSize=${typeof imageSize === 'string' ? imageSize : '-'}, targetSize=${targetSize}, requestedAspect=${typeof aspectRatio === 'string' ? aspectRatio : '-'}, targetAspect=${targetAspectRatio}, references=${cleanImages.length}, ratioPriorityPrompt=${hasRatioPriorityPrompt}`,
            );
            if (compensation) {
                debugLog(`[generate-image][gpt-image-2] ratioPriorityInstruction=${compensation}`);
            }
        }

        debugLog(`[generate-image] model=${selectedModel}, baseUrl=${baseUrl}, prompt="${prompt.substring(0, 50)}..."`);

        if (isMagicApiProvider(providerId)) {
            return await submitMagicApiImageGeneration({
                apiKey,
                baseUrl,
                selectedModel,
                prompt,
                aspectRatio,
                imageSize,
                normalizedImages,
            });
        }

        if (isJieKouProvider(providerId)) {
            return await submitJieKouImageGeneration({
                apiKey,
                baseUrl,
                selectedModel,
                prompt,
                aspectRatio,
                imageSize,
                quality,
                generateCount,
                normalizedImages,
            });
        }

        if (isVApiProvider(providerId)) {
            return await submitVApiImageGeneration({
                apiKey,
                baseUrl,
                selectedModel,
                prompt,
                aspectRatio,
                imageSize,
                quality,
                generateCount,
                normalizedImages,
            });
        }

        const usesGptImageEdits = isOpenAiGptImageModel(selectedModel) && normalizedImages.length > 0;
        const targetUrl = `${baseUrl}${usesGptImageEdits ? '/v1/images/edits' : '/v1/images/generations'}?async=true`;
        const localTaskId = createDefaultLocalImageJob(async () => {
            const data = await fetchDefaultImageGenerationData({
                targetUrl,
                apiKey,
                baseUrl,
                selectedModel,
                usesGptImageEdits,
                requestBody: body,
                normalizedImages,
            });

            return {
                data,
                upstreamTaskId: hasExtractableImageResult(data) ? null : extractDefaultImageTaskId(data),
            };
        });

        return NextResponse.json({ taskId: localTaskId, status: 'pending' });

    } catch (error: unknown) {
        return handleApiRouteError(error, '图片生成失败', 'generate-image');
    }
}

async function fetchDefaultImageGenerationData(params: {
    targetUrl: string;
    apiKey: string;
    baseUrl: string;
    selectedModel: string;
    usesGptImageEdits: boolean;
    requestBody: Record<string, unknown>;
    normalizedImages: NormalizedReferenceImage[];
}): Promise<Record<string, unknown>> {
    const { targetUrl, apiKey, baseUrl, selectedModel, usesGptImageEdits, requestBody, normalizedImages } = params;
    const timeoutMs = isOpenAiGptImageModel(selectedModel) || usesGptImageEdits
        ? AI_UPSTREAM_TIMEOUT_MS.slowImageSubmit
        : AI_UPSTREAM_TIMEOUT_MS.submit;
    let response: Response;

    try {
        response = await fetchWithRetry(
            targetUrl,
            usesGptImageEdits
                ? {
                    method: 'POST',
                    headers: createAiHeaders(apiKey),
                    body: buildGptImageEditsFormData(requestBody, normalizedImages),
                }
                : {
                    method: 'POST',
                    headers: createAiHeaders(apiKey, true),
                    body: JSON.stringify(requestBody),
                },
            {
                attempts: isOpenAiGptImageModel(selectedModel) ? 1 : undefined,
                label: 'generate-image',
                timeoutMs,
            },
        );
    } catch (error: unknown) {
        console.error('[generate-image] Upstream fetch failed after retries:', getErrorMessage(error));
        throw createUpstreamConnectionError(baseUrl, error, { timeoutMs });
    }

    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};

    if (!response.ok) {
        console.error('[generate-image] API error:', data);
        throw new Error(translateImageApiError(getApiErrorMessage(data, JSON.stringify(data))));
    }

    debugLog('[generate-image] Response:', JSON.stringify(data).substring(0, 300));
    return data;
}

function estimateBase64Bytes(value: string): number {
    const normalized = value.trim();
    if (!normalized) return 0;

    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.floor((normalized.length * 3) / 4) - padding;
}

function extractDefaultImageTaskId(data: Record<string, unknown>): string | null {
    return extractImageTaskId(data);
}

function extractVApiImageTaskId(data: Record<string, unknown>): string | null {
    return extractImageTaskId(data);
}

function extractImageTaskId(data: Record<string, unknown>): string | null {
    const rawTaskId = getNestedValue(data, 'data', 'task_id')
        || getNestedValue(data, 'task_id')
        || getNestedValue(data, 'data', 'taskId')
        || getNestedValue(data, 'taskId')
        || getNestedValue(data, 'data', 'id')
        || getNestedValue(data, 'id');

    return typeof rawTaskId === 'string' && rawTaskId.trim().length > 0 ? rawTaskId.trim() : null;
}

async function submitVApiImageGeneration(params: {
    apiKey: string;
    baseUrl: string;
    selectedModel: string;
    prompt: string;
    aspectRatio: unknown;
    imageSize: unknown;
    quality: unknown;
    generateCount: unknown;
    normalizedImages: NormalizedReferenceImage[];
}) {
    if (!isVApiImageModel(params.selectedModel)) {
        throw new ApiRouteError('V-API 暂不支持该图片模型', 400);
    }

    const hasReferenceImages = params.normalizedImages.length > 0;
    const targetUrl = `${params.baseUrl}${hasReferenceImages ? '/v1/images/edits' : '/v1/images/generations'}`;
    const requestBody = buildVApiImageGenerationBody(params);
    const init: RequestInit = hasReferenceImages
        ? {
            method: 'POST',
            headers: createAiHeaders(params.apiKey),
            body: buildVApiImageEditsFormData(requestBody, params.normalizedImages),
        }
        : {
            method: 'POST',
            headers: createAiHeaders(params.apiKey, true),
            body: JSON.stringify(requestBody),
        };

    const localTaskId = createVApiLocalImageJob(async () => {
        const data = await fetchVApiImageGenerationData({
            targetUrl,
            init,
            baseUrl: params.baseUrl,
            selectedModel: params.selectedModel,
            hasReferenceImages,
        });

        return {
            data,
            upstreamTaskId: hasExtractableImageResult(data) ? null : extractVApiImageTaskId(data),
        };
    });

    return NextResponse.json({ taskId: localTaskId, status: 'pending' });
}

async function fetchVApiImageGenerationData(params: {
    targetUrl: string;
    init: RequestInit;
    baseUrl: string;
    selectedModel: string;
    hasReferenceImages: boolean;
}): Promise<Record<string, unknown>> {
    const { targetUrl, init, baseUrl, selectedModel, hasReferenceImages } = params;
    const timeoutMs = isOpenAiGptImageModel(selectedModel) || hasReferenceImages
        ? AI_UPSTREAM_TIMEOUT_MS.slowImageSubmit
        : AI_UPSTREAM_TIMEOUT_MS.submit;

    let response: Response;
    try {
        response = await fetchWithRetry(
            targetUrl,
            init,
            {
                attempts: isOpenAiGptImageModel(selectedModel) ? 1 : undefined,
                label: 'generate-image:vapi',
                timeoutMs,
            },
        );
    } catch (error: unknown) {
        console.error('[generate-image][vapi] Upstream fetch failed after retries:', getErrorMessage(error));
        throw createUpstreamConnectionError(baseUrl, error, { timeoutMs });
    }

    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};
    if (!response.ok) {
        console.error('[generate-image][vapi] API error:', data);
        throw new Error(translateImageApiError(getApiErrorMessage(data, JSON.stringify(data))));
    }

    return data;
}

function buildVApiImageGenerationBody(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio: unknown;
    imageSize: unknown;
    quality: unknown;
    generateCount: unknown;
    normalizedImages?: NormalizedReferenceImage[];
}): Record<string, unknown> {
    const normalizedCount = normalizeVApiImageGenerateCount(params.generateCount);

    if (isVApiGeminiImageModel(params.selectedModel)) {
        const body: Record<string, unknown> = {
            model: params.selectedModel,
            prompt: params.prompt.trim(),
            response_format: 'url',
            size: resolveVApiGeminiImageSize(params.imageSize),
        };

        if (typeof params.aspectRatio === 'string' && params.aspectRatio.trim() && params.aspectRatio !== 'auto') {
            body.aspect_ratio = params.aspectRatio.trim();
        }

        if (normalizedCount && normalizedCount > 1) {
            body.n = normalizedCount;
        }

        return body;
    }

    return buildUpstreamImageGenerationBody({
        model: params.selectedModel,
        prompt: params.prompt,
        aspectRatio: typeof params.aspectRatio === 'string' ? params.aspectRatio : undefined,
        imageSize: typeof params.imageSize === 'string' ? params.imageSize : undefined,
        quality: typeof params.quality === 'string' ? params.quality : undefined,
        generateCount: normalizedCount,
        referenceImages: params.normalizedImages?.map((image) => image.base64),
        responseFormat: 'url',
    });
}

function buildVApiImageEditsFormData(
    body: Record<string, unknown>,
    referenceImages: NormalizedReferenceImage[],
): FormData {
    const formData = new FormData();

    appendFormDataString(formData, 'model', body.model);
    appendFormDataString(formData, 'prompt', body.prompt);
    appendFormDataString(formData, 'size', body.size);
    appendFormDataString(formData, 'quality', body.quality);
    appendFormDataString(formData, 'response_format', body.response_format);
    appendFormDataString(formData, 'aspect_ratio', body.aspect_ratio);
    if (typeof body.n === 'number') {
        formData.append('n', String(body.n));
    }

    referenceImages.forEach((image, index) => {
        const buffer = Buffer.from(image.base64, 'base64');
        const blob = new Blob([buffer], { type: image.mime || 'image/png' });
        formData.append('image', blob, `reference-${index + 1}${getImageExtensionFromMime(image.mime)}`);
    });

    return formData;
}

function normalizeVApiImageGenerateCount(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined;
    }

    const normalized = Math.trunc(value);
    return normalized >= 1 && normalized <= 10 ? normalized : undefined;
}

function buildGptImageEditsFormData(
    body: Record<string, unknown>,
    referenceImages: NormalizedReferenceImage[],
): FormData {
    const formData = new FormData();

    appendFormDataString(formData, 'model', body.model);
    appendFormDataString(formData, 'prompt', body.prompt);
    appendFormDataString(formData, 'size', body.size);
    appendFormDataString(formData, 'quality', body.quality);
    appendFormDataString(formData, 'response_format', body.response_format);

    referenceImages.forEach((image, index) => {
        const buffer = Buffer.from(image.base64, 'base64');
        const blob = new Blob([buffer], { type: image.mime || 'image/png' });
        formData.append('image', blob, `reference-${index + 1}${getImageExtensionFromMime(image.mime)}`);
    });

    return formData;
}

async function submitJieKouImageGeneration(params: {
    apiKey: string;
    baseUrl: string;
    selectedModel: string;
    prompt: string;
    aspectRatio: unknown;
    imageSize: unknown;
    quality: unknown;
    generateCount: unknown;
    normalizedImages: NormalizedReferenceImage[];
}) {
    const {
        apiKey,
        baseUrl,
        selectedModel,
        prompt,
        aspectRatio,
        imageSize,
        quality,
        generateCount,
        normalizedImages,
    } = params;
    const { path, body } = buildJieKouImageRequest({
        selectedModel,
        prompt,
        aspectRatio,
        imageSize,
        quality,
        generateCount,
        normalizedImages,
    });
    const targetUrl = `${baseUrl}${path}`;

    const localTaskId = createJieKouLocalImageJob(async () => {
        const data = await fetchJieKouImageGenerationData({
            targetUrl,
            apiKey,
            baseUrl,
            requestBody: body,
        });
        const rawTaskId = extractJieKouImageTaskId(data);

        return {
            data,
            upstreamTaskId: hasExtractableImageResult(data) ? null : rawTaskId,
        };
    });

    return NextResponse.json({ taskId: localTaskId, status: 'pending' });
}

async function fetchJieKouImageGenerationData(params: {
    targetUrl: string;
    apiKey: string;
    baseUrl: string;
    requestBody: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
    const { targetUrl, apiKey, baseUrl, requestBody } = params;
    let response: Response;

    try {
        response = await fetchWithRetry(
            targetUrl,
            {
                method: 'POST',
                headers: createAiHeaders(apiKey, true),
                body: JSON.stringify(requestBody),
            },
            {
                attempts: 1,
                label: 'generate-image:jiekou',
                timeoutMs: AI_UPSTREAM_TIMEOUT_MS.slowImageSubmit,
            },
        );
    } catch (error: unknown) {
        console.error('[generate-image][jiekou] Upstream fetch failed after retries:', getErrorMessage(error));
        throw createUpstreamConnectionError(baseUrl, error, { timeoutMs: AI_UPSTREAM_TIMEOUT_MS.slowImageSubmit });
    }

    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};
    if (!response.ok) {
        console.error('[generate-image][jiekou] API error:', data);
        throw new Error(translateImageApiError(getApiErrorMessage(data, JSON.stringify(data))));
    }

    return data;
}

function extractJieKouImageTaskId(data: Record<string, unknown>): string | null {
    const rawTaskId = getNestedValue(data, 'data', 'task_id')
        || getNestedValue(data, 'task_id')
        || getNestedValue(data, 'data', 'taskId')
        || getNestedValue(data, 'taskId')
        || getNestedValue(data, 'id');

    return typeof rawTaskId === 'string' && rawTaskId.trim().length > 0
        ? encodeJieKouImageTaskId(rawTaskId)
        : null;
}

function buildJieKouImageRequest(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio: unknown;
    imageSize: unknown;
    quality: unknown;
    generateCount: unknown;
    normalizedImages: NormalizedReferenceImage[];
}): { path: string; body: Record<string, unknown> } {
    const { selectedModel, prompt, aspectRatio, imageSize, quality, generateCount, normalizedImages } = params;
    const referenceImageBase64s = normalizedImages.map((image) => image.base64);
    const hasReferenceImages = referenceImageBase64s.length > 0;
    const normalizedPrompt = prompt.trim();
    const normalizedCount = generateCount === 2 || generateCount === 3 || generateCount === 4 ? generateCount : 1;

    if (isJieKouGeminiImageModel(selectedModel)) {
        const body: Record<string, unknown> = {
            prompt: normalizedPrompt,
            size: resolveJieKouStandardImageSize(imageSize),
            aspect_ratio: resolveJieKouImageAspectRatio(aspectRatio),
            output_format: 'image/png',
        };

        if (hasReferenceImages) {
            body.image_base64s = referenceImageBase64s;
        }

        return {
            path: hasReferenceImages ? '/v3/gemini-3-pro-image-edit' : '/v3/gemini-3-pro-image-text-to-image',
            body,
        };
    }

    if (isJieKouNanoBananaImageModel(selectedModel)) {
        const body: Record<string, unknown> = {
            prompt: normalizedPrompt,
            size: resolveJieKouNanoBananaSize(aspectRatio),
            quality: resolveJieKouNanoBananaQuality(imageSize),
            response_format: 'url',
        };

        if (hasReferenceImages) {
            body.image = referenceImageBase64s.length === 1 ? referenceImageBase64s[0] : referenceImageBase64s;
        }

        return {
            path: hasReferenceImages ? '/v3/nano-banana-2-i2i' : '/v3/nano-banana-2-t2i',
            body,
        };
    }

    if (isJieKouGptImageModel(selectedModel)) {
        const body: Record<string, unknown> = {
            prompt: normalizedPrompt,
            n: normalizedCount,
            size: resolveJieKouGptImageSize(imageSize, aspectRatio),
            quality: resolveJieKouGptImageQuality(quality),
            background: 'auto',
            output_format: 'png',
        };

        if (hasReferenceImages) {
            body.image = referenceImageBase64s.length === 1 ? referenceImageBase64s[0] : referenceImageBase64s;
        }

        return {
            path: hasReferenceImages ? '/v3/gpt-image-2-edit' : '/v3/gpt-image-2-text-to-image',
            body,
        };
    }

    throw new ApiRouteError('JieKou AI 暂不支持该图片模型', 400);
}

async function submitMagicApiImageGeneration(params: {
    apiKey: string;
    baseUrl: string;
    selectedModel: string;
    prompt: string;
    aspectRatio: unknown;
    imageSize: unknown;
    normalizedImages: NormalizedReferenceImage[];
}) {
    const {
        apiKey,
        baseUrl,
        selectedModel,
        prompt,
        aspectRatio,
        imageSize,
        normalizedImages,
    } = params;
    const isGeminiNative = isGeminiNativeImageModel(selectedModel);
    const targetUrl = isGeminiNative
        ? `${baseUrl}/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`
        : `${baseUrl}/v1/images/generations`;
    const requestBody = isGeminiNative
        ? buildMagicApiGeminiImageBody({ selectedModel, prompt, aspectRatio, imageSize, normalizedImages })
        : buildMagicApiOpenAiStyleImageBody({
            selectedModel,
            prompt,
            aspectRatio,
            imageSize,
            normalizedImages,
        });
    const submitTimeoutMs = isOpenAiGptImageModel(selectedModel)
        ? AI_UPSTREAM_TIMEOUT_MS.slowImageSubmit
        : AI_UPSTREAM_TIMEOUT_MS.submit;

    const localTaskId = createMagicApiLocalImageJob(async () => {
        const data = await fetchMagicApiImageGenerationData({
            targetUrl,
            apiKey,
            baseUrl,
            requestBody,
            timeoutMs: submitTimeoutMs,
            attempts: isOpenAiGptImageModel(selectedModel) ? 1 : undefined,
        });
        const normalizedData = normalizeMagicApiLocalImageResultData(data, isGeminiNative);

        return {
            data: normalizedData,
            upstreamTaskId: hasExtractableImageResult(normalizedData) ? null : extractMagicApiImageTaskId(normalizedData),
        };
    });

    return NextResponse.json({ taskId: localTaskId, status: 'pending' });
}

async function fetchMagicApiImageGenerationData(params: {
    targetUrl: string;
    apiKey: string;
    baseUrl: string;
    requestBody: Record<string, unknown>;
    timeoutMs?: number;
    attempts?: number;
}): Promise<Record<string, unknown>> {
    const { targetUrl, apiKey, baseUrl, requestBody, timeoutMs, attempts } = params;
    let response: Response;

    try {
        response = await fetchWithRetry(
            targetUrl,
            {
                method: 'POST',
                headers: createAiHeaders(apiKey, true),
                body: JSON.stringify(requestBody),
            },
            {
                attempts,
                label: 'generate-image:magicapi',
                timeoutMs,
            },
        );
    } catch (error: unknown) {
        console.error('[generate-image][magicapi] Upstream fetch failed after retries:', getErrorMessage(error));
        throw createUpstreamConnectionError(baseUrl, error, { timeoutMs });
    }

    const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};
    if (!response.ok) {
        console.error('[generate-image][magicapi] API error:', data);
        throw new Error(translateImageApiError(getApiErrorMessage(data, JSON.stringify(data))));
    }

    return data;
}

function extractMagicApiImageTaskId(data: Record<string, unknown>): string | null {
    const rawTaskId = getNestedValue(data, 'data', 'task_id')
        || getNestedValue(data, 'task_id')
        || getNestedValue(data, 'data', 'taskId')
        || getNestedValue(data, 'taskId')
        || getNestedValue(data, 'data', 'id')
        || getNestedValue(data, 'id');

    return typeof rawTaskId === 'string' && rawTaskId.trim().length > 0 ? rawTaskId.trim() : null;
}

function hasExtractableImageResult(data: Record<string, unknown>): boolean {
    const result = extractImageResult(data);
    return !!result.imageUrl || !!result.imageData || result.images.length > 0;
}

function normalizeMagicApiLocalImageResultData(data: Record<string, unknown>, isGeminiNative: boolean): Record<string, unknown> {
    if (!isGeminiNative) {
        return data;
    }

    const result = mergeImageResults(extractGeminiNativeImageResult(data), extractImageResult(data));
    if (!result.imageUrl && !result.imageData && result.images.length === 0) {
        return data;
    }

    return {
        ...data,
        ...(result.imageUrl ? { image_url: result.imageUrl } : {}),
        ...(result.imageData ? { image_base64: result.imageData } : {}),
        ...(result.images.length > 0 ? { images: result.images } : {}),
    };
}

function buildMagicApiGeminiImageBody(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio: unknown;
    imageSize: unknown;
    normalizedImages: NormalizedReferenceImage[];
}) {
    const { selectedModel, prompt, aspectRatio, imageSize, normalizedImages } = params;
    const parts: Array<Record<string, unknown>> = normalizedImages.map((image) => ({
        inlineData: {
            mimeType: image.mime || 'image/png',
            data: image.base64,
        },
    }));
    parts.push({ text: prompt });

    const generationConfig: Record<string, unknown> = {
        responseModalities: ['IMAGE', 'TEXT'],
        temperature: 1.0,
        topP: 0.95,
        maxOutputTokens: 8192,
    };
    const imageConfig: Record<string, unknown> = {};
    if (typeof aspectRatio === 'string' && aspectRatio && aspectRatio !== 'auto') {
        imageConfig.aspectRatio = aspectRatio;
    }
    imageConfig.imageSize = resolveMagicApiGeminiImageSize(selectedModel, imageSize);
    generationConfig.imageConfig = imageConfig;

    return {
        contents: [
            {
                role: 'user',
                parts,
            },
        ],
        generationConfig,
    };
}

function buildMagicApiOpenAiStyleImageBody(params: {
    selectedModel: string;
    prompt: string;
    aspectRatio: unknown;
    imageSize: unknown;
    normalizedImages: NormalizedReferenceImage[];
}) {
    const { selectedModel, prompt, aspectRatio, imageSize, normalizedImages } = params;
    const targetSize = resolveMagicApiOpenAiStyleImageSize(selectedModel, aspectRatio, imageSize);
    const body: Record<string, unknown> = {
        model: selectedModel,
        prompt: prompt.trim(),
        n: 1,
        size: targetSize,
    };

    if (isOpenAiGptImageModel(selectedModel)) {
        body.quality = 'high';
        body.response_format = 'url';
        if (!isMagicApiGptImageOfficialSize(selectedModel, targetSize)) {
            const ratioHint = typeof aspectRatio === 'string' && aspectRatio && aspectRatio !== 'auto'
                ? aspectRatio.split('(')[0]
                : describeOpenAiGptImageAspectRatio(targetSize, aspectRatio);
            body.prompt = `${prompt.trimEnd()}, 图片比例${ratioHint}`;
        }
    }

    if (normalizedImages.length > 0) {
        body.image = normalizedImages.map((image) => image.base64);
    }

    return body;
}

function extractGeminiNativeImageResult(payload: unknown): ImageResultShape {
    const imageUrls: string[] = [];
    let imageData: string | null = null;
    const pushImageUrl = (value: string) => {
        const normalized = value.trim();
        if (normalized && !imageUrls.includes(normalized)) {
            imageUrls.push(normalized);
        }
    };

    const scanTextPart = (text: string) => {
        const dataUriMatch = text.match(/data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/);
        if (dataUriMatch && !imageData) {
            imageData = `data:${dataUriMatch[1]};base64,${dataUriMatch[2]}`;
        }

        const markdownImagePattern = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
        for (const match of text.matchAll(markdownImagePattern)) {
            pushImageUrl(match[1]);
        }

        const plainImageUrlPattern = /https?:\/\/[^\s)]+\.(?:png|jpe?g|jpe|webp|gif)(?:\?[^\s)]*)?/gi;
        for (const match of text.matchAll(plainImageUrlPattern)) {
            pushImageUrl(match[0]);
        }
    };

    const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') {
            return;
        }

        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }

        const record = value as Record<string, unknown>;
        if (typeof record.text === 'string') {
            scanTextPart(record.text);
        }

        const inlineData = record.inlineData || record.inline_data;
        if (inlineData && typeof inlineData === 'object') {
            const inlineRecord = inlineData as Record<string, unknown>;
            const data = typeof inlineRecord.data === 'string' ? inlineRecord.data : '';
            if (data) {
                if (data.startsWith('http://') || data.startsWith('https://')) {
                    pushImageUrl(data);
                    return;
                }

                const mime = typeof inlineRecord.mimeType === 'string'
                    ? inlineRecord.mimeType
                    : typeof inlineRecord.mime_type === 'string'
                        ? inlineRecord.mime_type
                        : 'image/png';
                imageData = imageData || (data.startsWith('data:image/') ? data : `data:${mime};base64,${data}`);
            }
        }

        const fileData = record.fileData || record.file_data;
        if (fileData && typeof fileData === 'object') {
            const fileRecord = fileData as Record<string, unknown>;
            const fileUri = typeof fileRecord.fileUri === 'string'
                ? fileRecord.fileUri
                : typeof fileRecord.file_uri === 'string'
                    ? fileRecord.file_uri
                    : '';
            if (fileUri) {
                pushImageUrl(fileUri);
            }
        }

        Object.values(record).forEach(visit);
    };

    visit(payload);

    return {
        imageUrl: imageUrls[0] || null,
        imageData,
        images: imageUrls,
    };
}

function mergeImageResults(primary: ImageResultShape, fallback: ImageResultShape): ImageResultShape {
    const images = [...primary.images];
    for (const image of fallback.images) {
        if (!images.includes(image)) {
            images.push(image);
        }
    }

    return {
        imageUrl: primary.imageUrl || fallback.imageUrl,
        imageData: primary.imageData || fallback.imageData,
        images,
    };
}

function translateImageApiError(rawMsg: string): string {
    if (rawMsg.includes('could not generate an image')) {
        return '模型无法根据该提示词生成图片，请尝试更换提示词或参考图。';
    }
    if (rawMsg.includes('safety') || rawMsg.includes('blocked')) {
        return '内容被安全策略拦截，请修改提示词后重试。';
    }
    if (rawMsg.includes('rate limit') || rawMsg.includes('too many')) {
        return 'API 请求过于频繁，请稍后再试。';
    }
    if (rawMsg.includes('quota') || rawMsg.includes('insufficient')) {
        return 'API 额度不足，请检查账户余额。';
    }
    return rawMsg;
}

function appendFormDataString(formData: FormData, key: string, value: unknown) {
    if (typeof value === 'string' && value.trim().length > 0) {
        formData.append(key, value);
    }
}

function getImageExtensionFromMime(mime: string): string {
    const normalizedMime = mime.toLowerCase();
    if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') {
        return '.jpg';
    }

    if (normalizedMime === 'image/webp') {
        return '.webp';
    }

    if (normalizedMime === 'image/gif') {
        return '.gif';
    }

    return '.png';
}

