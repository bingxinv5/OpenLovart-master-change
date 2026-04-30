import React from 'react';
import type { AlignGuide } from './canvas-alignment';
import type { CanvasElement } from './canvas-types';
import { CanvasElementRenderer, type ElementHandlers } from './CanvasElementRenderer';
import { CanvasAreaWorldOverlays } from './CanvasAreaOverlays';

interface CanvasAreaContentLayerProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    elementsContainerRef: React.RefObject<HTMLDivElement | null>;
    pan: { x: number; y: number };
    scale: number;
    connectorElements: CanvasElement[];
    elementMap: Map<string, CanvasElement>;
    renderElements: CanvasElement[];
    elements: CanvasElement[];
    selectedIds: string[];
    activeTool: string;
    canvasSelectMode?: 'image' | 'video' | null;
    dragPreviewState: { ids: string[]; dx: number; dy: number } | null;
    dropTargetFrameId: string | null;
    editingTextId: string | null;
    editingFrameName: string | null;
    editingMarkId: string | null;
    quickEditMarkId: string | null;
    quickEditPrompt: string;
    showFramePresetMenu: string | null;
    showFrameExportMenu: string | null;
    canGenerateFromImage: boolean;
    frameChildCounts: Map<string, number>;
    generatorSubmittingMap?: Record<string, boolean>;
    highlightedResultId?: string | null;
    highlightedElementIdSet: Set<string>;
    isDragging: boolean;
    isResizing: boolean;
    resizingElementId: string | null;
    isDrawing: boolean;
    isSelecting: boolean;
    imageDetailRequestVersions: Record<string, number>;
    renderZIndexById: Map<string, number>;
    resolvedImageSrcMap?: Record<string, string>;
    multiReferenceCandidateCount: number;
    multiSelectionBounds: { minX: number; minY: number; width: number; height: number } | null;
    multiSelectionPreviewOffset: { dx: number; dy: number } | null;
    currentPath: { points: { x: number; y: number }[] } | null;
    alignGuides: AlignGuide[];
    frameDrawBox: { startX: number; startY: number; currentX: number; currentY: number } | null;
    elementHandlersRef: React.RefObject<ElementHandlers>;
}

export function CanvasAreaContentLayer({
    containerRef,
    elementsContainerRef,
    pan,
    scale,
    connectorElements,
    elementMap,
    renderElements,
    elements,
    selectedIds,
    activeTool,
    canvasSelectMode,
    dragPreviewState,
    dropTargetFrameId,
    editingTextId,
    editingFrameName,
    editingMarkId,
    quickEditMarkId,
    quickEditPrompt,
    showFramePresetMenu,
    showFrameExportMenu,
    canGenerateFromImage,
    frameChildCounts,
    generatorSubmittingMap,
    highlightedResultId,
    highlightedElementIdSet,
    isDragging,
    isResizing,
    resizingElementId,
    isDrawing,
    isSelecting,
    imageDetailRequestVersions,
    renderZIndexById,
    resolvedImageSrcMap,
    multiReferenceCandidateCount,
    multiSelectionBounds,
    multiSelectionPreviewOffset,
    currentPath,
    alignGuides,
    frameDrawBox,
    elementHandlersRef,
}: CanvasAreaContentLayerProps) {
    return (
        <div
            ref={containerRef}
            className="w-full h-full origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, willChange: 'transform' }}
        >
            <div className="pointer-events-none absolute inset-0 h-[10000px] w-[10000px] bg-[radial-gradient(#000_1px,transparent_1px)] bg-[length:20px_20px] opacity-[0.03]" />

            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                {connectorElements.map((connector) => {
                    const fromEl = elementMap.get(connector.connectorFrom || '');
                    const toEl = elementMap.get(connector.connectorTo || '');

                    if (!fromEl || !toEl) return null;

                    const fromX = fromEl.x + (fromEl.width || 0) / 2;
                    const fromY = fromEl.y + (fromEl.height || 0) / 2;
                    const toX = toEl.x + (toEl.width || 0) / 2;
                    const toY = toEl.y + (toEl.height || 0) / 2;

                    return (
                        <g key={connector.id}>
                            <line
                                x1={fromX}
                                y1={fromY}
                                x2={toX}
                                y2={toY}
                                stroke={connector.color || '#6B7280'}
                                strokeWidth={connector.strokeWidth || 2}
                                strokeDasharray={connector.connectorStyle === 'dashed' ? '8 4' : '0'}
                                markerEnd="url(#arrowhead)"
                            />
                        </g>
                    );
                })}
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                        <polygon points="0 0, 10 3, 0 6" fill="#6B7280" />
                    </marker>
                </defs>
            </svg>

            <div className="absolute inset-0" ref={elementsContainerRef}>
                {renderElements.map((el) => {
                    const isSelected = selectedIds.includes(el.id);
                    const dragPreviewOffset = dragPreviewState?.ids.includes(el.id)
                        ? { dx: dragPreviewState.dx, dy: dragPreviewState.dy }
                        : null;
                    const baseZIndex = renderZIndexById.get(el.id) ?? 1;
                    const isPickable = !!(canvasSelectMode && (el.type === 'image' || el.type === 'video') && el.content);
                    const isNotPickable = !!(canvasSelectMode && !isPickable);
                    const isLinked = !isSelected && !isDrawing && selectedIds.some((sid) => {
                        const selectedElement = elements.find((element) => element.id === sid);
                        return selectedElement?.linkedElements?.includes(el.id) || el.linkedElements?.includes(sid);
                    });
                    const isLayerOrderHighlighted = highlightedElementIdSet.has(el.id);
                    return (
                        <CanvasElementRenderer
                            key={el.id}
                            el={el}
                            resolvedImageSrc={resolvedImageSrcMap?.[el.id]}
                            isSelected={isSelected}
                            selectedImageCount={multiReferenceCandidateCount}
                            showToolbar={isSelected && selectedIds.length === 1 && !isDragging && !isResizing}
                            isDropTarget={dropTargetFrameId === el.id}
                            isEditingText={editingTextId === el.id}
                            isEditingFrameName={editingFrameName === el.id}
                            isEditingMark={editingMarkId === el.id}
                            isQuickEditing={quickEditMarkId === el.id}
                            isLinked={isLinked}
                            isPickable={isPickable}
                            isNotPickable={isNotPickable}
                            frameChildCount={frameChildCounts.get(el.id) || 0}
                            scale={scale}
                            activeTool={activeTool}
                            quickEditPrompt={quickEditMarkId === el.id ? quickEditPrompt : ''}
                            showFramePresetMenu={showFramePresetMenu === el.id}
                            showFrameExportMenu={showFrameExportMenu === el.id}
                            canGenerateFromImage={canGenerateFromImage}
                            markTargetHasContent={!!(el.markTargetId && elements.find((target) => target.id === el.markTargetId && target.content))}
                            isGeneratorSubmitting={!!generatorSubmittingMap?.[el.id]}
                            isResultHighlighted={highlightedResultId === el.id}
                            isLayerOrderHighlighted={isLayerOrderHighlighted}
                            deferImageDetailUpgrade={isResizing && resizingElementId === el.id}
                            imageDetailRequestKey={imageDetailRequestVersions[el.id]}
                            dragPreviewOffset={dragPreviewOffset}
                            zIndex={baseZIndex}
                            handlersRef={elementHandlersRef}
                        />
                    );
                })}

                {multiSelectionBounds && !isSelecting && (
                    <div
                        className="pointer-events-none absolute z-40 rounded-xl border-2 border-blue-500/85 bg-blue-500/[0.03] shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
                        style={{
                            left: multiSelectionBounds.minX - 8,
                            top: multiSelectionBounds.minY - 8,
                            width: multiSelectionBounds.width + 16,
                            height: multiSelectionBounds.height + 16,
                            transform: multiSelectionPreviewOffset
                                ? `translate(${multiSelectionPreviewOffset.dx}px, ${multiSelectionPreviewOffset.dy}px)`
                                : undefined,
                        }}
                    >
                        <div className="absolute -top-8 left-0 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm">
                            已选 {selectedIds.length} 个元素
                        </div>
                        <div className="absolute inset-0 rounded-xl border border-dashed border-blue-400/80" />
                        <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
                        <div className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
                        <div className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
                        <div className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
                    </div>
                )}
            </div>

            <CanvasAreaWorldOverlays
                currentPath={currentPath}
                alignGuides={alignGuides}
                frameDrawBox={frameDrawBox}
                elementsLength={elements.length}
            />
        </div>
    );
}