import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { captureVideoThumbnailDataUrl } from '@/lib/project-thumbnail';
import { renderPathPoints } from './canvas-ui-utils';
import type { CanvasElement } from './canvas-types';
import type { ElementHandlers } from './CanvasElementRenderer';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';

function toRendererPx(value: number | undefined, fallback = 0) {
    return `${Number.isFinite(value) ? value : fallback}px`;
}

function sanitizeRendererCssColor(value: string | undefined, fallback = '#9CA3AF') {
    const color = (value || '').trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
}

function sanitizeRendererFontFamily(value: string | undefined) {
    const family = (value || 'Inter').trim().replace(/[;{}]/g, '');
    return family || 'Inter';
}

export function ImageGeneratorElementRenderer({ el, isGeneratorSubmitting }: { el: CanvasElement; isGeneratorSubmitting: boolean }) {
    const isBusy = !!(el.generatingTaskId || isGeneratorSubmitting);

    return (
        <div className={`w-full h-full border-2 rounded-xl flex flex-col items-center justify-center ${isBusy ? 'bg-blue-100 border-blue-500' : 'bg-blue-50 border-blue-400'} text-blue-500`}>
            {isBusy ? (
                <>
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-500 mb-3" />
                    <div className="text-sm font-medium">{isGeneratorSubmitting && !el.generatingTaskId ? '正在提交图片请求...' : '正在生成图片...'}</div>
                    {(el.generatingProgress || 0) > 0 && <div className="text-xs opacity-70 mt-1">{el.generatingProgress}%</div>}
                </>
            ) : (
                <>
                    <div className="w-20 h-20 mb-4 opacity-50"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg></div>
                    <div className="text-sm font-medium">图片生成器</div>
                    <div className="text-xs opacity-70">{Math.round(el.width || 0)} x {Math.round(el.height || 0)}</div>
                </>
            )}
        </div>
    );
}

export function StoryboardPlannerElementRenderer({ el, isGeneratorSubmitting }: { el: CanvasElement; isGeneratorSubmitting: boolean }) {
    const isBusy = !!(el.generatingTaskId || isGeneratorSubmitting || el.generatingError);

    return (
        <div className={`h-full w-full rounded-xl border-2 text-sky-600 ${(el.generatingTaskId || isGeneratorSubmitting) ? 'border-sky-500 bg-[linear-gradient(180deg,rgba(224,242,254,0.96),rgba(186,230,253,0.92))]' : el.generatingError ? 'border-rose-300 bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(255,228,230,0.92))] text-rose-600' : 'border-sky-400 bg-[linear-gradient(180deg,rgba(239,246,255,0.95),rgba(224,242,254,0.95))]'}`}>
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                {isBusy ? (
                    <>
                        <div className={`mb-4 flex h-20 w-20 items-center justify-center rounded-[26px] shadow-inner shadow-white/50 ${el.generatingError ? 'bg-rose-100/90 text-rose-600' : 'bg-sky-200/80 text-sky-600'}`}>
                            {el.generatingError ? <svg viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 5a1.2 1.2 0 0 0-1.2 1.2v5.1A1.2 1.2 0 0 0 12 14.5a1.2 1.2 0 0 0 1.2-1.2V8.2A1.2 1.2 0 0 0 12 7zm0 10.2a1.35 1.35 0 1 0 0-2.7 1.35 1.35 0 0 0 0 2.7z" /></svg> : <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-200 border-t-sky-500" />}
                        </div>
                        <div className="text-sm font-medium">{el.generatingError ? '宫格图生成失败' : isGeneratorSubmitting && !el.generatingTaskId ? '正在提交宫格图请求...' : '正在生成宫格图...'}</div>
                        <div className="mt-1 text-xs opacity-80">{el.generatingError ? el.generatingError : (el.generatingProgress || 0) > 0 ? `${el.generatingProgress}%` : '任务已进入生成队列'}</div>
                    </>
                ) : (
                    <>
                        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-[26px] bg-sky-200/80 text-sky-600 shadow-inner shadow-white/50"><svg viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10"><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm2 3v2h2V8H6zm0 4v2h2v-2H6zm0 4v1h12v-1H6zm4-8v2h8V8h-8zm0 4v2h8v-2h-8z" /></svg></div>
                        <div className="text-sm font-medium">分镜规划器</div>
                        <div className="mt-1 text-xs opacity-80">上传主图，拆解提示词，并生成宫格图片</div>
                        <div className="mt-3 rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-sky-700 shadow-sm">{Math.round(el.width || 0)} x {Math.round(el.height || 0)}</div>
                    </>
                )}
            </div>
        </div>
    );
}

export function VideoGeneratorElementRenderer({ el, isGeneratorSubmitting }: { el: CanvasElement; isGeneratorSubmitting: boolean }) {
    const isBusy = !!(el.generatingTaskId || isGeneratorSubmitting);

    return (
        <div className={`w-full h-full border-2 rounded-xl flex flex-col items-center justify-center ${isBusy ? 'bg-purple-100 border-purple-500 text-purple-500' : 'bg-blue-50 border-blue-400 text-blue-500'}`}>
            {isBusy ? (
                <>
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-200 border-t-purple-500 mb-3" />
                    <div className="text-sm font-medium">{isGeneratorSubmitting && !el.generatingTaskId ? '正在提交视频请求...' : '正在生成视频...'}</div>
                    {(el.generatingProgress || 0) > 0 && <div className="text-xs opacity-70 mt-1">{el.generatingProgress}%</div>}
                </>
            ) : (
                <>
                    <div className="w-20 h-20 mb-4 opacity-50"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" /></svg></div>
                    <div className="text-sm font-medium">视频生成器</div>
                    <div className="text-xs opacity-70">{Math.round(el.width || 0)} x {Math.round(el.height || 0)}</div>
                </>
            )}
        </div>
    );
}

export function ImageGeneratingElementRenderer({ el }: { el: CanvasElement }) {
    return (
        <div className="w-full h-full border-2 border-blue-400 bg-blue-50 rounded-xl flex flex-col items-center justify-center text-blue-500">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-500 mb-3" />
            <div className="text-sm font-medium">正在生成图片...</div>
            {(el.generatingProgress || 0) > 0 && <div className="text-xs opacity-70 mt-1">{el.generatingProgress}%</div>}
        </div>
    );
}

function CanvasVideoPreview({ src }: { src: string }) {
    const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null);
    const [isFrameReady, setIsFrameReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        void captureVideoThumbnailDataUrl(src, { maxWidth: 960, quality: 0.86, seekTime: 0.1 }).then((thumbnail) => {
            if (!cancelled) setPosterDataUrl(thumbnail);
        });

        return () => {
            cancelled = true;
        };
    }, [src]);

    return (
        <>
            <video key={src} src={src} poster={posterDataUrl ?? undefined} preload="auto" muted playsInline className="pointer-events-none h-full w-full object-cover" onLoadedData={() => setIsFrameReady(true)} onError={() => setIsFrameReady(false)} />
            {!isFrameReady && !posterDataUrl && <div className="absolute inset-0 flex items-center justify-center bg-gray-900"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white/80" /></div>}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/25 backdrop-blur-[2px]"><Play size={38} className="translate-x-[2px] text-white/80" /></div></div>
            <div className="pointer-events-none absolute bottom-2 left-2 text-white/75 text-xs drop-shadow-sm">双击播放</div>
        </>
    );
}

export function VideoElementRenderer({ el }: { el: CanvasElement }) {
    return (
        <div className="relative w-full h-full rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center">
            {el.content ? <CanvasVideoPreview key={el.content} src={el.content} /> : <div className="flex flex-col items-center gap-2"><div className="animate-spin rounded-full h-8 w-8 border-2 border-white/30 border-t-white/80" /><div className="text-white/60 text-xs">转码中...</div></div>}
        </div>
    );
}

export function TextElementRenderer({ el, isEditingText, handlersRef }: { el: CanvasElement; isEditingText: boolean; handlersRef: React.RefObject<ElementHandlers> }) {
    const h = handlersRef.current!;
    const textClassName = buildFloatingPanelPositionClassName('canvas-text-renderer-style', el.id);
    const textCss = `
.${textClassName} {
    font-size: ${toRendererPx(el.fontSize, 24)};
    font-family: ${sanitizeRendererFontFamily(el.fontFamily)};
    color: ${sanitizeRendererCssColor(el.color, '#000000')};
}
`;

    return isEditingText ? (
        <>
            <style>{textCss}</style>
            <textarea autoFocus title="编辑文本内容" className={`${textClassName} w-full h-full bg-transparent outline-none resize-none overflow-hidden`} value={el.content} onChange={(e) => h.onElementChange(el.id, { content: e.target.value })} onBlur={() => h.setEditingTextId(null)} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
        </>
    ) : (
        <>
            <style>{textCss}</style>
            <div className={`${textClassName} w-full h-full whitespace-nowrap select-none flex items-center`}>{el.content || '双击编辑文本'}</div>
        </>
    );
}

export function ShapeElementRenderer({ el }: { el: CanvasElement }) {
    const shapeColorClassName = buildFloatingPanelPositionClassName('canvas-shape-renderer-color', el.id);
    const triangleClassName = buildFloatingPanelPositionClassName('canvas-shape-renderer-triangle', el.id);
    const shapeColor = sanitizeRendererCssColor(el.color);
    const shapeCss = `
.${shapeColorClassName} {
    background-color: ${shapeColor};
}

.${triangleClassName} {
    border-bottom-color: ${shapeColor};
    border-bottom-width: ${toRendererPx(el.height)};
    border-left-width: ${toRendererPx((el.width || 0) / 2)};
    border-right-width: ${toRendererPx((el.width || 0) / 2)};
}
`;

    return (
        <div className="w-full h-full flex items-center justify-center">
            <style>{shapeCss}</style>
            {(!el.shapeType || el.shapeType === 'square') && <div className={`${shapeColorClassName} w-full h-full`} />}
            {el.shapeType === 'circle' && <div className={`${shapeColorClassName} w-full h-full rounded-full`} />}
            {el.shapeType === 'triangle' && <div className={`${triangleClassName} w-0 h-0 border-l-[50px] border-r-[50px] border-b-[100px] border-l-transparent border-r-transparent`} />}
            {el.shapeType === 'message' && <svg viewBox="0 0 24 24" className="w-full h-full" fill={el.color || '#9CA3AF'}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>}
            {el.shapeType === 'arrow-left' && <svg viewBox="0 0 24 24" className="w-full h-full" fill={el.color || '#9CA3AF'}><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>}
            {el.shapeType === 'arrow-right' && <svg viewBox="0 0 24 24" className="w-full h-full" fill={el.color || '#9CA3AF'}><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" /></svg>}
        </div>
    );
}

export function PathElementRenderer({ el }: { el: CanvasElement }) {
    if (!el.points) return null;

    return (
        <svg className="w-full h-full overflow-visible pointer-events-none" viewBox={`0 0 ${el.width} ${el.height}`} preserveAspectRatio="none">
            <path d={renderPathPoints(el.points)} stroke={el.color || '#000000'} strokeWidth={el.strokeWidth || 3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}