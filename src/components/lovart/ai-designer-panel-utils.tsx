/**
 * AI Designer panel utilities — barrel module.
 *
 * Re-exports from focused sub-modules for backward compatibility.
 * New code should import directly from:
 *   - ai-designer-command-utils   (intent detection, tool prefix)
 *   - ai-designer-message-utils   (rendering, formatting, URL extraction)
 *   - ai-designer-panel-storage   (session persistence & normalization)
 */

import { extractDataUrlBase64, isDataUrl, parseDataUrl } from '@/lib/data-url';
import type { ChatAttachment, ChatMessage } from './ai-designer-panel-types';

// ── Re-exports from sub-modules ─────────────────────────────

export { detectGenerationIntent, detectToolPrefix } from './ai-designer-command-utils';
export { formatTime, extractGeneratedImageUrls, removeImageUrlsFromContent, renderMarkdown } from './ai-designer-message-utils';
export { createChatSession } from './ai-designer-panel-storage';


// ── Attachment construction (stays here — API interface layer) ───

export function extractBase64Data(dataUrl: string) {
    return isDataUrl(dataUrl) ? extractDataUrlBase64(dataUrl) : dataUrl;
}

export function createChatAttachment(params: {
    id: string;
    name: string;
    type?: string;
    dataUrl: string;
}): ChatAttachment {
    const { id, name, type = 'image/png', dataUrl } = params;
    const resolvedType = isDataUrl(dataUrl)
        ? parseDataUrl(dataUrl).mime.split(';')[0] || type
        : type;
    return {
        id,
        name,
        type: resolvedType,
        dataUrl,
        base64Data: isDataUrl(dataUrl) ? extractBase64Data(dataUrl) : '',
    };
}

export function buildApiMessages(params: {
    messages: ChatMessage[];
    userText: string;
    currentAttachments: ChatAttachment[];
    marks?: { id: string; markNumber: number; markText?: string; x: number; y: number; targetImageContent?: string }[];
    webSearchEnabled: boolean;
}) {
    const { messages, userText, currentAttachments, marks, webSearchEnabled } = params;

    const history = messages
        .filter((message) => message.role !== ('system' as string))
        .map((message) => ({ role: message.role, content: message.content }));

    const hasMarkRef = /\[标记#\d+/.test(userText);
    if (hasMarkRef && marks && marks.length > 0) {
        const marksSummary = marks.map((mark) =>
            `标记#${mark.markNumber}${mark.markText ? `(${mark.markText})` : ''} 位于画布坐标 (${Math.round(mark.x)}, ${Math.round(mark.y)})${mark.targetImageContent ? '，已关联一张图片（将作为附件发送）' : ''}`
        ).join('；');
        const markSystemHint = `[画布标记上下文] 用户在设计画布上放置了以下标记钉来指示需要关注或修改的位置：${marksSummary}。当用户引用某个标记时，请针对该标记所在的画布位置给出具体的设计建议或操作指导。如果标记关联了图片，请结合附件中的图片进行分析。标记坐标表示画布上的像素位置，数值越大越靠右/下方。`;
        history.unshift({ role: 'user' as const, content: markSystemHint });
        history.splice(1, 0, {
            role: 'assistant' as const,
            content: '好的，我已了解画布上的标记位置，请告诉我你需要对这些标记位置做什么设计调整。',
        });
    }

    if (currentAttachments.length > 0) {
        const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        let fullText = userText;
        if (webSearchEnabled) {
            fullText = `[联网搜索模式] ${fullText}`;
        }
        contentParts.push({ type: 'text', text: fullText });
        for (const attachment of currentAttachments) {
            // Some APIs expect a proper data URL with MIME prefix;
            // others only accept raw base64. Normalize to data URL format
            // which is the OpenAI-compatible standard for image_url.
            let imageUrl = attachment.dataUrl;
            // Safety: skip imgref:// references that weren't resolved to data URLs
            if (imageUrl && imageUrl.startsWith('imgref://')) {
                console.warn('[buildApiMessages] Skipping unresolved imgref attachment:', attachment.name);
                continue;
            }
            if (imageUrl && !imageUrl.startsWith('data:') && !imageUrl.startsWith('http')) {
                // Raw base64 without prefix — add data URL header
                imageUrl = `data:${attachment.type || 'image/png'};base64,${imageUrl}`;
            }
            contentParts.push({ type: 'image_url', image_url: { url: imageUrl } });
        }
        history.push({ role: 'user', content: contentParts as never });
        return history;
    }

    let text = userText;
    if (webSearchEnabled) {
        text = `[联网搜索模式] ${text}`;
    }
    history.push({ role: 'user', content: text });
    return history;
}
