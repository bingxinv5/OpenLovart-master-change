'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Play, MousePointerClick, MapPin, Wand2, Send, Frame, Download, Trash2, MousePointer2 } from 'lucide-react';
import { isImageRef, getImageBlobUrl, getImageDataUrl } from '@/lib/editor-kernel';
import { captureVideoThumbnailDataUrl } from '@/lib/project-thumbnail';
import { validateStoryboardDuration, validateStoryboardShotCode } from '@/lib/storyboard-utils';
import { DragNumberInput, StableColorInput, renderPathPoints } from './canvas-ui-utils';
import type { CanvasElement, FrameAutoLayoutAlign, FrameAutoLayoutMode } from './canvas-types';
import { WorkbenchImage } from './WorkbenchImage';

const FRAME_LAYOUT_MODE_LABELS: Record<FrameAutoLayoutMode, string> = {
    flow: '流式',
    row: '横排',
    column: '竖排',
    grid: '网格',
};

const FRAME_LAYOUT_ALIGN_LABELS: Record<FrameAutoLayoutAlign, string> = {
    start: '左上',
    center: '居中',
};

function buildImageMetaChips(element: CanvasElement) {
    const chips: string[] = [];
    if (element.selectedModel?.trim()) {
        // Shorten long model names: keep last meaningful segment
        const raw = element.selectedModel.trim();
        const short = raw.length > 16 ? raw.replace(/^.*?([a-z0-9]+-[a-z0-9-]+)$/i, '$1').replace(/^models[/-]/, '') : raw;
        chips.push(short.length > 20 ? short.slice(0, 18) + '…' : short);
    }
    if (element.selectedAspectRatio?.trim()) chips.push(element.selectedAspectRatio.trim());
    if (element.selectedImageSize?.trim()) chips.push(element.selectedImageSize.trim());
    return chips.slice(0, 3);
}

function buildStoryboardMetaChips(element: CanvasElement) {
    const chips: string[] = [];
    if (element.storyboardShotCode?.trim()) chips.push(element.storyboardShotCode.trim());
    if (element.storyboardSceneType?.trim()) chips.push(element.storyboardSceneType.trim());
    if (element.storyboardCameraMove?.trim()) chips.push(element.storyboardCameraMove.trim());
    if (element.storyboardDuration?.trim()) chips.push(element.storyboardDuration.trim());
    return chips.slice(0, 4);
}

function getStoryboardStatus(element: CanvasElement) {
    const shotCode = element.storyboardShotCode?.trim();
    const sceneType = element.storyboardSceneType?.trim();
    const duration = element.storyboardDuration?.trim();
    const note = element.storyboardNote?.trim();
    const cameraMove = element.storyboardCameraMove?.trim();
    const hasAny = !!(shotCode || sceneType || duration || note || cameraMove);
    const shotCodeError = validateStoryboardShotCode(shotCode);
    const durationError = validateStoryboardDuration(duration);
    const missingRequired = [
        !shotCode ? '镜头号' : null,
        !sceneType ? '景别' : null,
        !duration ? '时长' : null,
    ].filter(Boolean) as string[];

    return {
        hasAny,
        hasValidationError: !!(shotCodeError || durationError),
        missingRequired,
        note,
    };
}

function getStoryboardBadgeMeta(element: CanvasElement) {
    const storyboardStatus = getStoryboardStatus(element);
    const primaryLabel = element.storyboardShotCode?.trim() || element.storyboardSceneType?.trim() || '';

    if (storyboardStatus.hasValidationError) {
        return {
            label: primaryLabel || '待修正',
            className: 'border-rose-200 bg-rose-50/96 text-rose-700',
        };
    }

    if (storyboardStatus.missingRequired.length > 0) {
        return {
            label: primaryLabel || '待补齐',
            className: 'border-amber-200 bg-amber-50/96 text-amber-700',
        };
    }

    if (storyboardStatus.hasAny) {
        return {
            label: primaryLabel || '分镜已齐',
            className: 'border-emerald-200 bg-emerald-50/96 text-emerald-700',
        };
    }

    return {
        label: '未建档',
        className: 'border-slate-200 bg-white/90 text-slate-500',
    };
}

async function resolveRenderableImageSource(content: string): Promise<string | null> {
    if (!content) return null;
    if (!isImageRef(content)) return content;
    return getImageBlobUrl(content);
}

async function renderFrameImagesToCanvas(
    ctx: CanvasRenderingContext2D,
    frame: CanvasElement,
    children: CanvasElement[],
): Promise<void> {
    const sources = await Promise.all(children.map(child => resolveRenderableImageSource(child.content || '')));

    await Promise.all(sources.map((src, index) => new Promise<void>((resolve) => {
        if (!src) {
            resolve();
            return;
        }

        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        const child = children[index];
        img.onload = () => {
            ctx.drawImage(
                img,
                child.x - frame.x,
                child.y - frame.y,
                child.width || img.naturalWidth,
                child.height || img.naturalHeight,
            );
            resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
    })));
}

function CanvasVideoPreview({ src }: { src: string }) {
    const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null);
    const [isFrameReady, setIsFrameReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        setPosterDataUrl(null);
        setIsFrameReady(false);

        void captureVideoThumbnailDataUrl(src, { maxWidth: 960, quality: 0.86, seekTime: 0.1 }).then((thumbnail) => {
            if (cancelled) {
                return;
            }

            setPosterDataUrl(thumbnail);
        });

        return () => {
            cancelled = true;
        };
    }, [src]);

    return (
        <>
            <video
                key={src}
                src={src}
                poster={posterDataUrl ?? undefined}
                preload="auto"
                muted
                playsInline
                className="pointer-events-none h-full w-full object-cover"
                onLoadedData={() => setIsFrameReady(true)}
                onError={() => setIsFrameReady(false)}
            />
            {!isFrameReady && !posterDataUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white/80" />
                </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/25 backdrop-blur-[2px]">
                    <Play size={38} className="translate-x-[2px] text-white/80" />
                </div>
            </div>
            <div className="pointer-events-none absolute bottom-2 left-2 text-white/75 text-xs drop-shadow-sm">双击播放</div>
        </>
    );
}

// ─── Handlers interface: passed via stable ref to avoid React.memo invalidation ───
export interface ElementHandlers {
    handleMouseDown: (e: React.MouseEvent, id: string | null, x: number, y: number, w: number, h: number, options?: { fallbackSelectionId?: string }) => void;
    handleResizeStart: (e: React.MouseEvent, id: string, handle: string, el: CanvasElement) => void;
    onElementChange: (id: string, changes: Partial<CanvasElement>) => void;
    onCanvasSelectPick?: ((el: CanvasElement) => void) | null;
    onSelect: (ids: string[]) => void;
    onDelete: (id: string) => void;
    setEditingTextId: (id: string | null) => void;
    setEditingFrameName: (id: string | null) => void;
    setEditingMarkId: (id: string | null) => void;
    setActiveVideoId: (id: string | null) => void;
    setActiveImagePreviewId: (id: string | null) => void;
    setShowFramePresetMenu: (val: string | null) => void;
    setShowFrameExportMenu: (val: string | null) => void;
    setQuickEditMarkId: (id: string | null) => void;
    setQuickEditPrompt: (prompt: string) => void;
    handleQuickEditSubmit: (el: CanvasElement) => void;
    scheduleAutoLayout: (frameId: string) => void;
    /** 双击图片时调用：缩放并平移视口使该元素完整显示 */
    fitToElement: (el: CanvasElement) => void;
    /** Lazy-evaluated latest elements (avoids stale closure) */
    getElements: () => CanvasElement[];
}

// ─── Props for the memoized element renderer ───
export interface CanvasElementRendererProps {
    el: CanvasElement;
    resolvedImageSrc?: string;
    // Pre-computed boolean flags for efficient shallow comparison
    isSelected: boolean;
    selectedImageCount: number;
    showToolbar: boolean;
    isDropTarget: boolean;
    isEditingText: boolean;
    isEditingFrameName: boolean;
    isEditingMark: boolean;
    isQuickEditing: boolean;
    isLinked: boolean;
    isPickable: boolean;
    isNotPickable: boolean;
    frameChildCount: number;
    scale: number;
    activeTool: string;
    quickEditPrompt: string;
    showFramePresetMenu: boolean;
    showFrameExportMenu: boolean;
    canGenerateFromImage: boolean;
    markTargetHasContent: boolean;
    isGeneratorSubmitting: boolean;
    isResultHighlighted: boolean;
    isLayerOrderHighlighted: boolean;
    dragPreviewOffset?: { dx: number; dy: number } | null;
    zIndex?: number;
    /** Stable ref — identity never changes → React.memo skips re-render */
    handlersRef: React.RefObject<ElementHandlers>;
}

/**
 * Memoized per-element renderer.
 * By pre-computing boolean flags in the parent map-loop and passing a stable
 * handlers ref, React.memo's default shallow comparison can skip re-renders
 * for the vast majority of elements on every state change.
 */
export const CanvasElementRenderer = React.memo<CanvasElementRendererProps>(
    function CanvasElementRenderer({
        el,
        resolvedImageSrc,
        isSelected,
        selectedImageCount,
        showToolbar,
        isDropTarget,
        isEditingText,
        isEditingFrameName,
        isEditingMark,
        isQuickEditing,
        isLinked,
        isPickable,
        isNotPickable,
        frameChildCount,
        scale,
        activeTool,
        quickEditPrompt,
        showFramePresetMenu,
        showFrameExportMenu,
        canGenerateFromImage,
        markTargetHasContent,
        isGeneratorSubmitting,
        isResultHighlighted,
        isLayerOrderHighlighted,
        dragPreviewOffset,
        zIndex,
        handlersRef,
    }) {
        const h = handlersRef.current!;
        const [isHovered, setIsHovered] = useState(false);
        const isLocked = !!(el.locked || (el.type === 'frame' && el.frameLocked));
        const storyboardStatus = getStoryboardStatus(el);
        const storyboardChips = buildStoryboardMetaChips(el);
        const storyboardBadgeMeta = getStoryboardBadgeMeta(el);
        const canPrioritizeSelectedImageDetail = isSelected && selectedImageCount > 0 && selectedImageCount <= 10;
        const shouldPrioritizeImageDetail = el.type === 'image' && (isHovered || canPrioritizeSelectedImageDetail);
        const shouldShowStoryboardBadge = el.type === 'image'
            && isSelected
            && !isNotPickable
            && (storyboardStatus.hasAny || ((el.width || 0) * scale >= 108 && (el.height || 0) * scale >= 84));

        return (
            <div
                data-element-id={el.id}
                className={`absolute group ${el.type === 'frame' ? 'z-0' : ''} ${isPickable ? 'cursor-pointer ring-4 ring-green-400 ring-offset-2 rounded-lg z-20' : ''} ${isNotPickable ? 'opacity-30 pointer-events-none' : ''} ${isLocked ? 'cursor-not-allowed' : ''}`}
                style={{
                    left: el.x,
                    top: el.y,
                    width: el.width,
                    height: el.height,
                    zIndex,
                    transform: dragPreviewOffset ? `translate(${dragPreviewOffset.dx}px, ${dragPreviewOffset.dy}px)` : undefined,
                    pointerEvents: activeTool === 'draw' || isNotPickable ? 'none' : 'auto',
                }}
                onDragStart={(e) => e.preventDefault()}
                onMouseEnter={() => {
                    if (el.type === 'image') {
                        setIsHovered(true);
                        h.setActiveImagePreviewId(el.id);
                    }
                }}
                onMouseLeave={() => {
                    if (el.type === 'image') {
                        setIsHovered(false);
                        h.setActiveImagePreviewId(null);
                    }
                }}
                onMouseDown={(e) => {
                    if (isPickable) {
                        e.stopPropagation();
                        h.onCanvasSelectPick?.(el);
                        return;
                    }

                    const frameBodyTarget = el.type === 'frame'
                        ? (e.target as HTMLElement).closest('[data-frame-body="true"]')
                        : null;
                    if (frameBodyTarget && activeTool === 'select') {
                        e.stopPropagation();
                        if (isSelected) {
                            // Frame already selected → drag to move it
                            h.handleMouseDown(e, el.id, el.x, el.y, el.width!, el.height!);
                        } else {
                            // Frame not selected → start selection box inside it
                            h.handleMouseDown(e, null, el.x, el.y, el.width!, el.height!, { fallbackSelectionId: el.id });
                        }
                        return;
                    }

                    if (activeTool === 'mark') {
                        e.stopPropagation();
                    }
                    h.handleMouseDown(e, el.id, el.x, el.y, el.width!, el.height!);
                }}
                onDoubleClick={() => {
                    if (isPickable || isNotPickable) return;
                    if (isLocked) return;
                    if (el.type === 'text') h.setEditingTextId(el.id);
                    if (el.type === 'video') h.setActiveVideoId(el.id);
                    if (el.type === 'mark') h.setEditingMarkId(el.id);
                    if (el.type === 'image') h.fitToElement(el);
                }}
            >
                {isResultHighlighted && (
                    <div className="pointer-events-none absolute -inset-3 z-0 animate-pulse rounded-[28px] border-2 border-emerald-400/80 shadow-[0_0_0_6px_rgba(52,211,153,0.18)]" />
                )}
                {isLayerOrderHighlighted && (
                    <>
                        <div className="pointer-events-none absolute -inset-3 z-0 animate-pulse rounded-[28px] border-2 border-amber-400/85 shadow-[0_0_0_7px_rgba(251,191,36,0.18)]" />
                        <div className="pointer-events-none absolute -top-10 left-1/2 z-30 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50/95 px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] text-amber-700 shadow-lg">
                            当前调整图层
                        </div>
                    </>
                )}
                {isLocked && (
                    <div className="pointer-events-none absolute -top-2 -left-2 z-20 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                        锁定
                    </div>
                )}
                {/* ── Image Generator Placeholder ── */}
                {el.type === 'image-generator' && (
                    <div className={`w-full h-full border-2 rounded-xl flex flex-col items-center justify-center ${
                        (el.generatingTaskId || isGeneratorSubmitting) ? 'bg-blue-100 border-blue-500' : 'bg-blue-50 border-blue-400'
                    } text-blue-500`}>
                        {(el.generatingTaskId || isGeneratorSubmitting) ? (
                            <>
                                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-500 mb-3" />
                                <div className="text-sm font-medium">
                                    {isGeneratorSubmitting && !el.generatingTaskId ? '正在提交图片请求...' : '正在生成图片...'}
                                </div>
                                {(el.generatingProgress || 0) > 0 && (
                                    <div className="text-xs opacity-70 mt-1">{el.generatingProgress}%</div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="w-20 h-20 mb-4 opacity-50">
                                    <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                                    </svg>
                                </div>
                                <div className="text-sm font-medium">图片生成器</div>
                                <div className="text-xs opacity-70">{Math.round(el.width || 0)} x {Math.round(el.height || 0)}</div>
                            </>
                        )}
                    </div>
                )}

                {el.type === 'storyboard-planner' && (
                    <div className={`h-full w-full rounded-xl border-2 text-sky-600 ${
                        (el.generatingTaskId || isGeneratorSubmitting)
                            ? 'border-sky-500 bg-[linear-gradient(180deg,rgba(224,242,254,0.96),rgba(186,230,253,0.92))]'
                            : el.generatingError
                                ? 'border-rose-300 bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(255,228,230,0.92))] text-rose-600'
                                : 'border-sky-400 bg-[linear-gradient(180deg,rgba(239,246,255,0.95),rgba(224,242,254,0.95))]'
                    }`}>
                        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                            {(el.generatingTaskId || isGeneratorSubmitting || el.generatingError) ? (
                                <>
                                    <div className={`mb-4 flex h-20 w-20 items-center justify-center rounded-[26px] shadow-inner shadow-white/50 ${
                                        el.generatingError ? 'bg-rose-100/90 text-rose-600' : 'bg-sky-200/80 text-sky-600'
                                    }`}>
                                        {el.generatingError ? (
                                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10">
                                                <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 5a1.2 1.2 0 0 0-1.2 1.2v5.1A1.2 1.2 0 0 0 12 14.5a1.2 1.2 0 0 0 1.2-1.2V8.2A1.2 1.2 0 0 0 12 7zm0 10.2a1.35 1.35 0 1 0 0-2.7 1.35 1.35 0 0 0 0 2.7z" />
                                            </svg>
                                        ) : (
                                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-200 border-t-sky-500" />
                                        )}
                                    </div>
                                    <div className="text-sm font-medium">
                                        {el.generatingError
                                            ? '宫格图生成失败'
                                            : isGeneratorSubmitting && !el.generatingTaskId
                                                ? '正在提交宫格图请求...'
                                                : '正在生成宫格图...'}
                                    </div>
                                    <div className="mt-1 text-xs opacity-80">
                                        {el.generatingError
                                            ? el.generatingError
                                            : (el.generatingProgress || 0) > 0
                                                ? `${el.generatingProgress}%`
                                                : '任务已进入生成队列'}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-[26px] bg-sky-200/80 text-sky-600 shadow-inner shadow-white/50">
                                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10">
                                            <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm2 3v2h2V8H6zm0 4v2h2v-2H6zm0 4v1h12v-1H6zm4-8v2h8V8h-8zm0 4v2h8v-2h-8z" />
                                        </svg>
                                    </div>
                                    <div className="text-sm font-medium">分镜规划器</div>
                                    <div className="mt-1 text-xs opacity-80">上传主图，拆解提示词，并生成宫格图片</div>
                                    <div className="mt-3 rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-sky-700 shadow-sm">
                                        {Math.round(el.width || 0)} x {Math.round(el.height || 0)}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Video Generator Placeholder ── */}
                {el.type === 'video-generator' && (
                    <div className={`w-full h-full border-2 rounded-xl flex flex-col items-center justify-center ${
                        (el.generatingTaskId || isGeneratorSubmitting) ? 'bg-purple-100 border-purple-500 text-purple-500' : 'bg-blue-50 border-blue-400 text-blue-500'
                    }`}>
                        {(el.generatingTaskId || isGeneratorSubmitting) ? (
                            <>
                                <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-200 border-t-purple-500 mb-3" />
                                <div className="text-sm font-medium">
                                    {isGeneratorSubmitting && !el.generatingTaskId ? '正在提交视频请求...' : '正在生成视频...'}
                                </div>
                                {(el.generatingProgress || 0) > 0 && (
                                    <div className="text-xs opacity-70 mt-1">{el.generatingProgress}%</div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="w-20 h-20 mb-4 opacity-50">
                                    <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                    </svg>
                                </div>
                                <div className="text-sm font-medium">视频生成器</div>
                                <div className="text-xs opacity-70">{Math.round(el.width || 0)} x {Math.round(el.height || 0)}</div>
                            </>
                        )}
                    </div>
                )}

                {/* ── Linked Element Highlight ── */}
                {isLinked && (
                    <div className="absolute inset-0 border-2 border-dashed border-purple-400 pointer-events-none opacity-60" />
                )}

                {/* ── Selection Border & Handles ── */}
                {isSelected && (
                    <>
                        <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none" />
                    </>
                )}

                {/* ── Image Content ── */}
                {el.type === 'image' && el.content && (
                    <>
                        <WorkbenchImage
                            content={el.content}
                            debugId={el.id}
                            resolvedSrc={resolvedImageSrc}
                            displayPixels={Math.max(el.width || 400, el.height || 400) * scale}
                            canvasScale={scale}
                            prioritizeDetail={shouldPrioritizeImageDetail}
                            alt="Upload"
                            containerClassName="w-full h-full rounded-lg"
                            imageClassName={`pointer-events-none rounded-lg transition-transform duration-200 ${isHovered && scale <= 0.18 ? 'scale-[1.08]' : ''}`}
                            fit={el.imageFit || 'contain'}
                            surfaceMode={el.imageSurface || 'checker'}
                            loading="lazy"
                            decoding="async"
                        />
                        {shouldShowStoryboardBadge && (
                            <div className="pointer-events-none absolute right-2 top-2 z-20">
                                <div className={`rounded-full border px-2 py-1 text-[10px] font-semibold shadow-sm backdrop-blur-sm ${storyboardBadgeMeta.className}`}>
                                    {storyboardBadgeMeta.label}
                                </div>
                            </div>
                        )}
                        {isSelected && (el.savedPrompt?.trim() || el.selectedModel?.trim() || canGenerateFromImage || storyboardStatus.hasAny) && (
                            <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
                                {/* ── 顶部渐变遮罩 ── */}
                                <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />
                                {/* ── 左侧信息 ── */}
                                <div className="relative flex items-start px-3 pt-2.5">
                                    <div className="flex flex-col gap-1.5">
                                        {/* AI + meta */}
                                        <div className="flex items-center gap-1">
                                            <span className="rounded bg-white/20 px-1.5 py-px text-[10px] font-bold tracking-wide text-white backdrop-blur-sm">AI</span>
                                            {buildImageMetaChips(el).map((chip, i) => (
                                                <span key={`${el.id}-${chip}`} className="text-[10px] text-white/75">
                                                    {i > 0 ? '' : ''}{chip}
                                                </span>
                                            ))}
                                        </div>
                                        {/* 分镜 row */}
                                        {storyboardStatus.hasAny && (
                                            <div className="flex items-center gap-1">
                                                <span className="rounded bg-amber-400/30 px-1.5 py-px text-[10px] font-bold text-amber-200 backdrop-blur-sm">分镜</span>
                                                {storyboardChips.slice(0, 3).map((chip) => (
                                                    <span key={`${el.id}-sb-${chip}`} className="text-[10px] text-white/65">{chip}</span>
                                                ))}
                                                {storyboardStatus.hasValidationError ? (
                                                    <span className="rounded bg-rose-500/50 px-1 py-px text-[9px] font-semibold text-white backdrop-blur-sm">待修正</span>
                                                ) : storyboardStatus.missingRequired.length > 0 ? (
                                                    <span className="text-[10px] text-amber-300/70">缺{storyboardStatus.missingRequired.join('/')}</span>
                                                ) : (
                                                    <span className="text-[10px] text-emerald-300">✓</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        {isSelected && el.savedPrompt?.trim() && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
                                <div className="bg-gradient-to-t from-black/50 to-transparent px-3 pb-3 pt-8">
                                    <div className="line-clamp-2 text-[11px] leading-[1.6] text-white/85 drop-shadow-sm">{el.savedPrompt}</div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {el.type === 'image' && !el.content && el.generatingTaskId && (
                    <div className="w-full h-full border-2 border-blue-400 bg-blue-50 rounded-xl flex flex-col items-center justify-center text-blue-500">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-500 mb-3" />
                        <div className="text-sm font-medium">正在生成图片...</div>
                        {(el.generatingProgress || 0) > 0 && (
                            <div className="text-xs opacity-70 mt-1">{el.generatingProgress}%</div>
                        )}
                    </div>
                )}

                {/* ── Video Content ── */}
                {el.type === 'video' && (
                    <div className="relative w-full h-full rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center">
                        {el.content ? (
                            <CanvasVideoPreview src={el.content} />
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/30 border-t-white/80" />
                                <div className="text-white/60 text-xs">转码中...</div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Text Content ── */}
                {el.type === 'text' && (
                    isEditingText ? (
                        <textarea
                            autoFocus
                            className="w-full h-full bg-transparent outline-none resize-none overflow-hidden"
                            style={{
                                fontSize: el.fontSize || 24,
                                fontFamily: el.fontFamily || 'Inter',
                                color: el.color || '#000000',
                            }}
                            value={el.content}
                            onChange={(e) => h.onElementChange(el.id, { content: e.target.value })}
                            onBlur={() => h.setEditingTextId(null)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <div
                            className="w-full h-full whitespace-nowrap select-none flex items-center"
                            style={{
                                fontSize: el.fontSize || 24,
                                fontFamily: el.fontFamily || 'Inter',
                                color: el.color || '#000000',
                            }}
                        >
                            {el.content || '双击编辑文本'}
                        </div>
                    )
                )}

                {/* ── Shape Content ── */}
                {el.type === 'shape' && (
                    <div className="w-full h-full flex items-center justify-center">
                        {(!el.shapeType || el.shapeType === 'square') && (
                            <div className="w-full h-full" style={{ backgroundColor: el.color || '#9CA3AF' }} />
                        )}
                        {el.shapeType === 'circle' && (
                            <div className="w-full h-full rounded-full" style={{ backgroundColor: el.color || '#9CA3AF' }} />
                        )}
                        {el.shapeType === 'triangle' && (
                            <div
                                className="w-0 h-0 border-l-[50px] border-r-[50px] border-b-[100px] border-l-transparent border-r-transparent"
                                style={{
                                    borderBottomColor: el.color || '#9CA3AF',
                                    borderBottomWidth: el.height,
                                    borderLeftWidth: (el.width || 0) / 2,
                                    borderRightWidth: (el.width || 0) / 2,
                                }}
                            />
                        )}
                        {el.shapeType === 'message' && (
                            <svg viewBox="0 0 24 24" className="w-full h-full" fill={el.color || '#9CA3AF'}>
                                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                            </svg>
                        )}
                        {el.shapeType === 'arrow-left' && (
                            <svg viewBox="0 0 24 24" className="w-full h-full" fill={el.color || '#9CA3AF'}>
                                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                            </svg>
                        )}
                        {el.shapeType === 'arrow-right' && (
                            <svg viewBox="0 0 24 24" className="w-full h-full" fill={el.color || '#9CA3AF'}>
                                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                            </svg>
                        )}
                    </div>
                )}

                {/* ── Frame Element ── */}
                {el.type === 'frame' && (
                    <FrameContent
                        el={el}
                        showToolbar={showToolbar}
                        isDropTarget={isDropTarget}
                        isEditingFrameName={isEditingFrameName}
                        showFramePresetMenu={showFramePresetMenu}
                        showFrameExportMenu={showFrameExportMenu}
                        frameChildCount={frameChildCount}
                        handlersRef={handlersRef}
                    />
                )}

                {/* ── Mark Element ── */}
                {el.type === 'mark' && (
                    <MarkContent
                        el={el}
                        isEditingMark={isEditingMark}
                        isQuickEditing={isQuickEditing}
                        quickEditPrompt={quickEditPrompt}
                        markTargetHasContent={markTargetHasContent}
                        handlersRef={handlersRef}
                    />
                )}

                {/* ── Path Element ── */}
                {el.type === 'path' && el.points && (
                    <svg
                        className="w-full h-full overflow-visible pointer-events-none"
                        viewBox={`0 0 ${el.width} ${el.height}`}
                        preserveAspectRatio="none"
                    >
                        <path
                            d={renderPathPoints(el.points)}
                            stroke={el.color || '#000000'}
                            strokeWidth={el.strokeWidth || 3}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                )}

                {/* ── Canvas Select Mode overlay ── */}
                {isPickable && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 rounded-lg pointer-events-none">
                        <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                            <MousePointerClick size={12} />
                            点击选择
                        </div>
                    </div>
                )}

                {/* ── Parent frame indicator badge ── */}
                {el.parentFrameId && !isSelected && el.type !== 'frame' && (
                    <div className="absolute -top-2 -right-2 pointer-events-none z-20">
                        <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shadow-sm">
                            <Frame size={8} className="text-white" />
                        </div>
                    </div>
                )}
            </div>
        );
    }
);

// ────────────────────────────────────────────────────────────
// Sub-components for complex element types (keeps the main
// renderer compact and allows independent memoization later)
// ────────────────────────────────────────────────────────────

/** Frame body + toolbar */
function FrameContent({
    el,
    showToolbar,
    isDropTarget,
    isEditingFrameName,
    showFramePresetMenu,
    showFrameExportMenu,
    frameChildCount,
    handlersRef,
}: {
    el: CanvasElement;
    showToolbar: boolean;
    isDropTarget: boolean;
    isEditingFrameName: boolean;
    showFramePresetMenu: boolean;
    showFrameExportMenu: boolean;
    frameChildCount: number;
    handlersRef: React.RefObject<ElementHandlers>;
}) {
    const h = handlersRef.current!;

    return (
        <div className="w-full h-full relative" style={{ overflow: 'visible' }}>
            {/* Frame label */}
            <div className="absolute -top-6 left-0 flex items-center gap-1.5 select-none" style={{ whiteSpace: 'nowrap' }}>
                <Frame size={12} className="text-blue-500" />
                {isEditingFrameName ? (
                    <input
                        autoFocus
                        type="text"
                        className="text-xs font-medium text-blue-500 bg-white border border-blue-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 min-w-[60px]"
                        value={el.frameName || 'Frame'}
                        onChange={(e) => h.onElementChange(el.id, { frameName: e.target.value })}
                        onBlur={() => h.setEditingFrameName(null)}
                        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') h.setEditingFrameName(null); }}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span
                        className="text-xs font-medium text-blue-500 cursor-text hover:text-blue-700"
                        onDoubleClick={(e) => { e.stopPropagation(); h.setEditingFrameName(el.id); }}
                    >
                        {el.frameName || 'Frame'}
                    </span>
                )}
                {frameChildCount > 0 && (
                    <span className="text-[9px] bg-blue-100 text-blue-500 px-1.5 py-0.5 rounded-full font-medium">
                        {frameChildCount}
                    </span>
                )}
                {el.groupFrame && (
                    <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-medium">
                        编组
                    </span>
                )}
                {el.frameAutoLayout && (
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                        {FRAME_LAYOUT_MODE_LABELS[el.frameAutoLayoutMode || 'flow']}
                    </span>
                )}
                {el.frameAutoLayout && (
                    <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">
                        {FRAME_LAYOUT_ALIGN_LABELS[el.frameAutoLayoutAlign || 'center']} · {Math.round(el.frameAutoLayoutGap ?? 14)}
                    </span>
                )}
            </div>

            {/* Frame body */}
            <div
                data-frame-body="true"
                data-testid={`frame-body-${el.id}`}
                className={`w-full h-full border rounded-sm transition-colors ${
                    isDropTarget
                        ? 'border-blue-500 border-2 shadow-lg shadow-blue-100'
                        : el.groupFrame
                            ? 'border-violet-400 border-2 bg-violet-50/30'
                            : 'border-gray-300'
                }`}
                style={{ backgroundColor: el.frameBgColor || '#FFFFFF', overflow: el.frameClip ? 'hidden' : 'visible' }}
            />

            {/* Drop target indicator overlay */}
            {isDropTarget && (
                <div className="absolute inset-0 bg-blue-50/30 border-2 border-dashed border-blue-400 rounded-sm pointer-events-none flex items-center justify-center">
                    <div className="bg-blue-500 text-white text-xs px-3 py-1.5 rounded-full shadow-lg font-medium">
                        放入画板
                    </div>
                </div>
            )}

            {/* Dimension label */}
            <div className="absolute -top-6 right-0 text-[10px] text-blue-400 select-none pointer-events-none">
                {Math.round(el.width || 0)} × {Math.round(el.height || 0)}
            </div>

            {/* Frame toolbar — only when selected & single & not dragging/resizing */}
            {showToolbar && (
                <FrameToolbar
                    el={el}
                    showFramePresetMenu={showFramePresetMenu}
                    showFrameExportMenu={showFrameExportMenu}
                    handlersRef={handlersRef}
                />
            )}
        </div>
    );
}

/** Comprehensive frame toolbar (preset, W/H, color, clip, auto-layout, export, lock, delete) */
function FrameToolbar({
    el,
    showFramePresetMenu,
    showFrameExportMenu,
    handlersRef,
}: {
    el: CanvasElement;
    showFramePresetMenu: boolean;
    showFrameExportMenu: boolean;
    handlersRef: React.RefObject<ElementHandlers>;
}) {
    const h = handlersRef.current!;
    const activeLayoutMode: FrameAutoLayoutMode = el.frameAutoLayoutMode || 'flow';
    const activeLayoutAlign: FrameAutoLayoutAlign = el.frameAutoLayoutAlign || 'center';

    return (
        <div
            className="absolute -top-14 left-1/2 -translate-x-1/2 z-30"
            onMouseDown={(e) => e.stopPropagation()}
            data-testid={`frame-toolbar-${el.id}`}
        >
            <div className="flex items-center bg-white rounded-xl shadow-xl border border-gray-200 px-3 py-2 gap-2">
                {/* Preset selector */}
                <button
                    className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors"
                    onClick={() => h.setShowFramePresetMenu(showFramePresetMenu ? null : el.id)}
                >
                    <Frame size={16} />
                    {el.framePreset || 'Custom'}
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-gray-400 ml-0.5"><path d="M1 3l3 3 3-3H1z"/></svg>
                </button>
                <div className="w-px h-7 bg-gray-200" />
                {/* W/H drag inputs */}
                <DragNumberInput label="W" value={el.width || 0} onChange={(v) => { h.onElementChange(el.id, { width: v, framePreset: 'Custom' }); if (el.frameAutoLayout) h.scheduleAutoLayout(el.id); }} />
                <DragNumberInput label="H" value={el.height || 0} onChange={(v) => { h.onElementChange(el.id, { height: v, framePreset: 'Custom' }); if (el.frameAutoLayout) h.scheduleAutoLayout(el.id); }} />
                <div className="w-px h-7 bg-gray-200" />
                {/* Background color */}
                <div className="relative">
                    <div
                        className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer relative overflow-hidden hover:ring-2 hover:ring-blue-200 transition-all"
                        style={{ backgroundColor: el.frameBgColor || '#FFFFFF' }}
                        title="背景颜色"
                    >
                        <StableColorInput
                            value={el.frameBgColor}
                            fallbackValue="#FFFFFF"
                            title="背景颜色"
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            onChange={(value) => h.onElementChange(el.id, { frameBgColor: value })}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
                {/* Clip toggle */}
                <button
                    className={`p-2 rounded-lg transition-colors flex items-center gap-0.5 ${el.frameClip ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50'}`}
                    onClick={() => h.onElementChange(el.id, { frameClip: !el.frameClip })}
                    title={el.frameClip ? '裁剪已开启' : '裁剪已关闭'}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                </button>
                {/* Auto-layout toggle */}
                <button
                    data-testid={`frame-autolayout-toggle-${el.id}`}
                    className={`p-2 rounded-lg transition-colors flex items-center gap-0.5 ${el.frameAutoLayout ? 'bg-green-50 text-green-600' : 'text-gray-400 hover:bg-gray-50'}`}
                    onClick={() => {
                        const newVal = !el.frameAutoLayout;
                        h.onElementChange(el.id, {
                            frameAutoLayout: newVal,
                            frameAutoLayoutMode: el.frameAutoLayoutMode || 'flow',
                            frameAutoLayoutGap: el.frameAutoLayoutGap ?? 14,
                            frameAutoLayoutAlign: el.frameAutoLayoutAlign || 'center',
                        });
                        if (newVal) h.scheduleAutoLayout(el.id);
                    }}
                    title={el.frameAutoLayout ? '自动排版已开启（点击关闭）' : '自动排版已关闭（点击开启，图片拖入后自动排列）'}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                </button>
                {el.frameAutoLayout && (
                    <div className="flex items-center gap-1 rounded-lg bg-emerald-50/70 px-1 py-1">
                        {([
                            ['flow', '流'],
                            ['row', '横'],
                            ['column', '竖'],
                            ['grid', '格'],
                        ] as Array<[FrameAutoLayoutMode, string]>).map(([mode, label]) => {
                            const isActive = activeLayoutMode === mode;
                            return (
                                <button
                                    key={mode}
                                    data-testid={`frame-autolayout-mode-${mode}-${el.id}`}
                                    className={`min-w-[30px] rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${isActive ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200' : 'text-emerald-600 hover:bg-white/80'}`}
                                    onClick={() => {
                                        h.onElementChange(el.id, { frameAutoLayoutMode: mode, frameAutoLayout: true });
                                        h.scheduleAutoLayout(el.id);
                                    }}
                                    title={`切换为${FRAME_LAYOUT_MODE_LABELS[mode]}布局`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}
                {el.frameAutoLayout && (
                    <>
                        <div className="w-px h-7 bg-gray-200" />
                        <div data-testid={`frame-autolayout-gap-${el.id}`}>
                            <DragNumberInput
                                label="Gap"
                                value={el.frameAutoLayoutGap ?? 14}
                                min={0}
                                step={1}
                                onChange={(value) => {
                                    h.onElementChange(el.id, { frameAutoLayoutGap: value, frameAutoLayout: true });
                                    h.scheduleAutoLayout(el.id);
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-1 rounded-lg bg-slate-50 px-1 py-1" data-testid={`frame-autolayout-align-${el.id}`}>
                            {([
                                ['start', '起'],
                                ['center', '中'],
                            ] as Array<[FrameAutoLayoutAlign, string]>).map(([align, label]) => {
                                const isActive = activeLayoutAlign === align;
                                return (
                                    <button
                                        key={align}
                                        data-testid={`frame-autolayout-align-${align}-${el.id}`}
                                        className={`min-w-[30px] rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${isActive ? 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/80'}`}
                                        onClick={() => {
                                            h.onElementChange(el.id, { frameAutoLayoutAlign: align, frameAutoLayout: true });
                                            h.scheduleAutoLayout(el.id);
                                        }}
                                        title={`切换为${FRAME_LAYOUT_ALIGN_LABELS[align]}对齐`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
                <div className="w-px h-7 bg-gray-200" />
                {/* Select all children */}
                <button
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    onClick={() => {
                        const childIds = h.getElements().filter(c => c.parentFrameId === el.id).map(c => c.id);
                        if (childIds.length > 0) h.onSelect(childIds);
                    }}
                    title="选择画板内所有元素"
                >
                    <MousePointer2 size={18} />
                </button>
                {/* Export dropdown */}
                <div className="relative">
                    <button
                        className={`p-2 rounded-lg transition-colors ${showFrameExportMenu ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
                        onClick={() => { h.setShowFrameExportMenu(showFrameExportMenu ? null : el.id); h.setShowFramePresetMenu(null); }}
                        title="导出"
                    >
                        <Download size={18} />
                        <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" className="absolute -bottom-0.5 right-0.5 opacity-60"><path d="M0 1.5l3 3 3-3H0z"/></svg>
                    </button>
                    {showFrameExportMenu && (
                        <FrameExportMenu el={el} handlersRef={handlersRef} />
                    )}
                </div>
                {/* Lock/Unlock */}
                <button
                    className={`p-2 rounded-lg transition-colors ${el.frameLocked ? 'text-amber-500 bg-amber-50' : 'text-gray-500 hover:bg-gray-50'}`}
                    onClick={() => h.onElementChange(el.id, { frameLocked: !el.frameLocked })}
                    title={el.frameLocked ? '解锁画板' : '锁定画板'}
                >
                    {el.frameLocked ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                    )}
                </button>
                {/* Delete frame */}
                <button
                    className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    onClick={() => {
                        h.getElements().filter(c => c.parentFrameId === el.id).forEach(c => {
                            h.onElementChange(c.id, { parentFrameId: undefined });
                        });
                        h.onDelete(el.id);
                    }}
                    title="删除画板"
                >
                    <Trash2 size={18} />
                </button>
            </div>
            {/* Preset menu dropdown */}
            {showFramePresetMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 min-w-[200px] z-50 animate-in fade-in zoom-in-95 duration-150">
                    {[
                        { label: '1:1', w: 1024, h: 1024, icon: '◻' },
                        { label: '2:3', w: 1024, h: 1536, icon: '▯' },
                        { label: '9:16', w: 1080, h: 1920, icon: '▯' },
                        { label: '3:2', w: 1536, h: 1024, icon: '▭' },
                        { label: '16:9', w: 1920, h: 1080, icon: '▭' },
                        { label: 'A4', w: 1024, h: 1754, icon: '🅰' },
                        { label: 'Website', w: 1366, h: 768, icon: '🌐' },
                    ].map(preset => (
                        <button
                            key={preset.label}
                            className={`flex items-center justify-between w-full px-3 py-1.5 rounded-lg hover:bg-gray-50 text-sm transition-colors ${el.framePreset === preset.label ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}
                            onClick={() => {
                                h.onElementChange(el.id, { width: preset.w, height: preset.h, framePreset: preset.label });
                                h.setShowFramePresetMenu(null);
                                if (el.frameAutoLayout) h.scheduleAutoLayout(el.id);
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400 w-4 text-center">{preset.icon}</span>
                                <span>{preset.label}</span>
                            </div>
                            <span className="text-xs text-gray-400">{preset.w}*{preset.h}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Frame export dropdown menu (PNG, PPT image, PPT editable, PDF) */
function FrameExportMenu({
    el,
    handlersRef,
}: {
    el: CanvasElement;
    handlersRef: React.RefObject<ElementHandlers>;
}) {
    const h = handlersRef.current!;
    const frameW = el.width || 400;
    const frameH = el.height || 300;

    const exportAsPng = useCallback(async () => {
        h.setShowFrameExportMenu(null);
        const canvas = document.createElement('canvas');
        canvas.width = frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = el.frameBgColor || '#FFFFFF';
        ctx.fillRect(0, 0, frameW, frameH);
        const children = h.getElements().filter(c => c.parentFrameId === el.id && c.type === 'image' && c.content);
        const doDownload = () => {
            const link = document.createElement('a');
            link.download = `${el.frameName || 'Frame'}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };
        if (children.length > 0) {
            void renderFrameImagesToCanvas(ctx, el, children).then(doDownload);
            return;
        }
        doDownload();
    }, [el, frameW, frameH, h]);

    const exportAsPptImage = useCallback(async () => {
        h.setShowFrameExportMenu(null);
        const canvas = document.createElement('canvas');
        canvas.width = frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = el.frameBgColor || '#FFFFFF';
        ctx.fillRect(0, 0, frameW, frameH);
        const children = h.getElements().filter(c => c.parentFrameId === el.id && c.type === 'image' && c.content);
        const buildPptx = () => {
            const dataUrl = canvas.toDataURL('image/png');
            const pptHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:p="urn:schemas-microsoft-com:office:powerpoint">
<head><meta charset="utf-8"><xml><o:DocumentProperties><o:Slides>1</o:Slides></o:DocumentProperties></xml></head>
<body>
<div style="width:${frameW}px;height:${frameH}px;margin:0;padding:0;">
<img src="${dataUrl}" style="width:100%;height:100%;" />
</div>
</body></html>`;
            const blob = new Blob([pptHtml], { type: 'application/vnd.ms-powerpoint' });
            const link = document.createElement('a');
            link.download = `${el.frameName || 'Frame'}.ppt`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        };
        if (children.length > 0) {
            void renderFrameImagesToCanvas(ctx, el, children).then(buildPptx);
            return;
        }
        buildPptx();
    }, [el, frameW, frameH, h]);

    const exportAsPptEditable = useCallback(async () => {
        h.setShowFrameExportMenu(null);
        const allElements = h.getElements();
        const textChildren = allElements.filter(c => c.parentFrameId === el.id && c.type === 'text');
        const imgChildren = allElements.filter(c => c.parentFrameId === el.id && c.type === 'image' && c.content);
        let slideContent = '';
        for (const child of imgChildren) {
            const dx = child.x - el.x;
            const dy = child.y - el.y;
            const src = isImageRef(child.content) ? await getImageDataUrl(child.content!) : child.content;
            slideContent += `<div style="position:absolute;left:${dx}px;top:${dy}px;width:${child.width || 200}px;height:${child.height || 200}px;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;" /></div>\n`;
        }
        textChildren.forEach(child => {
            const dx = child.x - el.x;
            const dy = child.y - el.y;
            slideContent += `<div style="position:absolute;left:${dx}px;top:${dy}px;font-size:${child.fontSize || 24}px;font-family:${child.fontFamily || 'Arial'};color:${child.color || '#000000'};">${child.content || ''}</div>\n`;
        });
        const pptHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:p="urn:schemas-microsoft-com:office:powerpoint">
<head><meta charset="utf-8"><xml><o:DocumentProperties><o:Slides>1</o:Slides></o:DocumentProperties></xml></head>
<body>
<div style="position:relative;width:${frameW}px;height:${frameH}px;background:${el.frameBgColor || '#FFFFFF'};margin:0;padding:0;overflow:hidden;">
${slideContent}
</div>
</body></html>`;
        const blob = new Blob([pptHtml], { type: 'application/vnd.ms-powerpoint' });
        const link = document.createElement('a');
        link.download = `${el.frameName || 'Frame'}-editable.ppt`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    }, [el, frameW, frameH, h]);

    const exportAsPdf = useCallback(async () => {
        h.setShowFrameExportMenu(null);
        const canvas = document.createElement('canvas');
        canvas.width = frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = el.frameBgColor || '#FFFFFF';
        ctx.fillRect(0, 0, frameW, frameH);
        const allElements = h.getElements();
        const children = allElements.filter(c => c.parentFrameId === el.id && c.type === 'image' && c.content);
        const textChildren = allElements.filter(c => c.parentFrameId === el.id && c.type === 'text');
        const buildPdf = () => {
            textChildren.forEach(child => {
                const dx = child.x - el.x;
                const dy = child.y - el.y;
                ctx.font = `${child.fontSize || 24}px ${child.fontFamily || 'sans-serif'}`;
                ctx.fillStyle = child.color || '#000000';
                ctx.textBaseline = 'top';
                ctx.fillText(child.content || '', dx, dy);
            });
            const dataUrl = canvas.toDataURL('image/png');
            const printWin = window.open('', '_blank');
            if (!printWin) return;
            printWin.document.write(`
<!DOCTYPE html>
<html><head><title>${el.frameName || 'Frame'}</title>
<style>
@page { size: ${frameW}px ${frameH}px; margin: 0; }
@media print { body { margin: 0; } }
body { margin: 0; padding: 0; width: ${frameW}px; height: ${frameH}px; }
img { width: 100%; height: 100%; display: block; }
</style></head>
<body><img src="${dataUrl}" /></body></html>`);
            printWin.document.close();
            const imgEl = printWin.document.querySelector('img');
            if (imgEl) {
                imgEl.onload = () => { printWin.print(); };
            } else {
                setTimeout(() => printWin.print(), 500);
            }
        };
        if (children.length > 0) {
            void renderFrameImagesToCanvas(ctx, el, children).then(buildPdf);
            return;
        }
        buildPdf();
    }, [el, frameW, frameH, h]);

    return (
        <div
            className="absolute bottom-full right-0 mb-1.5 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 min-w-[180px] z-[200] animate-in fade-in zoom-in-95 duration-150"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left" onClick={exportAsPng}>
                <Download size={14} className="text-gray-400" />
                下载
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left" onClick={exportAsPptImage}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>
                导出 PPT（图片）
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left" onClick={exportAsPptEditable}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>
                导出 PPT（可编辑文本）
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left" onClick={exportAsPdf}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                导出 PDF
            </button>
        </div>
    );
}

/** Mark element with pin, quick edit, and text tooltip */
function MarkContent({
    el,
    isEditingMark,
    isQuickEditing,
    quickEditPrompt,
    markTargetHasContent,
    handlersRef,
}: {
    el: CanvasElement;
    isEditingMark: boolean;
    isQuickEditing: boolean;
    quickEditPrompt: string;
    markTargetHasContent: boolean;
    handlersRef: React.RefObject<ElementHandlers>;
}) {
    const h = handlersRef.current!;

    return (
        <div className="w-full h-full relative" style={{ overflow: 'visible' }}>
            {/* Pin icon */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 drop-shadow-lg flex items-start gap-0.5" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
                <div className="relative">
                    <MapPin size={32} fill={el.color || '#EF4444'} color="white" strokeWidth={1.5} />
                    <div className="absolute top-[4px] left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                        <span className="text-[9px] font-bold" style={{ color: el.color || '#EF4444' }}>{el.markNumber || '?'}</span>
                    </div>
                </div>
                {/* Quick edit button */}
                {markTargetHasContent && !isQuickEditing && (
                    <button
                        className="mt-0.5 w-6 h-6 rounded-md bg-white border border-gray-200 shadow-md flex items-center justify-center hover:bg-purple-50 hover:border-purple-300 transition-all cursor-pointer"
                        title="快速编辑此图片"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            h.setQuickEditMarkId(el.id);
                            h.setQuickEditPrompt('');
                        }}
                    >
                        <Wand2 size={13} className="text-purple-500" />
                    </button>
                )}
            </div>
            {/* Quick edit prompt bar */}
            {isQuickEditing && el.markTargetId && (
                <div className="absolute top-9 left-1/2 -translate-x-1/2 z-30" style={{ minWidth: '240px' }} onMouseDown={(e) => e.stopPropagation()}>
                    <div className="bg-white border border-purple-200 rounded-xl shadow-xl p-2 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 px-1">
                            <Wand2 size={12} className="text-purple-500 flex-shrink-0" />
                            <span className="text-[10px] text-purple-600 font-medium">AI 快速编辑</span>
                            <span className="text-[9px] text-gray-300 ml-auto">标记#{el.markNumber}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <input
                                autoFocus
                                type="text"
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-purple-400 focus:bg-white transition-colors min-w-[180px]"
                                placeholder="输入编辑指令，如：把这里改成蓝色"
                                value={quickEditPrompt}
                                onChange={(e) => h.setQuickEditPrompt(e.target.value)}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter' && quickEditPrompt.trim()) {
                                        h.handleQuickEditSubmit(el);
                                    }
                                    if (e.key === 'Escape') {
                                        h.setQuickEditMarkId(null);
                                        h.setQuickEditPrompt('');
                                    }
                                }}
                            />
                            <button
                                className={`p-1.5 rounded-lg transition-all ${quickEditPrompt.trim() ? 'bg-purple-500 text-white hover:bg-purple-600 shadow-sm' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
                                disabled={!quickEditPrompt.trim()}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    if (quickEditPrompt.trim()) h.handleQuickEditSubmit(el);
                                }}
                            >
                                <Send size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Mark text tooltip */}
            {!isQuickEditing && (isEditingMark || el.markText) && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20" style={{ minWidth: '120px' }}>
                    {isEditingMark ? (
                        <input
                            autoFocus
                            type="text"
                            className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs shadow-lg outline-none focus:border-blue-500 w-full min-w-[150px]"
                            placeholder="输入标记备注..."
                            value={el.markText || ''}
                            onChange={(e) => h.onElementChange(el.id, { markText: e.target.value })}
                            onBlur={() => h.setEditingMarkId(null)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') h.setEditingMarkId(null);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <div className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap max-w-[200px] truncate">
                            {el.markText}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
