import React from 'react';
import type { AlignGuide } from './canvas-alignment';
import type { CanvasConnectorPort, CanvasElement } from './canvas-types';
import { CanvasElementRenderer, type ElementHandlers } from './CanvasElementRenderer';
import { CanvasAreaWorldOverlays } from './CanvasAreaOverlays';
import { CanvasConnectorRasterLayer, type CanvasConnectorRasterBatch } from './CanvasConnectorRasterLayer';
import { CanvasLowZoomOverviewLayer } from './CanvasLowZoomOverviewLayer';
import {
    buildConnectorPath,
    getConnectorPortPoint,
    getConnectorRenderData,
    isReferenceSourceElement,
    isReferenceTargetElement,
    type ReferenceConnectionStatus,
} from './canvas-reference-connectors';
import { getCanvasRenderPan } from './canvas-viewport-utils';

const CANVAS_REFERENCE_BLUE = '#149BFF';
const CANVAS_REFERENCE_FLOW_CORE = '#63DCFF';
const CANVAS_REFERENCE_FLOW_PULSE = '#BDF3FF';
const CONNECTOR_HOVER_FLOW_DELAY_MS = 50;
const CONNECTOR_DELETE_AFFORDANCE_DELAY_MS = 1000;
const CONNECTOR_PRECISE_HIT_RADIUS_PX = 7.5;
const CONNECTOR_CLICK_MOVE_TOLERANCE_PX = 4;
const DENSE_FLOW_HIGHLIGHT_THRESHOLD = 6;
const ANIMATED_FLOW_HIGHLIGHT_LIMIT = 8;
const LOW_SCALE_ANIMATED_FLOW_HIGHLIGHT_LIMIT = 4;
const DENSE_CONNECTOR_VIEWPORT_THRESHOLD = 32;
const DENSE_CONNECTOR_BATCH_THRESHOLD = DENSE_CONNECTOR_VIEWPORT_THRESHOLD;
const DENSE_CONNECTOR_INTERACTION_SCALE_THRESHOLD = 0.65;
const MIN_VISUAL_CONNECTOR_STROKE_PX = 1.18;
const CONNECTOR_PATH_NUMBER_PATTERN = '([-+]?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)';
const CONNECTOR_LINE_PATH_PATTERN = new RegExp(
    `^M\\s+${CONNECTOR_PATH_NUMBER_PATTERN}\\s+${CONNECTOR_PATH_NUMBER_PATTERN}\\s+L\\s+${CONNECTOR_PATH_NUMBER_PATTERN}\\s+${CONNECTOR_PATH_NUMBER_PATTERN}$`,
    'i',
);
const CONNECTOR_CUBIC_PATH_PATTERN = new RegExp(
    `^M\\s+${CONNECTOR_PATH_NUMBER_PATTERN}\\s+${CONNECTOR_PATH_NUMBER_PATTERN}\\s+C\\s+${CONNECTOR_PATH_NUMBER_PATTERN}\\s+${CONNECTOR_PATH_NUMBER_PATTERN}\\s*,\\s*${CONNECTOR_PATH_NUMBER_PATTERN}\\s+${CONNECTOR_PATH_NUMBER_PATTERN}\\s*,\\s*${CONNECTOR_PATH_NUMBER_PATTERN}\\s+${CONNECTOR_PATH_NUMBER_PATTERN}$`,
    'i',
);

type ConnectorRenderData = NonNullable<ReturnType<typeof getConnectorRenderData>>;

type ConnectorHitSegment = {
    start: { x: number; y: number };
    end: { x: number; y: number };
};

type ConnectorHitModel = {
    connectorId: string;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    segments: ConnectorHitSegment[];
};

type ConnectorPaintItem = {
    connector: CanvasElement;
    renderData: ConnectorRenderData;
    isConnectorSelected: boolean;
    isSemanticConnector: boolean;
    isFlowHighlighted: boolean;
    shouldRenderFlowHighlight: boolean;
    shouldRenderStaticFlowHighlight: boolean;
    connectorColor: string;
    connectorWidth: number;
    readableConnectorWidth: number;
    readableSelectedConnectorWidth: number;
};

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

function getMinimumScreenStrokeWidth(strokeWidth: number, scale: number, minimumScreenWidth: number) {
    if (!Number.isFinite(strokeWidth) || strokeWidth <= 0 || !Number.isFinite(scale) || scale <= 0) {
        return strokeWidth;
    }

    return Math.max(strokeWidth, minimumScreenWidth / scale);
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

function getCubicPoint(
    start: { x: number; y: number },
    controlA: { x: number; y: number },
    controlB: { x: number; y: number },
    end: { x: number; y: number },
    t: number,
) {
    const inverse = 1 - t;
    const inverseSquared = inverse * inverse;
    const tSquared = t * t;
    return {
        x: inverseSquared * inverse * start.x
            + 3 * inverseSquared * t * controlA.x
            + 3 * inverse * tSquared * controlB.x
            + tSquared * t * end.x,
        y: inverseSquared * inverse * start.y
            + 3 * inverseSquared * t * controlA.y
            + 3 * inverse * tSquared * controlB.y
            + tSquared * t * end.y,
    };
}

function buildConnectorHitModel(connectorId: string, renderData: ConnectorRenderData): ConnectorHitModel | null {
    const segments: ConnectorHitSegment[] = [];
    const path = renderData.path.trim();
    const cubicMatch = path.match(CONNECTOR_CUBIC_PATH_PATTERN);
    const lineMatch = cubicMatch ? null : path.match(CONNECTOR_LINE_PATH_PATTERN);

    if (cubicMatch) {
        const numbers = cubicMatch.slice(1).map(Number);
        const start = { x: numbers[0], y: numbers[1] };
        const controlA = { x: numbers[2], y: numbers[3] };
        const controlB = { x: numbers[4], y: numbers[5] };
        const end = { x: numbers[6], y: numbers[7] };
        let previous = start;
        for (let index = 1; index <= 28; index += 1) {
            const current = getCubicPoint(start, controlA, controlB, end, index / 28);
            segments.push({ start: previous, end: current });
            previous = current;
        }
    } else if (lineMatch) {
        const numbers = lineMatch.slice(1).map(Number);
        segments.push({
            start: { x: numbers[0], y: numbers[1] },
            end: { x: numbers[2], y: numbers[3] },
        });
    }

    if (segments.length === 0) {
        return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const segment of segments) {
        minX = Math.min(minX, segment.start.x, segment.end.x);
        minY = Math.min(minY, segment.start.y, segment.end.y);
        maxX = Math.max(maxX, segment.start.x, segment.end.x);
        maxY = Math.max(maxY, segment.start.y, segment.end.y);
    }

    return { connectorId, bounds: { minX, minY, maxX, maxY }, segments };
}

function getNearestModelConnectorHit(
    hitModels: ConnectorHitModel[],
    pointer: { x: number; y: number },
    radius: number,
) {
    let nearestConnectorId: string | null = null;
    let nearestDistance = radius;

    for (const model of hitModels) {
        if (
            pointer.x < model.bounds.minX - radius
            || pointer.x > model.bounds.maxX + radius
            || pointer.y < model.bounds.minY - radius
            || pointer.y > model.bounds.maxY + radius
        ) {
            continue;
        }

        for (const segment of model.segments) {
            const distance = distanceToSegment(pointer, segment.start, segment.end);
            if (distance <= nearestDistance) {
                nearestDistance = distance;
                nearestConnectorId = model.connectorId;
            }
        }
    }

    return nearestConnectorId;
}

function getCanvasPointFromClient(root: HTMLElement, clientX: number, clientY: number, scale: number) {
    if (!Number.isFinite(scale) || scale <= 0) {
        return null;
    }

    const bounds = root.getBoundingClientRect();
    return {
        x: (clientX - bounds.left) / scale,
        y: (clientY - bounds.top) / scale,
    };
}

function shouldIgnoreConnectorModelPointerTarget(target: EventTarget | null) {
    return target instanceof Element && !!target.closest('[data-element-id], button, input, textarea, select, [contenteditable="true"]');
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
    overviewElements: CanvasElement[];
    viewportSize: { width: number; height: number };
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
    isPanning: boolean;
    lowZoomOverviewActive: boolean;
    canvasTheme?: 'light' | 'dark';
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
    overviewElements,
    viewportSize,
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
    isPanning,
    lowZoomOverviewActive,
    canvasTheme,
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
    const selectedIdSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
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
    const connectorRenderDataById = React.useMemo(() => {
        const renderDataById = new Map<string, ConnectorRenderData>();
        for (const connector of connectorElements) {
            const renderData = getConnectorRenderData(connector, connectorRenderElementMap);
            if (renderData) {
                renderDataById.set(connector.id, renderData);
            }
        }

        return renderDataById;
    }, [connectorElements, connectorRenderElementMap]);
    const selectedConnectorRenderState = React.useMemo(() => {
        const selectedReferenceConnectorIds = new Set<string>();
        const linkedElementIds = new Set<string>();
        if (selectedIds.length === 0) {
            return { selectedReferenceConnectorIds, linkedElementIds };
        }

        const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null;
        const singleSelectedElement = singleSelectedId ? elementMap.get(singleSelectedId) : undefined;
        const shouldCollectReferenceHighlights = !!singleSelectedId
            && (!!singleSelectedElement && (isReferenceTargetElement(singleSelectedElement) || isReferenceSourceElement(singleSelectedElement)));

        for (const connector of connectorElements) {
            if (connector.type !== 'connector') {
                continue;
            }

            const fromId = connector.connectorFrom;
            const toId = connector.connectorTo;
            const isConnectorSelected = selectedIdSet.has(connector.id);

            if (isConnectorSelected) {
                if (fromId) linkedElementIds.add(fromId);
                if (toId) linkedElementIds.add(toId);
            }

            if (fromId && toId) {
                if (selectedIdSet.has(fromId)) {
                    linkedElementIds.add(toId);
                }
                if (selectedIdSet.has(toId)) {
                    linkedElementIds.add(fromId);
                }
            }

            if (!shouldCollectReferenceHighlights || !singleSelectedId) {
                continue;
            }

            const renderData = connectorRenderDataById.get(connector.id);
            if (!renderData?.isReferenceConnector) {
                continue;
            }

            if (isReferenceTargetElement(singleSelectedElement) && toId === singleSelectedId) {
                selectedReferenceConnectorIds.add(connector.id);
            } else if (isReferenceSourceElement(singleSelectedElement) && fromId === singleSelectedId) {
                selectedReferenceConnectorIds.add(connector.id);
            }
        }

        return { selectedReferenceConnectorIds, linkedElementIds };
    }, [connectorElements, connectorRenderDataById, elementMap, selectedIds, selectedIdSet]);
    const { selectedReferenceConnectorIds, linkedElementIds } = selectedConnectorRenderState;
    const semanticConnectorIds = React.useMemo(() => new Set(
        connectorElements.flatMap((connector) => {
            const renderData = connectorRenderDataById.get(connector.id);
            return renderData && (renderData.isReferenceConnector || isGeneratorFlowConnectorElement(connector))
                ? [connector.id]
                : [];
        }),
    ), [connectorElements, connectorRenderDataById]);
    const canvasRenderScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const isHighFrequencyInteraction = isPanning || isDragging || isResizing;
    const isDenseConnectorViewport = connectorElements.length >= DENSE_CONNECTOR_VIEWPORT_THRESHOLD
        || selectedReferenceConnectorIds.size >= DENSE_FLOW_HIGHLIGHT_THRESHOLD;
    const shouldReduceConnectorHitTesting = isHighFrequencyInteraction
        || (canvasRenderScale <= DENSE_CONNECTOR_INTERACTION_SCALE_THRESHOLD && isDenseConnectorViewport);
    const connectorHitModels = React.useMemo(() => connectorElements.flatMap((connector) => {
        const renderData = connectorRenderDataById.get(connector.id);
        const hitModel = renderData ? buildConnectorHitModel(connector.id, renderData) : null;
        return hitModel ? [hitModel] : [];
    }), [connectorElements, connectorRenderDataById]);
    const [hoverFlowConnectorId, setHoverFlowConnectorId] = React.useState<string | null>(null);
    const [hoverDeleteAffordance, setHoverDeleteAffordance] = React.useState<{ connectorId: string; x: number; y: number } | null>(null);
    const hoverFlowTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverDeleteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverFlowCandidateRef = React.useRef<string | null>(null);
    const latestHoverCanvasPointRef = React.useRef<{ x: number; y: number } | null>(null);
    const connectorPointerDownRef = React.useRef<{ connectorId: string; x: number; y: number } | null>(null);

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
    React.useEffect(() => {
        if (isHighFrequencyInteraction) clearHoverFlow();
    }, [clearHoverFlow, isHighFrequencyInteraction]);
    React.useEffect(() => {
        connectorPointerDownRef.current = null;
    }, [shouldReduceConnectorHitTesting]);

    const handleLayerMouseMove = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (!shouldReduceConnectorHitTesting && event.target instanceof Element && event.target.closest('.canvas-reference-connector-hit-path')) {
            return;
        }

        if (shouldReduceConnectorHitTesting) {
            if (isHighFrequencyInteraction || referenceConnectionSourceId || shouldIgnoreConnectorModelPointerTarget(event.target)) {
                clearHoverFlow();
                return;
            }

            const root = containerRef.current;
            if (!root) {
                clearHoverFlow();
                return;
            }

            const canvasPoint = getCanvasPointFromClient(root, event.clientX, event.clientY, canvasRenderScale);
            const hitRadius = CONNECTOR_PRECISE_HIT_RADIUS_PX / canvasRenderScale;
            const nearestConnectorId = canvasPoint
                ? getNearestModelConnectorHit(connectorHitModels, canvasPoint, hitRadius)
                : null;
            if (!nearestConnectorId || !canvasPoint) {
                clearHoverFlow();
                return;
            }

            scheduleConnectorHover(nearestConnectorId, canvasPoint, semanticConnectorIds.has(nearestConnectorId));
            return;
        }
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
    }, [canvasRenderScale, clearHoverFlow, connectorHitModels, containerRef, isHighFrequencyInteraction, referenceConnectionSourceId, scheduleConnectorHover, semanticConnectorIds, shouldReduceConnectorHitTesting]);
    const handleLayerMouseDown = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
            connectorPointerDownRef.current = null;
            return;
        }
        if (!shouldReduceConnectorHitTesting) {
            return;
        }

        if (isHighFrequencyInteraction || shouldIgnoreConnectorModelPointerTarget(event.target)) {
            connectorPointerDownRef.current = null;
            return;
        }

        const root = containerRef.current;
        if (!root) {
            connectorPointerDownRef.current = null;
            return;
        }

        const canvasPoint = getCanvasPointFromClient(root, event.clientX, event.clientY, canvasRenderScale);
        const nearestConnectorId = canvasPoint
            ? getNearestModelConnectorHit(connectorHitModels, canvasPoint, CONNECTOR_PRECISE_HIT_RADIUS_PX / canvasRenderScale)
            : null;
        if (!nearestConnectorId) {
            connectorPointerDownRef.current = null;
            return;
        }

        connectorPointerDownRef.current = {
            connectorId: nearestConnectorId,
            x: event.clientX,
            y: event.clientY,
        };
        event.preventDefault();
        event.stopPropagation();
    }, [canvasRenderScale, connectorHitModels, containerRef, isHighFrequencyInteraction, shouldReduceConnectorHitTesting]);
    const handleLayerClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (!shouldReduceConnectorHitTesting) {
            return;
        }

        if (isHighFrequencyInteraction || shouldIgnoreConnectorModelPointerTarget(event.target)) {
            connectorPointerDownRef.current = null;
            return;
        }

        const pointerDown = connectorPointerDownRef.current;
        connectorPointerDownRef.current = null;
        if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > CONNECTOR_CLICK_MOVE_TOLERANCE_PX) {
            return;
        }

        const root = containerRef.current;
        const canvasPoint = root ? getCanvasPointFromClient(root, event.clientX, event.clientY, canvasRenderScale) : null;
        const nearestConnectorId = canvasPoint
            ? getNearestModelConnectorHit(connectorHitModels, canvasPoint, CONNECTOR_PRECISE_HIT_RADIUS_PX / canvasRenderScale)
            : null;
        if (!nearestConnectorId || nearestConnectorId !== pointerDown.connectorId) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        onSelectConnector?.(nearestConnectorId);
    }, [canvasRenderScale, connectorHitModels, containerRef, isHighFrequencyInteraction, onSelectConnector, shouldReduceConnectorHitTesting]);
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
    const renderPan = getCanvasRenderPan(pan);
    const viewportStrokeScale = canvasRenderScale < 1 ? 1 / canvasRenderScale : 1;
    const generatorNodeEdgeWidth = 1 / canvasRenderScale;
    const activeFlowHighlightCount = selectedReferenceConnectorIds.size
        + (hoverFlowConnectorId && !selectedReferenceConnectorIds.has(hoverFlowConnectorId) ? 1 : 0);
    const animatedFlowHighlightLimit = canvasRenderScale <= DENSE_CONNECTOR_INTERACTION_SCALE_THRESHOLD
        ? LOW_SCALE_ANIMATED_FLOW_HIGHLIGHT_LIMIT
        : ANIMATED_FLOW_HIGHLIGHT_LIMIT;
    const shouldUseDenseStaticFlowHighlight = activeFlowHighlightCount > animatedFlowHighlightLimit;
    const getReadableStrokeWidth = (strokeWidth: number) => getMinimumScreenStrokeWidth(
        strokeWidth,
        canvasRenderScale,
        MIN_VISUAL_CONNECTOR_STROKE_PX,
    );
    const getViewportStableStrokeWidth = (strokeWidth: number) => strokeWidth * viewportStrokeScale;
    const connectorPaintPlan = React.useMemo(() => {
        const rasterBatches = new Map<string, CanvasConnectorRasterBatch>();
        const individualItems: ConnectorPaintItem[] = [];
        const shouldRasterizeBasePaths = shouldReduceConnectorHitTesting
            && (isHighFrequencyInteraction || connectorElements.length >= DENSE_CONNECTOR_BATCH_THRESHOLD);

        for (const connector of connectorElements) {
            const renderData = connectorRenderDataById.get(connector.id);
            if (!renderData) continue;

            const isConnectorSelected = selectedIdSet.has(connector.id);
            const isGeneratorFlowConnector = isGeneratorFlowConnectorElement(connector);
            const isSemanticConnector = renderData.isReferenceConnector || isGeneratorFlowConnector;
            const isGeneratorFlowEndpointSelected = isGeneratorFlowConnector
                && !!connector.connectorFrom
                && !!connector.connectorTo
                && selectedIds.length === 1
                && (selectedIdSet.has(connector.connectorFrom) || selectedIdSet.has(connector.connectorTo));
            const isFlowHighlighted = selectedReferenceConnectorIds.has(connector.id)
                || (renderData.isReferenceConnector && isConnectorSelected)
                || (isGeneratorFlowConnector && (isConnectorSelected || isGeneratorFlowEndpointSelected))
                || (isSemanticConnector && hoverFlowConnectorId === connector.id);
            const shouldRenderFlowHighlight = isFlowHighlighted && !isHighFrequencyInteraction && !shouldUseDenseStaticFlowHighlight;
            const shouldRenderStaticFlowHighlight = isFlowHighlighted && !isHighFrequencyInteraction && shouldUseDenseStaticFlowHighlight;
            const connectorColor = isSemanticConnector ? CANVAS_REFERENCE_BLUE : connector.color || '#6B7280';
            const connectorWidth = connector.strokeWidth || (isSemanticConnector ? 2.25 : 2);
            const readableConnectorWidth = getMinimumScreenStrokeWidth(
                connectorWidth,
                canvasRenderScale,
                MIN_VISUAL_CONNECTOR_STROKE_PX,
            );
            const readableSelectedConnectorWidth = getMinimumScreenStrokeWidth(
                connectorWidth + 1.5,
                canvasRenderScale,
                MIN_VISUAL_CONNECTOR_STROKE_PX,
            );
            const canRasterizeBasePath = shouldRasterizeBasePaths
                && isSemanticConnector
                && !isConnectorSelected
                && !isFlowHighlighted
                && connector.connectorStyle !== 'dashed';

            if (canRasterizeBasePath) {
                const opacity = 0.9;
                const batchKey = `${connectorColor}|${readableConnectorWidth}|${opacity}`;
                const batch = rasterBatches.get(batchKey);
                if (batch) {
                    batch.path = `${batch.path} ${renderData.path}`;
                    batch.count += 1;
                } else {
                    rasterBatches.set(batchKey, {
                        key: batchKey,
                        path: renderData.path,
                        stroke: connectorColor,
                        strokeWidth: readableConnectorWidth,
                        opacity,
                        count: 1,
                    });
                }
                continue;
            }

            individualItems.push({
                connector,
                renderData,
                isConnectorSelected,
                isSemanticConnector,
                isFlowHighlighted,
                shouldRenderFlowHighlight,
                shouldRenderStaticFlowHighlight,
                connectorColor,
                connectorWidth,
                readableConnectorWidth,
                readableSelectedConnectorWidth,
            });
        }

        return {
            rasterBatches: Array.from(rasterBatches.values()),
            individualItems,
        };
    }, [
        canvasRenderScale,
        connectorElements,
        connectorRenderDataById,
        hoverFlowConnectorId,
        isHighFrequencyInteraction,
        selectedIdSet,
        selectedIds.length,
        selectedReferenceConnectorIds,
        shouldReduceConnectorHitTesting,
        shouldUseDenseStaticFlowHighlight,
    ]);
    const contentLayerStyle = {
        '--canvas-scale': canvasRenderScale,
        '--canvas-low-zoom-stroke-scale': viewportStrokeScale,
        '--canvas-tool-node-edge-width': toLayerPx(generatorNodeEdgeWidth),
        '--canvas-linked-highlight-width': toLayerPx(generatorNodeEdgeWidth),
        transformOrigin: 'top left',
        willChange: 'transform',
    } as React.CSSProperties;

    return (
        <div
            ref={containerRef}
            className={`canvas-content-layer-transform w-full h-full origin-top-left${isPanning ? ' is-panning' : ''}${isHighFrequencyInteraction ? ' is-interacting' : ''}`}
            style={contentLayerStyle}
            onMouseDown={handleLayerMouseDown}
            onMouseMove={handleLayerMouseMove}
            onClick={handleLayerClick}
            onMouseLeave={() => clearHoverFlow()}
        >
            <div
                className="canvas-detailed-layer canvas-grid-layer pointer-events-none absolute inset-0 h-[10000px] w-[10000px]"
                style={{ display: lowZoomOverviewActive ? 'none' : undefined }}
            />

            <CanvasLowZoomOverviewLayer
                active={lowZoomOverviewActive}
                elements={overviewElements}
                selectedIds={selectedIds}
                renderPan={renderPan}
                scale={canvasRenderScale}
                viewportSize={viewportSize}
                canvasTheme={canvasTheme}
            />

            {!lowZoomOverviewActive && (
                <CanvasConnectorRasterLayer
                    batches={connectorPaintPlan.rasterBatches}
                    renderPan={renderPan}
                    scale={canvasRenderScale}
                    viewportSize={viewportSize}
                    isPanning={isPanning}
                />
            )}

            <svg
                className="canvas-detailed-layer canvas-reference-connector-layer absolute inset-0 w-full h-full overflow-visible"
                visibility={lowZoomOverviewActive ? 'hidden' : 'visible'}
            >
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                        <polygon points="0 0, 10 3, 0 6" fill="#6B7280" />
                    </marker>
                </defs>
                {connectorPaintPlan.individualItems.map((item) => {
                    const {
                        connector,
                        renderData,
                        isConnectorSelected,
                        isSemanticConnector,
                        isFlowHighlighted,
                        shouldRenderFlowHighlight,
                        shouldRenderStaticFlowHighlight,
                        connectorColor,
                        connectorWidth,
                        readableConnectorWidth,
                        readableSelectedConnectorWidth,
                    } = item;

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
                            {shouldRenderStaticFlowHighlight && (
                                <path
                                    className="canvas-reference-flow-static-path"
                                    d={renderData.path}
                                    stroke={CANVAS_REFERENCE_FLOW_CORE}
                                    strokeWidth={getReadableStrokeWidth(Math.max(4.5, connectorWidth + 2))}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    fill="none"
                                    opacity={0.42}
                                    pointerEvents="none"
                                />
                            )}
                            {shouldRenderFlowHighlight && (
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

            <div
                className="canvas-detailed-layer pointer-events-none absolute inset-0 z-40"
                ref={elementsContainerRef}
                aria-hidden={lowZoomOverviewActive || undefined}
                style={{ visibility: lowZoomOverviewActive ? 'hidden' : 'visible' }}
            >
                {renderElements.map((el) => {
                    const isSelected = selectedIdSet.has(el.id);
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
                        && linkedElementIds.has(el.id);
                    const isLayerOrderHighlighted = highlightedElementIdSet.has(el.id);
                    return (
                        <CanvasElementRenderer
                            key={el.id}
                            el={el}
                            resolvedImageSrc={resolvedImageSrcMap?.[el.id]}
                            isSelected={isSelected}
                            selectedImageCount={multiReferenceCandidateCount}
                            showToolbar={isSelected && selectedIds.length === 1 && !isHighFrequencyInteraction}
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
                            markTargetHasContent={!!(el.markTargetId && elementMap.get(el.markTargetId)?.content)}
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
                        style={{
                            left: toLayerPx(multiSelectionBounds.minX - 8),
                            top: toLayerPx(multiSelectionBounds.minY - 8),
                            width: toLayerPx(multiSelectionBounds.width + 16),
                            height: toLayerPx(multiSelectionBounds.height + 16),
                            transform: multiSelectionPreviewOffset
                                ? `translate(${toLayerPx(multiSelectionPreviewOffset.dx)}, ${toLayerPx(multiSelectionPreviewOffset.dy)})`
                                : 'none',
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

            <svg
                className="canvas-detailed-layer pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible"
                visibility={lowZoomOverviewActive ? 'hidden' : 'visible'}
            >
                {!shouldReduceConnectorHitTesting && connectorElements.map((connector) => {
                    const renderData = connectorRenderDataById.get(connector.id);
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
                                if (event.button !== 0) {
                                    connectorPointerDownRef.current = null;
                                    return;
                                }
                                const nearestConnectorId = getNearestVisiblePathConnectorId(event);
                                if (!nearestConnectorId) {
                                    connectorPointerDownRef.current = null;
                                    clearHoverFlow();
                                    return;
                                }
                                event.preventDefault();
                                event.stopPropagation();
                                connectorPointerDownRef.current = {
                                    connectorId: nearestConnectorId,
                                    x: event.clientX,
                                    y: event.clientY,
                                };
                            }}
                            onClick={(event) => {
                                const nearestConnectorId = getNearestVisiblePathConnectorId(event);
                                if (!nearestConnectorId) {
                                    connectorPointerDownRef.current = null;
                                    clearHoverFlow();
                                    return;
                                }

                                const pointerDown = connectorPointerDownRef.current;
                                connectorPointerDownRef.current = null;
                                if (
                                    pointerDown?.connectorId !== nearestConnectorId
                                    || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > CONNECTOR_CLICK_MOVE_TOLERANCE_PX
                                ) {
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

            {!lowZoomOverviewActive && hoverDeleteAffordance && onDeleteConnector && (
                <div className="pointer-events-none absolute inset-0 z-50">
                    <button
                        type="button"
                        className="canvas-reference-connector-delete-button canvas-reference-connector-delete-position pointer-events-auto absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                        style={{ left: toLayerPx(hoverDeleteAffordance.x), top: toLayerPx(hoverDeleteAffordance.y) }}
                        onMouseDown={(event) => {
                            if (event.button !== 0) return;
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

            {!lowZoomOverviewActive && (
                <div className="canvas-detailed-layer contents">
                    <CanvasAreaWorldOverlays
                        currentPath={currentPath}
                        alignGuides={alignGuides}
                        frameDrawBox={frameDrawBox}
                        elementsLength={elements.length}
                    />
                </div>
            )}
        </div>
    );
}
