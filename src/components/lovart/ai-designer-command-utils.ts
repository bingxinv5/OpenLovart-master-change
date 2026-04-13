/**
 * AI Designer — Command parsing & generation intent detection.
 *
 * Pure functions for routing user input to the appropriate handler:
 * image generation, video generation, tool prompt, or plain chat.
 */

import type { MentionItem } from './ai-designer-panel-types';

// ── Intent detection patterns ───────────────────────────────

const IMAGE_GEN_PATTERNS = /^(画|生成|做|创作|设计|绘制|来一张|帮我画|帮我生成|帮我做|帮我设计|请画|请生成|请帮我画|直接.*(画|生成|做)).*(图|图片|海报|插画|插图|封面|壁纸|头像|logo|icon|照片|画|素材|Banner|banner|背景图|宣传图|效果图|概念图|漫画|卡通|表情包|贴纸)/;
const IMAGE_GEN_PATTERNS2 = /^(画|生成|做|绘制|来)(一|几|个|张|幅|款)?(只|条|头|匹|朵|颗|棵)?.{0,30}$/;
const VIDEO_GEN_PATTERNS = /^(生成|做|创作|制作|帮我生成|帮我做|帮我制作|请生成|请帮我|直接.*(生成|做|制作)).*(视频|动画|动图|短片|影片|片段|动效)/;

/**
 * Detect whether the user's text implies an image or video generation request.
 * Returns `'image'`, `'video'`, or `null` (plain chat).
 */
export function detectGenerationIntent(text: string): 'image' | 'video' | null {
    if (VIDEO_GEN_PATTERNS.test(text)) return 'video';
    if (IMAGE_GEN_PATTERNS.test(text)) return 'image';
    if (IMAGE_GEN_PATTERNS2.test(text)) return 'image';
    return null;
}

/**
 * Detect whether the user's text starts with a mention-tool prefix
 * (e.g. "@配色方案 …"). Returns the matched tool and the remaining prompt.
 */
export function detectToolPrefix(text: string, mentionItems: MentionItem[]) {
    for (const item of mentionItems) {
        const prefix = item.insert.trimEnd();
        if (text.startsWith(prefix)) {
            const prompt = text.slice(prefix.length).trim();
            return { tool: item, prompt };
        }
    }
    return null;
}
