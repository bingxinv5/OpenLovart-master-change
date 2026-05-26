import React from 'react';
import type { AlignGuide } from './canvas-alignment';
import type { CanvasConnectorPort, CanvasElement } from './canvas-types';
import { CanvasElementRenderer, type ElementHandlers } from './CanvasElementRenderer';
import { CanvasAreaWorldOverlays } from './CanvasAreaOverlays';
import {
    buildConnectorPath,
    getOutgoingReferenceConnectors,
    getConnectorPortPoint,
    getConnectorRenderData,
    getIncomingReferenceConnectors,
    isReferenceSourceElement,
    isReferenceTargetElement,
    type ReferenceConnectionStatus,
} from './canvas-reference-connectors';

const CANVAS_REFERENCE_BLUE = '#149BFF';
const CANVAS_REFERENCE_FLOW_CORE = '#63DCFF';
const CANVAS_REFERENCE_FLOW_PULSE = '#BDF3FF';
const CONNECTOR_HOVER_FLOW_DELAY_MS = 50;
const CONNECTOR_DELETE_AFFORDANCE_DELAY_MS = 1000;
const CONNECTOR_PRECISE_HIT_RADIUS_PX = 7.5;
const MIN_VISUAL_CONNECTOR_STROKE_PX = 1.18;

export type CanvasReferenceConnectionTargetFeedback = {
    elementId: string;
    port: CanvasConnectorPort;
    status: ReferenceConnectionStatus;
    duplicateConnectorId?: string;
    point: { x: number; y: number };
};

function isGeneratorFlowConnectorElement(connector: CanvasElement) {
    return connector.connectorFromPort === 'generator-flow-output'
        && connector.connectorToPort === 'generator-reference-input';
}

function toLayerPx(value: number | undefined) {
    return `${Number.isFinite(value) ? value : 0}px`;
}

function getDevicePixelRatio() {
    return typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
}

function snapToDevicePixel(value: number, devicePixelRatio: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * devicePixelRatio) / devicePixelRatio;
}

function getMinimumScreenStrokeWidth(strokeWidth: number, scale: number, minimumScreenWidth: number) {
    if (!Number.isFinite(strokeWidth) || strokeWidth <= 0 || !Number.isFinite(scale) || scale <= 0) {
        return strokeWidth;
    }

    return Math.max(strokeWidth, minimumScreenWidth / scale);
}

function isElementConnectedToSelectionByConnector(elementId: string, selectedIds: string[], connectors: CanvasElement[]) {
    if (selectedIds.length === 0) return false;
    const selectedIdSet = new Set(selectedIds);

    return connectors.some((connector) => {
        if (connector.type !== 'connector') return false;
        if (selectedIdSet.has(connector.id)) {
            return connector.connectorFrom === elementId || connector.connectorTo === elementId;
        }

        return !!connector.connectorFrom
            && !!connector.connectorTo
            && (
                (selectedIdSet.has(connector.connectorFrom) && connector.connectorTo === elementId)
                || (selectedIdSet.has(connector.connectorTo) && connector.connectorFrom === elementId)
            );
    });
}

function distanceToSegment(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0) {
        return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
}

function getDistanceToVisiblePath(
    path: SVGPathElement,
    pointer: { x: number; y: number },
    radius = CONNECTOR_PRECISE_HIT_RADIUS_PX,
) {
    const bounds = path.getBoundingClientRect();
    if (
        pointer.x < bounds.left - radius
        || pointer.x > bounds.right + radius
        || pointer.y < bounds.top - radius
        || pointer.y > bounds.bottom + radius
    ) {
        return Number.POSITIVE_INFINITY;
    }

    const matrix = path.getScreenCTM();
    if (!matrix) {
        return Number.POSITIVE_INFINITY;
    }

    const totalLength = path.getTotalLength();
    if (!Number.isFinite(totalLength) || totalLength <= 0) {
        return Number.POSITIVE_INFINITY;
    }

    const sampleCount = Math.max(24, Math.min(120, Math.ceil(totalLength / 18)));
    const firstLocalPoint = path.getPointAtLength(0);
    let previous = new DOMPoint(firstLocalPoint.x, firstLocalPoint.y).matrixTransform(matrix);
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index <= sampleCount; index += 1) {
        const localPoint = path.getPointAtLength((totalLength * index) / sampleCount);
        const current = new DOMPoint(localPoint.x, localPoint.y).matrixTransform(matrix);
        bestDistance = Math.min(bestDistance, distanceToSegment(pointer, previous, current));
        previous = current;
    }

    return bestDistance;
}

function getNearestVisiblePathConnectorHit(root: ParentNode, clientX: number, clientY: number, radius = CONNECTOR_PRECISE_HIT_RADIUS_PX) {
    const pointer = { x: clientX, y: clientY };
    const paths = Array.from(root.querySelectorAll<SVGPathElement>('.canvas-reference-connector-hit-path'));
    let nearestConnectorId: string | null = null;
    let nearestPath: SVGPathElement | null = null;
    let nearestDistance = radius;

    for (const path of paths) {
        const connectorId = path.dataset.connectorId;
        if (!connectorId) {
            continue;
        }
        const distance = getDistanceToVisiblePath(path, pointer, radius);
        if (distance <= nearestDistance) {
            nearestDistance = distance;
            nearestConnectorId = connectorId;
            nearestPath = path;
        }
    }

    return nearestConnectorId && nearestPath ? { connectorId: nearestConnectorId, path: nearestPath } : null;
}

function getNearestVisiblePathConnectorId(event: React.MouseEvent<SVGPathElement>, radius = CONNECTOR_PRECISE_HIT_RADIUS_PX) {
    const root = event.currentTarget.ownerSVGElement ?? event.currentTarget;
    return getNearestVisiblePathConnectorHit(root, event.clientX, event.clientY, radius)?.connectorId ?? null;
}

function getCanvasPointFromPath(path: SVGPathElement, clientX: number, clientY: number) {
    const matrix = path.getScreenCTM();
    if (!matrix) {
        return null;
    }
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
}

function getCanvasPointFromPathEvent(event: React.MouseEvent<SVGPathElement>) {
    return getCanvasPointFromPath(event.currentTarget, event.clientX, event.clientY);
}

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
    newlyCreatedGeneratorMap?: Record<string, boolean>;
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
    referenceConnectionSourceId?: string | null;
    referenceConnectionPort?: CanvasConnectorPort | null;
    referenceConnectionPoint?: { x: number; y: number } | null;
    referenceConnectionTargetFeedback?: CanvasReferenceConnectionTargetFeedback | null;
    onStartReferenceConnection?: (sourceId: string, port: CanvasConnectorPort, event?: React.MouseEvent<HTMLButtonElement>) => void;
    onCompleteReferenceConnection?: (targetId: string, targetPort?: CanvasConnectorPort) => void;
    onSelectConnector?: (connectorId: string) => void;
    onDeleteConnector?: (connectorId: string) => void;
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
    newlyCreatedGeneratorMap,
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
    referenceConnectionSourceId,
    referenceConnectionPort,
    referenceConnectionPoint,
    referenceConnectionTargetFeedback,
    onStartReferenceConnection,
    onCompleteReferenceConnection,
    onSelectConnector,
    onDeleteConnector,
}: CanvasAreaContentLayerProps) {
    const selectedReferenceConnectorIds = React.useMemo(() => new Set(
        selectedIds.length === 1 ? selectedIds.flatMap((selectedId) => {
            const element = elementMap.get(selectedId);
            const connectorIds: string[] = [];
            if (isReferenceTargetElement(element)) {
                connectorIds.push(...getIncomingReferenceConnectors(selectedId, elements, elementMap).map((connector) => connector.id));
            }

            if (isReferenceSourceElement(element)) {
                connectorIds.push(...getOutgoingReferenceConnectors(selectedId, elements, elementMap).map((connector) => connector.id));
            }

            return connectorIds;
        }) : [],
    ), [elementMap, elements, selectedIds]);
    const connectorRenderElementMap = React.useMemo(() => {
        if (!dragPreviewState || dragPreviewState.ids.length === 0 || (dragPreviewState.dx === 0 && dragPreviewState.dy === 0)) {
            return elementMap;
        }

        const draggedIdSet = new Set(dragPreviewState.ids);
        const nextElementMap = new Map(elementMap);
        draggedIdSet.forEach((elementId) => {
            const element = nextElementMap.get(elementId);
            if (!element) {
                return;
            }

            nextElementMap.set(elementId, {
                ...element,
                x: element.x + dragPreviewState.dx,
                y: element.y + dragPreviewState.dy,
            });
        });

        return nextElementMap;
    }, [dragPreviewState, elementMap]);
    const semanticConnectorIds = React.useMemo(() => new Set(
        connectorElements.flatMap((connector) => {
            const renderData = getConnectorRenderData(connector, connectorRenderElementMap);
            return renderData && (renderData.isReferenceConnector || isGeneratorFlowConnectorElement(connector))
                ? [connector.id]
                : [];
        }),
    ), [connectorElements, connectorRenderElementMap]);
    const [hoverFlowConnectorId, setHoverFlowConnectorId] = React.useState<string | null>(null);
    const [hoverDeleteAffordance, setHoverDeleteAffordance] = React.useState<{ connectorId: string; x: number; y: number } | null>(null);
    const hoverFlowTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverDeleteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverFlowCandidateRef = React.useRef<string | null>(null);
    const latestHoverCanvasPointRef = React.useRef<{ x: number; y: number } | null>(null);

    const clearHoverFlowTimer = React.useCallback(() => {
        if (hoverFlowTimerRef.current) {
            clearTimeout(hoverFlowTimerRef.current);
            hoverFlowTimerRef.current = null;
        }
        if (hoverDeleteTimerRef.current) {
            clearTimeout(hoverDeleteTimerRef.current);
            hoverDeleteTimerRef.current = null;
        }
    }, []);

    const scheduleConnectorHover = React.useCallback((connectorId: string, canvasPoint: { x: number; y: number } | null, enableFlow: boolean) => {
        if (canvasPoint) {
            latestHoverCanvasPointRef.current = canvasPoint;
        }

        const isNewCandidate = hoverFlowCandidateRef.current !== connectorId;
        if (isNewCandidate) {
            clearHoverFlowTimer();
            hoverFlowCandidateRef.current = connectorId;
            setHoverFlowConnectorId(null);
            setHoverDeleteAffordance(null);
        }

        if (enableFlow && !hoverFlowTimerRef.current && hoverFlowConnectorId !== connectorId) {
            hoverFlowTimerRef.current = setTimeout(() => {
                if (hoverFlowCandidateRef.current === connectorId) {
                    setHoverFlowConnectorId(connectorId);
                }
                hoverFlowTimerRef.current = null;
            }, CONNECTOR_HOVER_FLOW_DELAY_MS);
        } else if (!enableFlow && hoverFlowConnectorId) {
            setHoverFlowConnectorId(null);
        }

        if (!hoverDeleteTimerRef.current && hoverDeleteAffordance?.connectorId !== connectorId) {
            hoverDeleteTimerRef.current = setTimeout(() => {
                const point = latestHoverCanvasPointRef.current;
                if (hoverFlowCandidateRef.current === connectorId && point) {
                    setHoverDeleteAffordance({ connectorId, x: point.x, y: point.y });
                }
                hoverDeleteTimerRef.current = null;
            }, CONNECTOR_DELETE_AFFORDANCE_DELAY_MS);
        }
    }, [clearHoverFlowTimer, hoverDeleteAffordance?.connectorId, hoverFlowConnectorId]);

    const clearHoverFlow = React.useCallback((connectorId?: string) => {
        clearHoverFlowTimer();
        if (!connectorId || hoverFlowCandidateRef.current === connectorId) {
            hoverFlowCandidateRef.current = null;
        }
        if (!connectorId || hoverDeleteAffordance?.connectorId === connectorId) {
            setHoverDeleteAffordance(null);
        }
        setHoverFlowConnectorId((current) => (!connectorId || current === connectorId ? null : current));
    }, [clearHoverFlowTimer, hoverDeleteAffordance?.connectorId]);

    React.useEffect(() => () => clearHoverFlowTimer(), [clearHoverFlowTimer]);

    const handleLayerMouseMove = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (referenceConnectionSourceId) {
            return;
        }
        if (event.target instanceof Element && event.target.closest('.canvas-reference-connector-delete-button')) {
            return;
        }
        const root = containerRef.current;
        if (!root) {
            return;
        }
        const nearestHit = getNearestVisiblePathConnectorHit(root, event.clientX, event.clientY);
        if (!nearestHit) {
            clearHoverFlow();
            return;
        }
        scheduleConnectorHover(
            nearestHit.connectorId,
            getCanvasPointFromPath(nearestHit.path, event.clientX, event.clientY),
            semanticConnectorIds.has(nearestHit.connectorId),
        );
    }, [clearHoverFlow, containerRef, referenceConnectionSourceId, scheduleConnectorHover, semanticConnectorIds]);
    const referenceConnectionSource = referenceConnectionSourceId ? connectorRenderElementMap.get(referenceConnectionSourceId) : undefined;
    const draftReferencePath = referenceConnectionSource && referenceConnectionPoint
        ? buildConnectorPath(
            getConnectorPortPoint(referenceConnectionSource, referenceConnectionPort || 'image-output'),
            referenceConnectionPoint,
            {
                fromPort: referenceConnectionPort || 'image-output',
                toPort: referenceConnectionTargetFeedback?.port,
            },
        )
        : null;
    const draftReferenceStatus = referenceConnectionTargetFeedback?.status ?? null;
    const canvasRenderScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const devicePixelRatio = getDevicePixelRatio();
    const renderPan = {
        x: snapToDevicePixel(pan.x, devicePixelRatio),
        y: snapToDevicePixel(pan.y, devicePixelRatio),
    };
    const viewportStrokeScale = canvasRenderScale < 1 ? 1 / canvasRenderScale : 1;
    const generatorNodeEdgeWidth = 1 / canvasRenderScale;
    const getReadableStrokeWidth = (strokeWidth: number) => getMinimumScreenStrokeWidth(
        strokeWidth,
        canvasRenderScale,
        MIN_VISUAL_CONNECTOR_STROKE_PX,
    );
    const getViewportStableStrokeWidth = (strokeWidth: number) => strokeWidth * viewportStrokeScale;
    const contentLayerCss = `
.canvas-content-layer-transform {
    --canvas-scale: ${canvasRenderScale};
    --canvas-low-zoom-stroke-scale: ${viewportStrokeScale};
    --canvas-tool-node-edge-width: ${toLayerPx(generatorNodeEdgeWidth)};
    --canvas-linked-highlight-width: ${toLayerPx(generatorNodeEdgeWidth)};
    transform: translate(${toLayerPx(renderPan.x)}, ${toLayerPx(renderPan.y)}) scale(${canvasRenderScale});
    will-change: transform;
}

.canvas-multi-selection-bounds {
    left: ${toLayerPx(multiSelectionBounds ? multiSelectionBounds.minX - 8 : 0)};
    top: ${toLayerPx(multiSelectionBounds ? multiSelectionBounds.minY - 8 : 0)};
    width: ${toLayerPx(multiSelectionBounds ? multiSelectionBounds.width + 16 : 0)};
    height: ${toLayerPx(multiSelectionBounds ? multiSelectionBounds.height + 16 : 0)};
    transform: ${multiSelectionPreviewOffset ? `translate(${toLayerPx(multiSelectionPreviewOffset.dx)}, ${toLayerPx(multiSelectionPreviewOffset.dy)})` : 'none'};
}
${hoverDeleteAffordance ? `
.canvas-reference-connector-delete-position {
    left: ${toLayerPx(hoverDeleteAffordance.x)};
    top: ${toLayerPx(hoverDeleteAffordance.y)};
}` : ''}
`;

    return (
        <div
            ref={containerRef}
            className="canvas-content-layer-transform w-full h-full origin-top-left"
            onMouseMove={handleLayerMouseMove}
            onMouseLeave={() => clearHoverFlow()}
        >
            <style>{contentLayerCss}</style>
            <div className="canvas-grid-layer pointer-events-none absolute inset-0 h-[10000px] w-[10000px]" />

            <svg className="canvas-reference-connector-layer absolute inset-0 w-full h-full overflow-visible">
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                        <polygon points="0 0, 10 3, 0 6" fill="#6B7280" />
                    </marker>
                </defs>
                {connectorElements.map((connector) => {
                    const renderData = getConnectorRenderData(connector, connectorRenderElementMap);
                    if (!renderData) return null;
                    const isConnectorSelected = selectedIds.includes(connector.id);
                    const isGeneratorFlowConnector = isGeneratorFlowConnectorElement(connector);
                    const isSemanticConnector = renderData.isReferenceConnector || isGeneratorFlowConnector;
                    const isGeneratorFlowEndpointSelected = isGeneratorFlowConnector
                        && !!connector.connectorFrom
                        && !!connector.connectorTo
                        && selectedIds.length === 1
                        && (selectedIds.includes(connector.connectorFrom) || selectedIds.includes(connector.connectorTo));
                    const isFlowHighlighted = selectedReferenceConnectorIds.has(connector.id)
                        || (renderData.isReferenceConnector && isConnectorSelected)
                        || (isGeneratorFlowConnector && (isConnectorSelected || isGeneratorFlowEndpointSelected))
                        || (isSemanticConnector && hoverFlowConnectorId === connector.id);
                    const connectorColor = isSemanticConnector ? CANVAS_REFERENCE_BLUE : connector.color || '#6B7280';
                    const connectorWidth = connector.strokeWidth || (isSemanticConnector ? 2.25 : 2);
                    const readableConnectorWidth = getReadableStrokeWidth(connectorWidth);
                    const readableSelectedConnectorWidth = getReadableStrokeWidth(connectorWidth + 1.5);

                    return (
                        <g
                            key={connector.id}
                            className={isFlowHighlighted ? 'canvas-reference-connector is-flow-active' : 'canvas-reference-connector'}
                            data-connector-id={connector.id}
                            data-from-id={connector.connectorFrom || undefined}
                            data-to-id={connector.connectorTo || undefined}
                            data-from-port={connector.connectorFromPort || undefined}
                            data-to-port={connector.connectorToPort || undefined}
                        >
                            <path
                                d={renderData.path}
                                stroke={isConnectorSelected && !isSemanticConnector ? '#2563EB' : connectorColor}
                                strokeWidth={isConnectorSelected ? readableSelectedConnectorWidth : readableConnectorWidth}
                                strokeDasharray={connector.connectorStyle === 'dashed' ? '8 4' : '0'}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                                opacity={isSemanticConnector ? 0.9 : 0.72}
                                markerEnd={isSemanticConnector ? undefined : 'url(#arrowhead)'}
                                pointerEvents="none"
                            />
                            {isFlowHighlighted && (
                                <>
                                    <path
                                        className="canvas-reference-flow-path canvas-reference-flow-aura-path"
                                        d={renderData.path}
                                        stroke={CANVAS_REFERENCE_BLUE}
                                        strokeWidth={getReadableStrokeWidth(Math.max(8, connectorWidth + 6))}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="none"
                                        pathLength={1}
                                        pointerEvents="none"
                                    />
                                    <path
                                        className="canvas-reference-flow-path canvas-reference-flow-core-path"
                                        d={renderData.path}
                                        stroke={CANVAS_REFERENCE_FLOW_CORE}
                                        strokeWidth={getReadableStrokeWidth(Math.max(3.75, connectorWidth + 1.3))}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="none"
                                        pathLength={1}
                                        pointerEvents="none"
                                    />
                                    <path
                                        className="canvas-reference-flow-path canvas-reference-flow-pulse-path"
                                        d={renderData.path}
                                        stroke={CANVAS_REFERENCE_FLOW_PULSE}
                                        strokeWidth={getReadableStrokeWidth(Math.max(6, connectorWidth + 3.75))}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="none"
                                        pathLength={1}
                                        pointerEvents="none"
                                    />
                                </>
                            )}
                        </g>
                    );
                })}
                {draftReferencePath && (
                    <path
                        className={`canvas-reference-draft-path${draftReferenceStatus ? ` is-${draftReferenceStatus}` : ''}`}
                        d={draftReferencePath}
                        stroke={CANVAS_REFERENCE_BLUE}
                        strokeWidth={getReadableStrokeWidth(2.5)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="7 7"
                        fill="none"
                        pointerEvents="none"
                    />
                )}
            </svg>

            <div className="pointer-events-none absolute inset-0 z-40" ref={elementsContainerRef}>
                {renderElements.map((el) => {
                    const isSelected = selectedIds.includes(el.id);
                    const dragPreviewOffset = dragPreviewState?.ids.includes(el.id)
                        ? { dx: dragPreviewState.dx, dy: dragPreviewState.dy }
                        : null;
                    const baseZIndex = renderZIndexById.get(el.id) ?? 1;
                    const isPickable = !!(canvasSelectMode && el.content && (
                        canvasSelectMode === 'video'
                            ? (el.type === 'image' || el.type === 'video')
                            : el.type === 'image'
                    ));
                    const isNotPickable = !!(canvasSelectMode && !isPickable);
                    const isLinked = !isSelected
                        && !isDrawing
                        && isElementConnectedToSelectionByConnector(el.id, selectedIds, connectorElements);
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
                            isNewlyCreatedGenerator={!!newlyCreatedGeneratorMap?.[el.id]}
                            isLayerOrderHighlighted={isLayerOrderHighlighted}
                            deferImageDetailUpgrade={isResizing && resizingElementId === el.id}
                            imageDetailRequestKey={imageDetailRequestVersions[el.id]}
                            dragPreviewOffset={dragPreviewOffset}
                            zIndex={baseZIndex}
                            referenceConnectionSourceId={referenceConnectionSourceId}
                            referenceConnectionPort={referenceConnectionPort}
                            referenceConnectionTargetFeedback={referenceConnectionTargetFeedback?.elementId === el.id ? referenceConnectionTargetFeedback : null}
                            onStartReferenceConnection={onStartReferenceConnection}
                            onCompleteReferenceConnection={onCompleteReferenceConnection}
                            handlersRef={elementHandlersRef}
                        />
                    );
                })}

                {multiSelectionBounds && !isSelecting && (
                    <div
                        className="canvas-multi-selection-bounds pointer-events-none absolute z-40 rounded-xl border-2 border-blue-500/85 bg-blue-500/[0.03] shadow-[0_0_0_1px_rgba(59,130,246,0.15)]"
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

            <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
                {connectorElements.map((connector) => {
                    const renderData = getConnectorRenderData(connector, connectorRenderElementMap);
                    if (!renderData) return null;
                    const isSemanticConnector = renderData.isReferenceConnector || isGeneratorFlowConnectorElement(connector);
                    const connectorWidth = connector.strokeWidth || (isSemanticConnector ? 2.25 : 2);
                    return (
                        <path
                            key={`hit-${connector.id}`}
                            className="canvas-reference-connector-hit-path"
                            data-connector-id={connector.id}
                            d={renderData.path}
                            stroke="transparent"
                            strokeWidth={getViewportStableStrokeWidth(Math.max(20, connectorWidth + 16))}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                            pointerEvents="stroke"
                            onMouseDown={(event) => {
                                if (!getNearestVisiblePathConnectorId(event)) {
                                    clearHoverFlow();
                                    return;
                                }
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                            onClick={(event) => {
                                const nearestConnectorId = getNearestVisiblePathConnectorId(event);
                                if (!nearestConnectorId) {
                                    clearHoverFlow();
                                    return;
                                }
                                event.preventDefault();
                                event.stopPropagation();
                                onSelectConnector?.(nearestConnectorId);
                            }}
                            onMouseEnter={(event) => {
                                const nearestConnectorId = getNearestVisiblePathConnectorId(event);
                                if (!nearestConnectorId) {
                                    clearHoverFlow();
                                    return;
                                }
                                scheduleConnectorHover(nearestConnectorId, getCanvasPointFromPathEvent(event), semanticConnectorIds.has(nearestConnectorId));
                            }}
                            onMouseMove={(event) => {
                                const nearestConnectorId = getNearestVisiblePathConnectorId(event);
                                if (!nearestConnectorId) {
                                    clearHoverFlow();
                                    return;
                                }
                                scheduleConnectorHover(nearestConnectorId, getCanvasPointFromPathEvent(event), semanticConnectorIds.has(nearestConnectorId));
                            }}
                        />
                    );
                })}
            </svg>

            {hoverDeleteAffordance && onDeleteConnector && (
                <div className="pointer-events-none absolute inset-0 z-50">
                    <button
                        type="button"
                        className="canvas-reference-connector-delete-button canvas-reference-connector-delete-position pointer-events-auto absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onMouseMove={(event) => {
                            event.stopPropagation();
                        }}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const connectorId = hoverDeleteAffordance.connectorId;
                            clearHoverFlow(connectorId);
                            onDeleteConnector(connectorId);
                        }}
                        aria-label="删除连接线"
                        title="删除连接线"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="7" cy="17" r="3.2" />
                            <circle cx="17" cy="17" r="3.2" />
                            <path d="M9.4 14.5 19 5" />
                            <path d="M14.6 14.5 5 5" />
                            <path d="M10.6 15.2c.9-.65 1.9-.65 2.8 0" />
                        </svg>
                    </button>
                </div>
            )}

            <CanvasAreaWorldOverlays
                currentPath={currentPath}
                alignGuides={alignGuides}
                frameDrawBox={frameDrawBox}
                elementsLength={elements.length}
            />
        </div>
    );
}