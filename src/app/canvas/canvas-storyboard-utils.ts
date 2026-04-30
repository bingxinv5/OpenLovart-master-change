/**
 * canvas-storyboard-utils.ts — 故事板相关纯工具函数
 *
 * 故事板审核状态、占位图生成、排序等与故事板镜头元数据相关的工具。
 */

import type { CanvasElement } from '@/components/lovart/canvas-types';
import { isCanvasElementOfType } from '@/components/lovart/canvas-types';
import { validateStoryboardDuration, validateStoryboardShotCode } from '@/lib/storyboard-utils';

// ── Storyboard Utilities ─────────────────────────────────────

export function truncateStoryboardText(value: string, maxLength: number) {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }
    return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function escapeXml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function buildStoryboardPlaceholderDataUrl(params: {
    shotCode: string;
    sceneType: string;
    cameraMove: string;
    duration: string;
    note: string;
    prompt: string;
}) {
    const escaped = {
        shotCode: truncateStoryboardText(params.shotCode || 'A01', 10),
        sceneType: truncateStoryboardText(params.sceneType || '中景', 18),
        cameraMove: truncateStoryboardText(params.cameraMove || '静止', 18),
        duration: truncateStoryboardText(params.duration || '5s', 10),
        note: truncateStoryboardText(params.note || '镜头说明待补充', 64),
        prompt: truncateStoryboardText(params.prompt || 'Prompt 待补充', 86),
    };

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
    <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="55%" stop-color="#1e293b" />
            <stop offset="100%" stop-color="#312e81" />
        </linearGradient>
        <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="rgba(255,255,255,0.18)" />
            <stop offset="100%" stop-color="rgba(255,255,255,0.05)" />
        </linearGradient>
    </defs>
    <rect width="960" height="720" fill="url(#bg)" rx="36" />
    <rect x="28" y="28" width="904" height="664" rx="30" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
    <rect x="56" y="54" width="848" height="76" rx="24" fill="rgba(15,23,42,0.42)" stroke="rgba(255,255,255,0.12)" />
    <text x="84" y="102" fill="#f8fafc" font-size="34" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif" font-weight="700">${escapeXml(escaped.shotCode)}</text>
    <text x="228" y="102" fill="#cbd5e1" font-size="24" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif">${escapeXml(escaped.sceneType)}</text>
    <rect x="58" y="160" width="844" height="334" rx="28" fill="url(#card)" stroke="rgba(255,255,255,0.14)" stroke-width="2" />
    <text x="86" y="214" fill="#a5b4fc" font-size="18" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif" letter-spacing="2">SHOT NOTE</text>
    <text x="86" y="266" fill="#ffffff" font-size="34" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif" font-weight="600">${escapeXml(escaped.note)}</text>
    <rect x="58" y="530" width="260" height="118" rx="24" fill="rgba(15,23,42,0.38)" stroke="rgba(255,255,255,0.12)" />
    <text x="86" y="572" fill="#7dd3fc" font-size="16" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif">CAMERA</text>
    <text x="86" y="614" fill="#f8fafc" font-size="28" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif" font-weight="600">${escapeXml(escaped.cameraMove)}</text>
    <rect x="344" y="530" width="178" height="118" rx="24" fill="rgba(15,23,42,0.38)" stroke="rgba(255,255,255,0.12)" />
    <text x="372" y="572" fill="#f9a8d4" font-size="16" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif">DURATION</text>
    <text x="372" y="614" fill="#f8fafc" font-size="28" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif" font-weight="600">${escapeXml(escaped.duration)}</text>
    <rect x="548" y="530" width="354" height="118" rx="24" fill="rgba(15,23,42,0.38)" stroke="rgba(255,255,255,0.12)" />
    <text x="576" y="572" fill="#c4b5fd" font-size="16" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif">PROMPT</text>
    <text x="576" y="610" fill="#e2e8f0" font-size="20" font-family="ui-sans-serif, Segoe UI, Microsoft YaHei, sans-serif">${escapeXml(escaped.prompt)}</text>
</svg>`;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function getStoryboardAuditState(element: CanvasElement) {
    const shotCode = element.storyboardShotCode?.trim();
    const sceneType = element.storyboardSceneType?.trim();
    const duration = element.storyboardDuration?.trim();
    const note = element.storyboardNote?.trim();
    const cameraMove = element.storyboardCameraMove?.trim();
    const hasAnyMeta = !!(shotCode || sceneType || duration || note || cameraMove);
    const hasValidationError = !!(validateStoryboardShotCode(shotCode) || validateStoryboardDuration(duration));
    const isReady = !!(shotCode && sceneType && duration) && !hasValidationError;
    const isPartial = hasAnyMeta && !isReady && !hasValidationError;
    const isUntracked = !hasAnyMeta;

    return {
        hasAnyMeta,
        hasValidationError,
        isReady,
        isPartial,
        isUntracked,
    };
}

export function hasStoryboardGenerationSeed(element: CanvasElement) {
    return isCanvasElementOfType(element, 'image')
        && !!element.content
        && !!(
            element.savedPrompt?.trim()
            || element.storyboardShotCode?.trim()
            || element.storyboardSceneType?.trim()
            || element.storyboardNote?.trim()
        );
}

export function sortStoryboardElements(elements: CanvasElement[]) {
    return [...elements].sort((left, right) => {
        const leftCode = left.storyboardShotCode?.trim();
        const rightCode = right.storyboardShotCode?.trim();
        if (leftCode && rightCode && leftCode !== rightCode) {
            return leftCode.localeCompare(rightCode, 'zh-CN', { numeric: true, sensitivity: 'base' });
        }
        if (left.y !== right.y) {
            return left.y - right.y;
        }
        return left.x - right.x;
    });
}
