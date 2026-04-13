import { NextRequest, NextResponse } from 'next/server';
import { extractDataUrlBase64, isDataUrl } from '@/lib/data-url';
import { fetchRemoteAsset, RemoteFetchError } from '../_shared/cdn-cache';
import {
    AI_UPSTREAM_TIMEOUT_MS,
    createUpstreamConnectionError,
    extractImageResult,
    getNestedValue,
    createAiHeaders,
    fetchWithRetry,
    getApiErrorMessage,
    getErrorMessage,
    handleApiRouteError,
    parseJsonResponse,
    proxyImageResultUrls,
    resolveRequestOrigin,
    resolveAiServiceConfig,
} from '../_shared/ai-service';
import {
    buildUpstreamImageGenerationBody,
    getMaxReferenceImagesForImageModel,
} from '@/lib/image-generation-models';

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
    try {
        const { prompt, model, aspectRatio, imageSize, generateCount, referenceImages, referenceImage, forceAsync } = await request.json();

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ error: '请输入提示词' }, { status: 400 });
        }

        const { apiKey, baseUrl } = resolveAiServiceConfig(request);

        const selectedModel = model || 'gemini-3.1-flash-image-preview';
        const maxReferenceImageCount = getMaxReferenceImagesForImageModel(selectedModel);

        // Reference images (array of base64 or URL strings)
        const imgList: string[] = referenceImages || (referenceImage ? [referenceImage] : []);
        const cleanImages: string[] = [];
        if (imgList.length > 0) {
            if (imgList.length > maxReferenceImageCount) {
                return NextResponse.json({ error: `当前模型的参考图数量不能超过 ${maxReferenceImageCount} 张` }, { status: 400 });
            }

            for (const img of imgList) {
                let cleanData = img;
                if (img.startsWith('http://') || img.startsWith('https://')) {
                    console.log(`[generate-image] Fetching reference image from URL: ${img.substring(0, 100)}...`);
                    try {
                        const { buffer } = await fetchRemoteAsset(img, {
                            timeoutMs: 20_000,
                            maxBytes: MAX_REFERENCE_IMAGE_BYTES,
                            allowedContentTypePrefixes: ['image/'],
                        });
                        cleanData = buffer.toString('base64');
                    } catch (fetchErr: unknown) {
                        console.error('[generate-image] Failed to fetch reference image:', fetchErr);
                        return NextResponse.json(
                            { error: '参考图下载失败', details: getErrorMessage(fetchErr) },
                            { status: fetchErr instanceof RemoteFetchError ? fetchErr.status : 400 }
                        );
                    }
                } else if (isDataUrl(img)) {
                    cleanData = extractDataUrlBase64(img);
                }

                if (estimateBase64Bytes(cleanData) > MAX_REFERENCE_IMAGE_BYTES) {
                    return NextResponse.json(
                        { error: `参考图大小不能超过 ${(MAX_REFERENCE_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB` },
                        { status: 413 },
                    );
                }

                cleanImages.push(cleanData);
            }
        }

        const body = buildUpstreamImageGenerationBody({
            model: selectedModel,
            prompt,
            aspectRatio,
            imageSize,
            generateCount: typeof generateCount === 'number' ? generateCount : undefined,
            referenceImages: cleanImages,
            responseFormat: 'url',
        });

        console.log(`[generate-image] model=${selectedModel}, baseUrl=${baseUrl}, prompt="${prompt.substring(0, 50)}..."`);

        const targetUrl = `${baseUrl}/v1/images/generations${forceAsync === true ? '?async=true' : ''}`;
        let response: Response;

        try {
            response = await fetchWithRetry(
                targetUrl,
                {
                    method: 'POST',
                    headers: createAiHeaders(apiKey, true),
                    body: JSON.stringify(body),
                },
                { label: 'generate-image', timeoutMs: AI_UPSTREAM_TIMEOUT_MS.submit },
            );
        } catch (error: unknown) {
            console.error('[generate-image] Upstream fetch failed after retries:', getErrorMessage(error));
            throw createUpstreamConnectionError(baseUrl, error);
        }

        const data = (await parseJsonResponse<Record<string, unknown>>(response)) ?? {};

        if (!response.ok) {
            console.error('[generate-image] API error:', data);
            const rawMsg = getApiErrorMessage(data, JSON.stringify(data));
            // Translate common API error messages to Chinese
            let errorMsg = rawMsg;
            if (rawMsg.includes('could not generate an image')) {
                errorMsg = '模型无法根据该提示词生成图片，请尝试更换提示词或参考图。';
            } else if (rawMsg.includes('safety') || rawMsg.includes('blocked')) {
                errorMsg = '内容被安全策略拦截，请修改提示词后重试。';
            } else if (rawMsg.includes('rate limit') || rawMsg.includes('too many')) {
                errorMsg = 'API 请求过于频繁，请稍后再试。';
            } else if (rawMsg.includes('quota') || rawMsg.includes('insufficient')) {
                errorMsg = 'API 额度不足，请检查账户余额。';
            }
            throw new Error(errorMsg);
        }

        console.log('[generate-image] Response:', JSON.stringify(data).substring(0, 300));

        // The API may return task_id either at the root level or under data.task_id
        const taskId = getNestedValue(data, 'data', 'task_id') || getNestedValue(data, 'task_id');
        if (typeof taskId === 'string' && taskId.length > 0) {
            return NextResponse.json({ taskId, status: 'pending' });
        }

        // Some models may return results directly
        const imageResult = proxyImageResultUrls(extractImageResult(data), resolveRequestOrigin(request.headers, request.nextUrl.origin), {
            filenamePrefix: 'lovart-generate-image',
        });
        if (imageResult.imageUrl) {
            return NextResponse.json({ status: 'completed', imageUrl: imageResult.imageUrl, images: imageResult.images });
        }
        if (imageResult.imageData) {
            return NextResponse.json({ status: 'completed', imageData: imageResult.imageData, images: imageResult.images });
        }

        return NextResponse.json({ taskId: null, status: 'unknown', raw: data });

    } catch (error: unknown) {
        return handleApiRouteError(error, '图片生成失败', 'generate-image');
    }
}

function estimateBase64Bytes(value: string): number {
    const normalized = value.trim();
    if (!normalized) return 0;

    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.floor((normalized.length * 3) / 4) - padding;
}

