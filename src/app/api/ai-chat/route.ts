import { NextRequest } from 'next/server';
import { normalizeDataUrlToBase64 } from '@/lib/data-url';
import { isJieKouProvider } from '@/lib/ai-providers';
import {
    createUpstreamConnectionError,
    createAiHeaders,
    fetchWithRetry,
    getApiErrorMessage,
    handleApiRouteError,
    parseJsonResponse,
    resolveAiServiceConfig,
} from '../_shared/ai-service';

export async function POST(request: NextRequest) {
    try {
        const { messages, model, stream, skipSystemMessage } = await request.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return Response.json({ error: '请提供聊天消息' }, { status: 400 });
        }

        const { providerId, apiKey, baseUrl } = resolveAiServiceConfig(request);

        const selectedModel = model || 'gemini-3.1-pro-preview';
        const useStream = stream !== false; // default to streaming

        // Build the system message for design assistant
        const systemMessage = {
            role: 'system',
            content: `你是一位专业的AI设计师助手，名叫"AI设计师"。你精通平面设计、品牌设计、UI/UX设计、插画、排版等设计领域。

你的职责：
1. 理解用户的设计需求，提供专业的设计方案和建议
2. 为用户提供配色方案、字体选择、布局建议等
3. 帮助用户完善设计概念，提出创意灵感
4. 可以生成详细的设计规范说明
5. 用中文回复，语言风格友好专业

回复格式要求：
- 使用清晰的结构化格式
- 适当使用 emoji 增加可读性
- 给出具体可执行的设计建议`
        };

        // Prepend system message if not already present
        // Skip system message for image generation models (they don't need it)
        const apiMessages = skipSystemMessage || messages[0]?.role === 'system'
            ? messages
            : [systemMessage, ...messages];

        // Normalize image_url in multipart messages for upstream compatibility.
        // Some AI proxy services (e.g. bltcy.ai) fail to parse data URLs and expect
        // a separate base64 field or raw base64 in the url field.
        for (const msg of apiMessages) {
            if (Array.isArray(msg.content)) {
                // Filter out unresolved imgref:// references that should never reach the API
                msg.content = msg.content.filter((part: { type?: string; image_url?: { url?: string } }) => {
                    if (part.type === 'image_url' && part.image_url?.url?.startsWith('imgref://')) {
                        console.warn('[ai-chat] Dropping unresolved imgref:// attachment');
                        return false;
                    }
                    return true;
                });
                for (const part of msg.content) {
                    if (part.type === 'image_url' && part.image_url?.url) {
                        const url: string = part.image_url.url;
                        if (url.startsWith('data:')) {
                            part.image_url = {
                                url: normalizeDataUrlToBase64(url),
                                detail: 'auto',
                            };
                        } else if (url && !url.startsWith('http') && !url.startsWith('data:')) {
                            // Raw base64 without any prefix — wrap it as proper data URL
                            part.image_url = {
                                url: `data:image/png;base64,${url}`,
                                detail: 'auto',
                            };
                        }
                    }
                }
            }
        }

        const body = {
            model: selectedModel,
            messages: apiMessages,
            stream: useStream,
            temperature: 0.7,
            max_tokens: 4096,
        };

        console.log(`[ai-chat] model=${selectedModel}, messages=${apiMessages.length}, stream=${useStream}`);

        const targetUrl = isJieKouProvider(providerId)
            ? `${baseUrl}/openai/v1/chat/completions`
            : `${baseUrl}/v1/chat/completions`;
        let response: Response;

        try {
            response = await fetchWithRetry(
                targetUrl,
                {
                    method: 'POST',
                    headers: createAiHeaders(apiKey, true),
                    body: JSON.stringify(body),
                },
                { label: 'ai-chat' },
            );
        } catch (error: unknown) {
            console.error('[ai-chat] Upstream fetch failed after retries:', error);
            throw createUpstreamConnectionError(baseUrl, error);
        }

        if (!response.ok) {
            const errorData = await parseJsonResponse(response);
            console.error('[ai-chat] API error:', errorData);
            const errorMsg = getApiErrorMessage(errorData, `API 错误 (${response.status})`);
            return Response.json({ error: errorMsg }, { status: response.status });
        }

        // Streaming response
        if (useStream) {
            const encoder = new TextEncoder();

            const readableStream = new ReadableStream({
                async start(controller) {
                    const reader = response.body?.getReader();
                    if (!reader) {
                        controller.close();
                        return;
                    }

                    const decoder = new TextDecoder();
                    let buffer = '';

                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });

                            // Process SSE lines
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                                const data = trimmed.slice(6);
                                if (data === '[DONE]') {
                                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                                    continue;
                                }

                                try {
                                    const parsed = JSON.parse(data);
                                    const content = parsed.choices?.[0]?.delta?.content;
                                    if (content) {
                                        // Forward the SSE event
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                                    }
                                } catch {
                                    // Skip malformed JSON
                                }
                            }
                        }
                    } catch (error) {
                        console.error('[ai-chat] Stream error:', error);
                    } finally {
                        controller.close();
                        reader.releaseLock();
                    }
                },
            });

            return new Response(readableStream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            });
        }

        // Non-streaming response
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';

        return Response.json({
            content,
            model: selectedModel,
            usage: data?.usage,
        });

    } catch (error: unknown) {
        return handleApiRouteError(error, 'AI 聊天失败', 'ai-chat');
    }
}
