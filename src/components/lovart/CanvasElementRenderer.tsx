'use client';

import React, { useState } from 'react';
import { MousePointerClick, Frame, Plus } from 'lucide-react';
import { getCanvasElementRenderSize } from '@/lib/canvas-element-bounds';
import type { CanvasConnectorPort, CanvasElement } from './canvas-types';
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
import { isReferenceSourceElement, isReferenceTargetElement } from './canvas-reference-connectors';
import type { ReferenceConnectionStatus } from './canvas-reference-connectors';

type ReferenceConnectionTargetFeedback = {
    elementId: string;
    port: CanvasConnectorPort;
    status: ReferenceConnectionStatus;
};

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
    isNewlyCreatedGenerator: boolean;
    isLayerOrderHighlighted: boolean;
    deferImageDetailUpgrade?: boolean;
    imageDetailRequestKey?: number;
    dragPreviewOffset?: { dx: number; dy: number } | null;
    zIndex?: number;
    referenceConnectionSourceId?: string | null;
    referenceConnectionPort?: CanvasConnectorPort | null;
    referenceConnectionTargetFeedback?: ReferenceConnectionTargetFeedback | null;
    onStartReferenceConnection?: (sourceId: string, port: CanvasConnectorPort, event?: React.MouseEvent<HTMLButtonElement>) => void;
    onCompleteReferenceConnection?: (targetId: string, targetPort?: CanvasConnectorPort) => void;
    /** Stable ref — identity never changes → React.memo skips re-render */
    handlersRef: React.RefObject<ElementHandlers>;
}

function ReferencePortButton({
    port,
    side,
    active,
    disabled,
    feedbackStatus,
    hitArea = 'default',
    onMouseDown,
    onClick,
}: {
    port: CanvasConnectorPort;
    side: 'left' | 'right';
    active: boolean;
    disabled?: boolean;
    feedbackStatus?: ReferenceConnectionStatus | null;
    hitArea?: 'default' | 'expanded';
    onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
    const zoneRef = React.useRef<HTMLButtonElement | null>(null);
    const coreRef = React.useRef<HTMLSpanElement | null>(null);
    const isOutputSide = side === 'right';
    const isExpandedHitArea = hitArea === 'expanded';
    const positionClassName = isOutputSide
        ? (isExpandedHitArea ? 'right-[-70px]' : 'right-[-62px]')
        : (isExpandedHitArea ? 'left-[-70px]' : 'left-[-62px]');
    const sizeClassName = isExpandedHitArea
        ? 'h-[72px] w-[88px] rounded-[28px]'
        : 'h-16 w-[72px] rounded-[24px]';
    const activeClassName = active
        ? 'is-active opacity-100 scale-100'
        : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 hover:opacity-100';
    const toneClassName = disabled
        ? 'border-slate-200 bg-white text-slate-400 shadow-slate-900/10'
        : 'border-[#80DDFF] bg-[#00BCFF] text-white shadow-[#00BCFF]/25 hover:bg-[#22C7FF]';
    const feedbackClassName = feedbackStatus ? `is-feedback-${feedbackStatus}` : '';
    const resetMagnet = React.useCallback(() => {
        coreRef.current?.style.setProperty('--reference-port-offset-x', '0px');
        coreRef.current?.style.setProperty('--reference-port-offset-y', '0px');
        zoneRef.current?.classList.remove('is-magnetized');
    }, []);
    const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        const rect = zoneRef.current?.getBoundingClientRect();
        const core = coreRef.current;
        if (!rect || !core) return;
        const offsetX = Math.max(-14, Math.min(14, event.clientX - (rect.left + rect.width / 2)));
        const offsetY = Math.max(-12, Math.min(12, event.clientY - (rect.top + rect.height / 2)));
        core.style.setProperty('--reference-port-offset-x', `${offsetX}px`);
        core.style.setProperty('--reference-port-offset-y', `${offsetY}px`);
        zoneRef.current?.classList.add('is-magnetized');
    }, []);

    return (
        <button
            ref={zoneRef}
            type="button"
            data-testid={isOutputSide ? 'canvas-reference-output-port' : 'canvas-reference-input-port'}
            data-reference-port-disabled={disabled ? 'true' : undefined}
            data-reference-port={port}
            data-reference-port-side={side}
            data-reference-port-hit-area={hitArea}
            onPointerMove={handlePointerMove}
            onPointerLeave={resetMagnet}
            onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (disabled) return;
                onMouseDown?.(event);
            }}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (disabled) return;
                onClick?.(event);
            }}
            className={`canvas-reference-port-zone pointer-events-auto absolute top-1/2 z-50 flex -translate-y-1/2 items-center justify-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 ${sizeClassName} ${positionClassName} ${activeClassName} ${feedbackClassName} ${disabled ? 'cursor-default saturate-75' : 'cursor-crosshair'}`}
            title={isOutputSide ? '创建参考连接' : active ? '接收参考连接' : '创建或接收参考连接'}
        >
            <span
                ref={coreRef}
                className={`canvas-reference-port flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-200 ${toneClassName}`}
            >
                <Plus size={15} strokeWidth={2.4} />
            </span>
        </button>
    );
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
        isNewlyCreatedGenerator,
        isLayerOrderHighlighted,
        deferImageDetailUpgrade = false,
        imageDetailRequestKey,
        dragPreviewOffset,
        zIndex,
        referenceConnectionSourceId,
        referenceConnectionPort,
        referenceConnectionTargetFeedback,
        onStartReferenceConnection,
        onCompleteReferenceConnection,
        handlersRef,
    }) {
        const h = handlersRef.current!;
        const [isHovered, setIsHovered] = useState(false);
        const hadDragPreviewOffsetRef = React.useRef(false);
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
        const isGeneratorBoundsAnimatedElement = el.type === 'image-generator' || el.type === 'video-generator' || el.type === 'storyboard-planner';
        const shouldPlayGeneratorCreationAnimation = isNewlyCreatedGenerator && isGeneratorBoundsAnimatedElement && !dragPreviewOffset;
        const isReferenceConnectionActive = !!referenceConnectionSourceId;
        const canStartReferenceConnection = isReferenceSourceElement(el) && !isLocked;
        const canReceiveReferenceConnection = isReferenceTargetElement(el) && !isLocked;
        const canStartGeneratorFlowConnection = canReceiveReferenceConnection && !isReferenceSourceElement(el);
        const canCompleteGeneratorLeftPort = canReceiveReferenceConnection
            && isReferenceConnectionActive
            && referenceConnectionSourceId !== el.id
            && (referenceConnectionPort === 'image-output' || referenceConnectionPort === 'generator-flow-output');
        const canCompleteGeneratorRightPort = canStartGeneratorFlowConnection
            && isReferenceConnectionActive
            && referenceConnectionSourceId !== el.id
            && referenceConnectionPort === 'generator-reference-input';
        const canCompleteImageOutputPort = canStartReferenceConnection
            && isReferenceConnectionActive
            && referenceConnectionSourceId !== el.id
            && referenceConnectionPort === 'generator-reference-input';
        const referenceFeedbackStatus = referenceConnectionTargetFeedback?.status ?? null;
        const referenceFeedbackPort = referenceConnectionTargetFeedback?.port ?? null;
        const referenceTargetFeedbackClassName = referenceFeedbackStatus
            ? `canvas-reference-target-feedback canvas-reference-target-feedback-${referenceFeedbackStatus}`
            : '';
        const isCommittingDragPreview = !dragPreviewOffset && hadDragPreviewOffsetRef.current;
        const shouldAnimateGeneratorBounds = isGeneratorBoundsAnimatedElement && !dragPreviewOffset && !isCommittingDragPreview;
        React.useEffect(() => {
            hadDragPreviewOffsetRef.current = !!dragPreviewOffset;
        });
        const elementPositionClassName = buildFloatingPanelPositionClassName('canvas-element-position', el.id);
        const generatorCreationAnimationClassName = buildFloatingPanelPositionClassName('canvas-generator-create', el.id);
        const generatorCreationAnimationKeyframesName = `${generatorCreationAnimationClassName}-keyframes`;
        const elementPositionCss = `
.${elementPositionClassName} {
    left: ${toCanvasElementPx(el.x)};
    top: ${toCanvasElementPx(el.y)};
    width: ${toCanvasElementPx(renderSize.width)};
    height: ${toCanvasElementPx(renderSize.height)};
    z-index: ${Number.isFinite(zIndex) ? zIndex : 'auto'};
    transform: ${dragPreviewOffset ? `translate(${toCanvasElementPx(dragPreviewOffset.dx)}, ${toCanvasElementPx(dragPreviewOffset.dy)})` : 'none'};
    pointer-events: ${activeTool === 'draw' || isNotPickable ? 'none' : 'auto'};
    transition: ${shouldAnimateGeneratorBounds ? 'left 280ms cubic-bezier(0.22, 1, 0.36, 1), top 280ms cubic-bezier(0.22, 1, 0.36, 1), width 280ms cubic-bezier(0.22, 1, 0.36, 1), height 280ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease' : 'none'};
    will-change: ${dragPreviewOffset ? 'transform' : shouldAnimateGeneratorBounds ? 'left, top, width, height' : 'auto'};
}

@media (prefers-reduced-motion: reduce) {
    .${elementPositionClassName} {
        transition: none;
        will-change: auto;
    }
}
`;
        const generatorCreationAnimationCss = shouldPlayGeneratorCreationAnimation ? `
@keyframes ${generatorCreationAnimationKeyframesName} {
    0% {
        opacity: 0.56;
        transform: scaleX(0.958) scaleY(0.996);
        clip-path: inset(6% 43% 6% 43% round 18px);
    }
    58% {
        opacity: 0.9;
        transform: scaleX(0.987) scaleY(0.999);
        clip-path: inset(1% 13% 1% 13% round 18px);
    }
    100% {
        opacity: 1;
        transform: scale(1);
        clip-path: inset(0% 0% 0% 0% round 18px);
    }
}

.${generatorCreationAnimationClassName} {
    transform-origin: center center;
    animation: ${generatorCreationAnimationKeyframesName} 190ms cubic-bezier(0.2, 0.72, 0.24, 1) both;
    will-change: transform, opacity, clip-path;
}

@media (prefers-reduced-motion: reduce) {
    .${generatorCreationAnimationClassName} {
        animation: none;
        will-change: auto;
    }
}
` : '';
        const visualLayerClassName = shouldPlayGeneratorCreationAnimation
            ? `${generatorCreationAnimationClassName} absolute inset-0`
            : 'absolute inset-0';

        return (
            <div
                data-element-id={el.id}
                data-element-type={el.type}
                className={`${elementPositionClassName} absolute group ${referenceTargetFeedbackClassName} ${el.type === 'frame' ? 'z-0' : ''} ${isPickable ? 'cursor-pointer ring-4 ring-green-400 ring-offset-2 rounded-lg z-20' : ''} ${isNotPickable ? 'opacity-30 pointer-events-none' : ''} ${isLocked ? 'cursor-not-allowed' : ''}`}
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
                {generatorCreationAnimationCss && <style>{generatorCreationAnimationCss}</style>}
                <div className={visualLayerClassName}>
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
                    <div className="canvas-linked-element-highlight pointer-events-none absolute inset-0 rounded-lg" />
                )}

                {/* ── Selection Border & Handles ── */}
                {isSelected && (
                    <>
                        <div className="pointer-events-none absolute inset-0 z-30 rounded-lg border-2 border-blue-500" />
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
                </div>

                {canStartReferenceConnection && (
                    <ReferencePortButton
                        port="image-output"
                        side="right"
                        active={(referenceConnectionSourceId === el.id && referenceConnectionPort === 'image-output') || canCompleteImageOutputPort}
                        disabled={referenceFeedbackPort === 'image-output' && referenceFeedbackStatus !== 'valid'}
                        feedbackStatus={referenceFeedbackPort === 'image-output' ? referenceFeedbackStatus : null}
                        hitArea="expanded"
                        onMouseDown={(event) => {
                            if (canCompleteImageOutputPort) return;
                            onStartReferenceConnection?.(el.id, 'image-output', event);
                        }}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (canCompleteImageOutputPort) {
                                onCompleteReferenceConnection?.(el.id, 'image-output');
                            }
                        }}
                    />
                )}

                {canReceiveReferenceConnection && (
                    <ReferencePortButton
                        port="generator-reference-input"
                        side="left"
                        active={(referenceConnectionSourceId === el.id && referenceConnectionPort === 'generator-reference-input') || canCompleteGeneratorLeftPort}
                        disabled={referenceFeedbackPort === 'generator-reference-input' && referenceFeedbackStatus !== 'valid'}
                        feedbackStatus={referenceFeedbackPort === 'generator-reference-input' ? referenceFeedbackStatus : null}
                        onMouseDown={(event) => {
                            if (canCompleteGeneratorLeftPort) return;
                            onStartReferenceConnection?.(el.id, 'generator-reference-input', event);
                        }}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (canCompleteGeneratorLeftPort) {
                                onCompleteReferenceConnection?.(el.id, 'generator-reference-input');
                            }
                        }}
                    />
                )}

                {canStartGeneratorFlowConnection && (
                    <ReferencePortButton
                        port="generator-flow-output"
                        side="right"
                        active={(referenceConnectionSourceId === el.id && referenceConnectionPort === 'generator-flow-output') || canCompleteGeneratorRightPort}
                        disabled={referenceFeedbackPort === 'generator-flow-output' && referenceFeedbackStatus !== 'valid'}
                        feedbackStatus={referenceFeedbackPort === 'generator-flow-output' ? referenceFeedbackStatus : null}
                        onMouseDown={(event) => {
                            if (canCompleteGeneratorRightPort) return;
                            onStartReferenceConnection?.(el.id, 'generator-flow-output', event);
                        }}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (canCompleteGeneratorRightPort) {
                                onCompleteReferenceConnection?.(el.id, 'generator-flow-output');
                            }
                        }}
                    />
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
