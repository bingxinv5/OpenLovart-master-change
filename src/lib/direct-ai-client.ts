/**
 * direct-ai-client.ts — 浏览器端直连 AI API 的传输层
 *
 * 绕过 Next.js 服务端（NAS），直接从员工浏览器发送请求到 AI API。
 * 如果因 CORS 等原因失败，返回 null 让调用方回退到服务端代理。
 *
 * 从 api-settings.ts 拆出，使 api-settings 专注于平台配置存取，
 * 本模块专注于请求 / 响应 / 错误翻译。
 */

import { getApiSettings, getEffectiveApiBaseUrl } from './api-settings';

// ── Config resolution (client-side) ──────────────────────────

export function getAiServiceConfig(): { baseUrl: string; apiKey: string } {
    const settings = getApiSettings();
    return {
        baseUrl: getEffectiveApiBaseUrl(settings),
        apiKey: settings.apiKey,
    };
}

// ── Direct generate request ──────────────────────────────────

export async function directGenerateImage(
    requestBody: Record<string, unknown>,
    timeout: number = 30_000,
): Promise<Record<string, unknown> | null> {
    const { baseUrl, apiKey } = getAiServiceConfig();
    if (!apiKey) return null;

    const targetUrl = `${baseUrl}/v1/images/generations`;

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(timeout),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const errorMsg = extractApiError(data as Record<string, unknown>);
            throw new Error(errorMsg);
        }

        return normalizeGenerateResponse(data as Record<string, unknown>);
    } catch (err) {
        if (err instanceof TypeError) {
            console.warn('[directGenerateImage] Browser direct failed (network/CORS), will fallback to server proxy:', err.message);
            return null;
        }
        if (isRecoverableDirectError(err)) {
            console.warn('[directGenerateImage] Browser direct timed out/aborted, will fallback to server proxy');
            return null;
        }
        throw err;
    }
}

// ── Error classification / translation ───────────────────────

function isRecoverableDirectError(err: unknown): boolean {
    if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        return true;
    }

    if (err instanceof Error) {
        const lower = `${err.name} ${err.message}`.toLowerCase();
        return lower.includes('signal timed out')
            || lower.includes('timeouterror')
            || lower.includes('aborterror')
            || lower.includes('timed out');
    }

    return false;
}

function extractApiError(data: Record<string, unknown>): string {
    if (data.error && typeof data.error === 'object') {
        const nested = (data.error as Record<string, unknown>).message;
        if (typeof nested === 'string') return translateApiError(nested);
    }
    if (typeof data.message === 'string') return translateApiError(data.message);
    if (typeof data.error === 'string') return translateApiError(data.error);
    return '图片生成失败';
}

function translateApiError(msg: string): string {
    if (msg.includes('could not generate an image')) {
        return '模型无法根据该提示词生成图片，请尝试更换提示词或参考图。';
    }
    if (msg.includes('safety') || msg.includes('blocked')) {
        return '内容被安全策略拦截，请修改提示词后重试。';
    }
    if (msg.includes('rate limit') || msg.includes('too many')) {
        return 'API 请求过于频繁，请稍后再试。';
    }
    if (msg.includes('quota') || msg.includes('insufficient')) {
        return 'API 额度不足，请检查账户余额。';
    }
    return msg;
}

// ── Response normalization ───────────────────────────────────

function normalizeGenerateResponse(raw: Record<string, unknown>): Record<string, unknown> {
    const rawTaskId = getNestedProp(raw, 'data', 'task_id')
        ?? getNestedProp(raw, 'task_id')
        ?? getNestedProp(raw, 'data', 'taskId')
        ?? getNestedProp(raw, 'taskId');
    const taskId = typeof rawTaskId === 'string' && rawTaskId.length > 0 ? rawTaskId : null;

    const nestedImages = getNestedProp(raw, 'data', 'data');
    const topLevelImages = getNestedProp(raw, 'data');
    const images = Array.isArray(nestedImages)
        ? nestedImages
        : Array.isArray(topLevelImages)
            ? topLevelImages
            : [];

    if (images.length > 0) {
        const imageUrls = images
            .map((item) => (item as Record<string, unknown> | undefined)?.url)
            .filter((value): value is string => typeof value === 'string' && value.length > 0);
        const first = images[0] as Record<string, unknown> | undefined;
        if (first?.url && typeof first.url === 'string') {
            return { status: 'completed', taskId, imageUrl: first.url, images: imageUrls };
        }
        if (first?.b64_json && typeof first.b64_json === 'string') {
            return { status: 'completed', taskId, imageData: `data:image/png;base64,${first.b64_json}`, images: imageUrls };
        }
    }

    if (taskId) {
        return { taskId, status: 'pending' };
    }

    return { taskId: null, status: 'unknown', raw };
}

function getNestedProp(obj: Record<string, unknown>, ...path: string[]): unknown {
    let current: unknown = obj;
    for (const key of path) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}
