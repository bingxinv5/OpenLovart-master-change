'use client';

import React, { useState } from 'react';
import { MousePointerClick, MapPin, Wand2, Send, Frame, Download, Trash2, MousePointer2 } from 'lucide-react';
import { DragNumberInput, StableColorInput } from './canvas-ui-utils';
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
import { FrameExportMenu } from './frame-export-menu';
import { FRAME_LAYOUT_ALIGN_LABELS, FRAME_LAYOUT_MODE_LABELS, FrameAutoLayoutControls, FramePresetButton, FramePresetMenu } from './frame-toolbar-controls';
import { ImageElementOverlays } from './image-element-overlays';
import { buildFloatingPanelPositionClassName } from './floating-panel-position';

function toCanvasElementPx(value: number | undefined) {
    return `${Number.isFinite(value) ? value : 0}px`;
}

function sanitizeElementCssColor(value: string | undefined, fallback = '#FFFFFF') {
    const color = (value || '').trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
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

    return (
        <>
            <WorkbenchImage
                content={el.content}
                debugId={el.id}
                resolvedSrc={resolvedImageSrc}
                displayPixels={Math.max(el.width || 400, el.height || 400) * scale}
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
        const canPrioritizeSelectedImageDetail = isSelected && selectedImageCount > 0 && selectedImageCount <= 10;
        const shouldPrioritizeImageDetail = el.type === 'image' && (isHovered || canPrioritizeSelectedImageDetail);
        const shouldShowStoryboardBadge = el.type === 'image'
            && isSelected
            && !isNotPickable
            && (storyboardStatus.hasAny || ((el.width || 0) * scale >= 108 && (el.height || 0) * scale >= 84));
        const elementPositionClassName = buildFloatingPanelPositionClassName('canvas-element-position', el.id);
        const elementPositionCss = `
.${elementPositionClassName} {
    left: ${toCanvasElementPx(el.x)};
    top: ${toCanvasElementPx(el.y)};
    width: ${toCanvasElementPx(el.width)};
    height: ${toCanvasElementPx(el.height)};
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
    const frameColorClassName = buildFloatingPanelPositionClassName('canvas-frame-color', el.id);
    const frameColorCss = `.${frameColorClassName} { background-color: ${sanitizeElementCssColor(el.frameBgColor)}; }`;

    return (
        <div className="w-full h-full relative overflow-visible">
            <style>{frameColorCss}</style>
            {/* Frame label */}
            <div className="absolute -top-6 left-0 flex items-center gap-1.5 select-none whitespace-nowrap">
                <Frame size={12} className="text-blue-500" />
                {isEditingFrameName ? (
                    <input
                        autoFocus
                        type="text"
                        title="编辑画板名称"
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
                className={`${frameColorClassName} w-full h-full border rounded-sm transition-colors ${el.frameClip ? 'overflow-hidden' : 'overflow-visible'} ${
                    isDropTarget
                        ? 'border-blue-500 border-2 shadow-lg shadow-blue-100'
                        : el.groupFrame
                            ? 'border-violet-400 border-2 bg-violet-50/30'
                            : 'border-gray-300'
                }`}
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
    const frameColorClassName = buildFloatingPanelPositionClassName('canvas-frame-toolbar-color', el.id);
    const frameColorCss = `.${frameColorClassName} { background-color: ${sanitizeElementCssColor(el.frameBgColor)}; }`;

    return (
        <div
            className="absolute -top-14 left-1/2 -translate-x-1/2 z-30"
            onMouseDown={(e) => e.stopPropagation()}
            data-testid={`frame-toolbar-${el.id}`}
        >
            <style>{frameColorCss}</style>
            <div className="flex items-center bg-white rounded-xl shadow-xl border border-gray-200 px-3 py-2 gap-2">
                <FramePresetButton el={el} showFramePresetMenu={showFramePresetMenu} handlersRef={handlersRef} />
                <div className="w-px h-7 bg-gray-200" />
                {/* W/H drag inputs */}
                <DragNumberInput label="W" value={el.width || 0} onChange={(v) => { h.onElementChange(el.id, { width: v, framePreset: 'Custom' }); if (el.frameAutoLayout) h.scheduleAutoLayout(el.id); }} />
                <DragNumberInput label="H" value={el.height || 0} onChange={(v) => { h.onElementChange(el.id, { height: v, framePreset: 'Custom' }); if (el.frameAutoLayout) h.scheduleAutoLayout(el.id); }} />
                <div className="w-px h-7 bg-gray-200" />
                {/* Background color */}
                <div className="relative">
                    <div
                        className={`${frameColorClassName} w-8 h-8 rounded-lg border border-gray-200 cursor-pointer relative overflow-hidden hover:ring-2 hover:ring-blue-200 transition-all`}
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
                <FrameAutoLayoutControls el={el} handlersRef={handlersRef} />
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
            {showFramePresetMenu && (
                <FramePresetMenu el={el} handlersRef={handlersRef} />
            )}
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
    const markColorClassName = buildFloatingPanelPositionClassName('canvas-mark-color', el.id);
    const markColorCss = `.${markColorClassName} { color: ${sanitizeElementCssColor(el.color, '#EF4444')}; }`;

    return (
        <div className="w-full h-full relative overflow-visible">
            <style>{markColorCss}</style>
            {/* Pin icon */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)] flex items-start gap-0.5">
                <div className="relative">
                    <MapPin size={32} fill={el.color || '#EF4444'} color="white" strokeWidth={1.5} />
                    <div className="absolute top-[4px] left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                        <span className={`${markColorClassName} text-[9px] font-bold`}>{el.markNumber || '?'}</span>
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
                <div className="absolute top-9 left-1/2 -translate-x-1/2 z-30 min-w-[240px]" onMouseDown={(e) => e.stopPropagation()}>
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
                                title="提交快速编辑"
                                aria-label="提交快速编辑"
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
                <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 min-w-[120px]">
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
