'use client';

import React, { useState } from 'react';
import { MousePointerClick, Frame } from 'lucide-react';
import { getCanvasElementRenderSize } from '@/lib/canvas-element-bounds';
import type { CanvasElement } from './canvas-types';
import { WorkbenchImage } from './WorkbenchImage';
import { buildStoryboardMetaChips, getStoryboardBadgeMeta, getStoryboardStatus } from './canvas-element-display-utils';
import {
    ImageGeneratingElementRenderer,
    ImageGeneratorElementRenderer,
    PathElementRenderer,
    ShapeElementRenderer,
    StoryboardPlannerElementRenderer,
    TextElementRenderer,
    VideoElementRenderer,
    VideoGeneratorElementRenderer,
} from './element-renderers';
import { FrameElementRenderer } from './FrameElementRenderer';
import { ImageElementOverlays } from './image-element-overlays';
import { MarkElementRenderer } from './MarkElementRenderer';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';
import { toCanvasElementPx } from './canvas-element-style-utils';

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
    deferImageDetailUpgrade?: boolean;
    imageDetailRequestKey?: number;
    dragPreviewOffset?: { dx: number; dy: number } | null;
    zIndex?: number;
    /** Stable ref — identity never changes → React.memo skips re-render */
    handlersRef: React.RefObject<ElementHandlers>;
}

function ImageElementRenderer({
    el,
    resolvedImageSrc,
    scale,
    isHovered,
    isSelected,
    canGenerateFromImage,
    storyboardStatus,
    storyboardChips,
    storyboardBadgeMeta,
    shouldPrioritizeImageDetail,
    shouldShowStoryboardBadge,
    deferImageDetailUpgrade,
    imageDetailRequestKey,
}: {
    el: CanvasElement;
    resolvedImageSrc?: string;
    scale: number;
    isHovered: boolean;
    isSelected: boolean;
    canGenerateFromImage: boolean;
    storyboardStatus: ReturnType<typeof getStoryboardStatus>;
    storyboardChips: string[];
    storyboardBadgeMeta: ReturnType<typeof getStoryboardBadgeMeta>;
    shouldPrioritizeImageDetail: boolean;
    shouldShowStoryboardBadge: boolean;
    deferImageDetailUpgrade?: boolean;
    imageDetailRequestKey?: number;
}) {
    if (!el.content) {
        if (!el.generatingTaskId) return null;
        return <ImageGeneratingElementRenderer el={el} />;
    }
    const renderSize = getCanvasElementRenderSize(el);

    return (
        <>
            <WorkbenchImage
                content={el.content}
                debugId={el.id}
                resolvedSrc={resolvedImageSrc}
                displayPixels={Math.max(renderSize.width, renderSize.height) * scale}
                canvasScale={scale}
                prioritizeDetail={shouldPrioritizeImageDetail}
                deferFinalUpgrade={deferImageDetailUpgrade}
                detailRequestKey={imageDetailRequestKey}
                alt="Upload"
                containerClassName="w-full h-full rounded-lg"
                imageClassName={`pointer-events-none rounded-lg transition-transform duration-200 ${isHovered && scale <= 0.18 ? 'scale-[1.08]' : ''}`}
                fit={el.imageFit || 'contain'}
                surfaceMode={el.imageSurface || 'checker'}
                loading="lazy"
                decoding="async"
            />
            <ImageElementOverlays
                el={el}
                isSelected={isSelected}
                canGenerateFromImage={canGenerateFromImage}
                storyboardStatus={storyboardStatus}
                storyboardChips={storyboardChips}
                storyboardBadgeMeta={storyboardBadgeMeta}
                shouldShowStoryboardBadge={shouldShowStoryboardBadge}
            />
        </>
    );
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
        deferImageDetailUpgrade = false,
        imageDetailRequestKey,
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
        const renderSize = getCanvasElementRenderSize(el);
        const canPrioritizeSelectedImageDetail = isSelected && selectedImageCount > 0 && selectedImageCount <= 10;
        const shouldPrioritizeImageDetail = el.type === 'image' && (isHovered || canPrioritizeSelectedImageDetail);
        const shouldShowStoryboardBadge = el.type === 'image'
            && isSelected
            && !isNotPickable
            && (storyboardStatus.hasAny || (renderSize.width * scale >= 108 && renderSize.height * scale >= 84));
        const elementPositionClassName = buildFloatingPanelPositionClassName('canvas-element-position', el.id);
        const elementPositionCss = `
.${elementPositionClassName} {
    left: ${toCanvasElementPx(el.x)};
    top: ${toCanvasElementPx(el.y)};
    width: ${toCanvasElementPx(renderSize.width)};
    height: ${toCanvasElementPx(renderSize.height)};
    z-index: ${Number.isFinite(zIndex) ? zIndex : 'auto'};
    transform: ${dragPreviewOffset ? `translate(${toCanvasElementPx(dragPreviewOffset.dx)}, ${toCanvasElementPx(dragPreviewOffset.dy)})` : 'none'};
    pointer-events: ${activeTool === 'draw' || isNotPickable ? 'none' : 'auto'};
}
`;

        return (
            <div
                data-element-id={el.id}
                className={`${elementPositionClassName} absolute group ${el.type === 'frame' ? 'z-0' : ''} ${isPickable ? 'cursor-pointer ring-4 ring-green-400 ring-offset-2 rounded-lg z-20' : ''} ${isNotPickable ? 'opacity-30 pointer-events-none' : ''} ${isLocked ? 'cursor-not-allowed' : ''}`}
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
                            h.handleMouseDown(e, el.id, el.x, el.y, renderSize.width, renderSize.height);
                        } else {
                            // Frame not selected → start selection box inside it
                            h.handleMouseDown(e, null, el.x, el.y, renderSize.width, renderSize.height, { fallbackSelectionId: el.id });
                        }
                        return;
                    }

                    if (activeTool === 'mark') {
                        e.stopPropagation();
                    }
                    h.handleMouseDown(e, el.id, el.x, el.y, renderSize.width, renderSize.height);
                }}
                onDoubleClick={() => {
                    if (isPickable || isNotPickable) return;
                    if (isLocked) return;
                    if (el.type === 'text') h.setEditingTextId(el.id);
                    if (el.type === 'video') h.setActiveVideoId(el.id);
                    if (el.type === 'mark') h.setEditingMarkId(el.id);
                    if (el.type === 'image') h.fitToElement({ ...el, width: renderSize.width, height: renderSize.height });
                }}
            >
                <style>{elementPositionCss}</style>
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
                {el.type === 'image-generator' && (
                    <ImageGeneratorElementRenderer el={el} isGeneratorSubmitting={isGeneratorSubmitting} />
                )}

                {el.type === 'storyboard-planner' && (
                    <StoryboardPlannerElementRenderer el={el} isGeneratorSubmitting={isGeneratorSubmitting} />
                )}

                {el.type === 'video-generator' && (
                    <VideoGeneratorElementRenderer el={el} isGeneratorSubmitting={isGeneratorSubmitting} />
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

                {el.type === 'image' && (
                    <ImageElementRenderer
                        el={el}
                        resolvedImageSrc={resolvedImageSrc}
                        scale={scale}
                        isHovered={isHovered}
                        isSelected={isSelected}
                        canGenerateFromImage={canGenerateFromImage}
                        storyboardStatus={storyboardStatus}
                        storyboardChips={storyboardChips}
                        storyboardBadgeMeta={storyboardBadgeMeta}
                        shouldPrioritizeImageDetail={shouldPrioritizeImageDetail}
                        shouldShowStoryboardBadge={shouldShowStoryboardBadge}
                        deferImageDetailUpgrade={deferImageDetailUpgrade}
                        imageDetailRequestKey={imageDetailRequestKey}
                    />
                )}

                {el.type === 'video' && (
                    <VideoElementRenderer el={el} />
                )}

                {el.type === 'text' && (
                    <TextElementRenderer el={el} isEditingText={isEditingText} handlersRef={handlersRef} />
                )}

                {el.type === 'shape' && (
                    <ShapeElementRenderer el={el} />
                )}

                {/* ── Frame Element ── */}
                {el.type === 'frame' && (
                    <FrameElementRenderer
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
                    <MarkElementRenderer
                        el={el}
                        isEditingMark={isEditingMark}
                        isQuickEditing={isQuickEditing}
                        quickEditPrompt={quickEditPrompt}
                        markTargetHasContent={markTargetHasContent}
                        handlersRef={handlersRef}
                    />
                )}

                {el.type === 'path' && (
                    <PathElementRenderer el={el} />
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
