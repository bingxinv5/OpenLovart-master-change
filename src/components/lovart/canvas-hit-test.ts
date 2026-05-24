import type { CanvasElement } from './canvas-types';
import { isCanvasElementOfType } from './canvas-types';
import {
    boundsIntersect,
    getCanvasConnectorBounds,
    getCanvasConnectorControlPoints,
    type CanvasBounds,
} from '@/lib/canvas-element-bounds';

export type CanvasSelectionBounds = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};

const CONNECTOR_BOX_SELECTION_PADDING = 10;
const CONNECTOR_SELECTION_SAMPLE_SPACING = 12;

type CanvasPoint = { x: number; y: number };

function selectionBoundsToCanvasBounds(bounds: CanvasSelectionBounds): CanvasBounds {
    return {
        minX: bounds.x1,
        minY: bounds.y1,
        maxX: bounds.x2,
        maxY: bounds.y2,
    };
}

function expandSelectionBounds(bounds: CanvasSelectionBounds, padding: number): CanvasSelectionBounds {
    return {
        x1: bounds.x1 - padding,
        y1: bounds.y1 - padding,
        x2: bounds.x2 + padding,
        y2: bounds.y2 + padding,
    };
}

function pointInsideSelectionBounds(point: CanvasPoint, bounds: CanvasSelectionBounds) {
    return point.x >= bounds.x1 && point.x <= bounds.x2 && point.y >= bounds.y1 && point.y <= bounds.y2;
}

function getSegmentBounds(start: CanvasPoint, end: CanvasPoint): CanvasSelectionBounds {
    return {
        x1: Math.min(start.x, end.x),
        y1: Math.min(start.y, end.y),
        x2: Math.max(start.x, end.x),
        y2: Math.max(start.y, end.y),
    };
}

function selectionBoundsIntersect(left: CanvasSelectionBounds, right: CanvasSelectionBounds) {
    return left.x2 >= right.x1
        && left.x1 <= right.x2
        && left.y2 >= right.y1
        && left.y1 <= right.y2;
}

function getOrientation(firstPoint: CanvasPoint, secondPoint: CanvasPoint, thirdPoint: CanvasPoint) {
    const value = (secondPoint.y - firstPoint.y) * (thirdPoint.x - secondPoint.x)
        - (secondPoint.x - firstPoint.x) * (thirdPoint.y - secondPoint.y);
    if (Math.abs(value) < 0.000001) {
        return 0;
    }
    return value > 0 ? 1 : 2;
}

function pointOnSegment(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint) {
    return point.x <= Math.max(start.x, end.x) + 0.000001
        && point.x >= Math.min(start.x, end.x) - 0.000001
        && point.y <= Math.max(start.y, end.y) + 0.000001
        && point.y >= Math.min(start.y, end.y) - 0.000001;
}

function segmentsIntersect(firstStart: CanvasPoint, firstEnd: CanvasPoint, secondStart: CanvasPoint, secondEnd: CanvasPoint) {
    const firstOrientation = getOrientation(firstStart, firstEnd, secondStart);
    const secondOrientation = getOrientation(firstStart, firstEnd, secondEnd);
    const thirdOrientation = getOrientation(secondStart, secondEnd, firstStart);
    const fourthOrientation = getOrientation(secondStart, secondEnd, firstEnd);

    if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) {
        return true;
    }

    return (firstOrientation === 0 && pointOnSegment(secondStart, firstStart, firstEnd))
        || (secondOrientation === 0 && pointOnSegment(secondEnd, firstStart, firstEnd))
        || (thirdOrientation === 0 && pointOnSegment(firstStart, secondStart, secondEnd))
        || (fourthOrientation === 0 && pointOnSegment(firstEnd, secondStart, secondEnd));
}

function segmentIntersectsSelectionBounds(start: CanvasPoint, end: CanvasPoint, bounds: CanvasSelectionBounds) {
    if (!selectionBoundsIntersect(getSegmentBounds(start, end), bounds)) {
        return false;
    }

    if (pointInsideSelectionBounds(start, bounds) || pointInsideSelectionBounds(end, bounds)) {
        return true;
    }

    const topLeft = { x: bounds.x1, y: bounds.y1 };
    const topRight = { x: bounds.x2, y: bounds.y1 };
    const bottomRight = { x: bounds.x2, y: bounds.y2 };
    const bottomLeft = { x: bounds.x1, y: bounds.y2 };
    return segmentsIntersect(start, end, topLeft, topRight)
        || segmentsIntersect(start, end, topRight, bottomRight)
        || segmentsIntersect(start, end, bottomRight, bottomLeft)
        || segmentsIntersect(start, end, bottomLeft, topLeft);
}

function getCubicPoint(points: CanvasPoint[], ratio: number): CanvasPoint {
    const inverse = 1 - ratio;
    return {
        x: inverse * inverse * inverse * points[0].x
            + 3 * inverse * inverse * ratio * points[1].x
            + 3 * inverse * ratio * ratio * points[2].x
            + ratio * ratio * ratio * points[3].x,
        y: inverse * inverse * inverse * points[0].y
            + 3 * inverse * inverse * ratio * points[1].y
            + 3 * inverse * ratio * ratio * points[2].y
            + ratio * ratio * ratio * points[3].y,
    };
}

function estimateControlLength(points: CanvasPoint[]) {
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
        length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    }
    return length;
}

function connectorPathIntersectsSelectionBounds(
    connector: CanvasElement,
    bounds: CanvasSelectionBounds,
    elementById: Map<string, CanvasElement>,
) {
    const connectorBounds = getCanvasConnectorBounds(connector, elementById);
    if (!connectorBounds) {
        return false;
    }

    const strokePadding = Math.max(1, (connector.strokeWidth || 2) / 2);
    const selectionPadding = CONNECTOR_BOX_SELECTION_PADDING + strokePadding;
    const expandedSelectionBounds = expandSelectionBounds(bounds, selectionPadding);
    if (!boundsIntersect(connectorBounds, selectionBoundsToCanvasBounds(expandedSelectionBounds))) {
        return false;
    }

    const controlPoints = getCanvasConnectorControlPoints(connector, elementById);
    if (!controlPoints) {
        return false;
    }

    if (controlPoints.length === 2) {
        return segmentIntersectsSelectionBounds(controlPoints[0], controlPoints[1], expandedSelectionBounds);
    }

    const sampleCount = Math.max(24, Math.min(160, Math.ceil(estimateControlLength(controlPoints) / CONNECTOR_SELECTION_SAMPLE_SPACING)));
    let previousPoint = controlPoints[0];
    for (let index = 1; index <= sampleCount; index += 1) {
        const currentPoint = getCubicPoint(controlPoints, index / sampleCount);
        if (segmentIntersectsSelectionBounds(previousPoint, currentPoint, expandedSelectionBounds)) {
            return true;
        }
        previousPoint = currentPoint;
    }

    return false;
}

export function getPointHitBounds(element: CanvasElement) {
    return {
        left: element.x,
        top: element.y,
        right: element.x + (element.width ?? (element.type === 'text' ? 200 : element.type === 'mark' ? 32 : 0)),
        bottom: element.y + (element.height ?? (element.type === 'text' ? 40 : element.type === 'mark' ? 32 : 0)),
    };
}

export function elementContainsCanvasPoint(element: CanvasElement, x: number, y: number) {
    if (element.hidden || isCanvasElementOfType(element, 'connector')) {
        return false;
    }

    const bounds = getPointHitBounds(element);
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

export function getTopElementAtCanvasPoint(elements: CanvasElement[], x: number, y: number) {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
        const element = elements[index];
        if (element.type !== 'frame' && elementContainsCanvasPoint(element, x, y)) {
            return element;
        }
    }

    for (let index = elements.length - 1; index >= 0; index -= 1) {
        const element = elements[index];
        if (isCanvasElementOfType(element, 'frame') && elementContainsCanvasPoint(element, x, y)) {
            return element;
        }
    }

    return null;
}

export function shouldIncludeElementInBoxSelection(
    element: CanvasElement,
    bounds: CanvasSelectionBounds,
    elementById?: Map<string, CanvasElement>,
) {
    if (element.hidden) {
        return false;
    }

    if (isCanvasElementOfType(element, 'connector')) {
        return !!elementById && connectorPathIntersectsSelectionBounds(element, bounds, elementById);
    }

    const elementRight = element.x + (element.width || 0);
    const elementBottom = element.y + (element.height || 0);

    if (isCanvasElementOfType(element, 'frame')) {
        return element.x >= bounds.x1
            && elementRight <= bounds.x2
            && element.y >= bounds.y1
            && elementBottom <= bounds.y2;
    }

    return element.x < bounds.x2
        && elementRight > bounds.x1
        && element.y < bounds.y2
        && elementBottom > bounds.y1;
}

export function getBoxSelectedElementIds(elements: CanvasElement[], bounds: CanvasSelectionBounds) {
    const elementById = new Map(elements.map((element) => [element.id, element]));
    return elements
        .filter((element) => shouldIncludeElementInBoxSelection(element, bounds, elementById))
        .map((element) => element.id);
}

export function getInnermostFrameAtCanvasPoint(
    elements: CanvasElement[],
    x: number,
    y: number,
    options: { excludedFrameIds?: Set<string> } = {},
) {
    const excludedFrameIds = options.excludedFrameIds ?? new Set<string>();
    const candidateFrames = elements.filter((frame) => (
        frame.type === 'frame'
        && !excludedFrameIds.has(frame.id)
        && x >= frame.x
        && x <= frame.x + (frame.width || 0)
        && y >= frame.y
        && y <= frame.y + (frame.height || 0)
    ));

    return candidateFrames.length > 0
        ? candidateFrames.reduce((best, frame) => {
            const area = (frame.width || 0) * (frame.height || 0);
            const bestArea = (best.width || 0) * (best.height || 0);
            return area < bestArea ? frame : best;
        })
        : null;
}