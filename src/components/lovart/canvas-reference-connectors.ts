import { getCanvasElementCenter, getCanvasElementRenderSize } from '@/lib/canvas-element-bounds';
import { isCanvasGeneratedImageElement, isCanvasGeneratedVideoElement } from './canvas-types';
import type { CanvasConnectorPort, CanvasElement, CanvasPoint } from './canvas-types';

export const CANVAS_REFERENCE_CONNECTOR_KIND = 'reference-image' as const;

const HORIZONTAL_DIRECT_THRESHOLD = 10;
const MIN_CURVE_CONTROL = 72;
const MAX_CURVE_CONTROL = 240;
export const REFERENCE_PORT_OUTSET = 28;

type ConnectorPathOptions = {
    fromPort?: CanvasConnectorPort | null;
    toPort?: CanvasConnectorPort | null;
};

export type ReferenceConnectionStatus = 'valid' | 'duplicate' | 'invalid';

export type ReferenceConnectionClassification = {
    status: ReferenceConnectionStatus;
    duplicateConnectorId?: string;
};

export type ReferenceSourceElement = CanvasElement & { type: 'image' | 'video'; content: string };
export type ReferenceTargetElement = CanvasElement & { type: 'image-generator' | 'video-generator' | 'storyboard-planner' | 'image' | 'video' };

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function getPortTangentDirection(port: CanvasConnectorPort | null | undefined) {
    if (!port) return null;
    return port === 'generator-reference-input' ? -1 : 1;
}

export function isReferenceSourceElement(element: CanvasElement | null | undefined): element is ReferenceSourceElement {
    return (element?.type === 'image' || element?.type === 'video') && !!element.content;
}

export function isImageGenerationReferenceTargetElement(element: CanvasElement | null | undefined): element is ReferenceTargetElement {
    return element?.type === 'image-generator'
        || element?.type === 'storyboard-planner'
        || isCanvasGeneratedImageElement(element);
}

export function isVideoGenerationReferenceTargetElement(element: CanvasElement | null | undefined): element is ReferenceTargetElement {
    return element?.type === 'video-generator'
        || isCanvasGeneratedVideoElement(element);
}

export function isReferenceTargetElement(element: CanvasElement | null | undefined): element is ReferenceTargetElement {
    return isImageGenerationReferenceTargetElement(element) || isVideoGenerationReferenceTargetElement(element);
}

export function canReferenceSourceConnectToTarget(
    sourceElement: CanvasElement | null | undefined,
    targetElement: CanvasElement | null | undefined,
): sourceElement is ReferenceSourceElement {
    if (!isReferenceSourceElement(sourceElement) || !isReferenceTargetElement(targetElement)) {
        return false;
    }

    return sourceElement.type === 'image' || isVideoGenerationReferenceTargetElement(targetElement);
}

export function isCanvasReferenceConnector(
    connector: CanvasElement | null | undefined,
    elementMap?: Map<string, CanvasElement>,
) {
    if (!connector || connector.type !== 'connector') {
        return false;
    }

    if (connector.connectorKind === CANVAS_REFERENCE_CONNECTOR_KIND) {
        return true;
    }

    if (!elementMap || connector.connectorKind) {
        return false;
    }

    const fromElement = connector.connectorFrom ? elementMap.get(connector.connectorFrom) : undefined;
    const toElement = connector.connectorTo ? elementMap.get(connector.connectorTo) : undefined;
    return canReferenceSourceConnectToTarget(fromElement, toElement);
}

export function getReferenceOutputPortPoint(element: CanvasElement): CanvasPoint {
    const { width, height } = getCanvasElementRenderSize(element);
    return {
        x: element.x + width,
        y: element.y + height / 2,
    };
}

export function getReferenceInputPortPoint(element: CanvasElement): CanvasPoint {
    const { height } = getCanvasElementRenderSize(element);
    return {
        x: element.x,
        y: element.y + height / 2,
    };
}

export function getConnectorPortPoint(element: CanvasElement, port: CanvasConnectorPort): CanvasPoint {
    if (port === 'image-output' || port === 'generator-flow-output') {
        return getReferenceOutputPortPoint(element);
    }

    return getReferenceInputPortPoint(element);
}

export function getConnectorEndpointPoints(
    connector: CanvasElement,
    fromElement: CanvasElement,
    toElement: CanvasElement,
) {
    const isReferenceConnector = connector.connectorKind === CANVAS_REFERENCE_CONNECTOR_KIND
        || (isReferenceSourceElement(fromElement) && isReferenceTargetElement(toElement));

    if (isReferenceConnector) {
        return {
            from: getConnectorPortPoint(fromElement, connector.connectorFromPort || 'image-output'),
            to: getConnectorPortPoint(toElement, connector.connectorToPort || 'generator-reference-input'),
        };
    }

    if (connector.connectorFromPort && connector.connectorToPort) {
        return {
            from: getConnectorPortPoint(fromElement, connector.connectorFromPort),
            to: getConnectorPortPoint(toElement, connector.connectorToPort),
        };
    }

    return {
        from: getCanvasElementCenter(fromElement),
        to: getCanvasElementCenter(toElement),
    };
}

export function buildConnectorPath(from: CanvasPoint, to: CanvasPoint, options: ConnectorPathOptions = {}) {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    if (Math.abs(deltaY) <= HORIZONTAL_DIRECT_THRESHOLD) {
        return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    const direction = deltaX >= 0 ? 1 : -1;
    const horizontalDistance = Math.abs(deltaX);
    const verticalEase = Math.min(Math.abs(deltaY) * 0.12, 48);
    const control = clamp(horizontalDistance * 0.52 + verticalEase, MIN_CURVE_CONTROL, MAX_CURVE_CONTROL);
    const firstControlDirection = getPortTangentDirection(options.fromPort) ?? direction;
    const secondControlDirection = getPortTangentDirection(options.toPort) ?? -direction;
    const firstControlX = from.x + firstControlDirection * control;
    const secondControlX = to.x + secondControlDirection * control;

    return [
        `M ${from.x} ${from.y}`,
        `C ${firstControlX} ${from.y}, ${secondControlX} ${to.y}, ${to.x} ${to.y}`,
    ].join(' ');
}

export function getConnectorRenderData(connector: CanvasElement, elementMap: Map<string, CanvasElement>) {
    const fromElement = connector.connectorFrom ? elementMap.get(connector.connectorFrom) : undefined;
    const toElement = connector.connectorTo ? elementMap.get(connector.connectorTo) : undefined;
    if (!fromElement || !toElement) {
        return null;
    }

    const points = getConnectorEndpointPoints(connector, fromElement, toElement);
    const fromPort = connector.connectorFromPort || (isCanvasReferenceConnector(connector, elementMap) ? 'image-output' : undefined);
    const toPort = connector.connectorToPort || (isCanvasReferenceConnector(connector, elementMap) ? 'generator-reference-input' : undefined);
    return {
        fromElement,
        toElement,
        from: points.from,
        to: points.to,
        path: buildConnectorPath(points.from, points.to, { fromPort, toPort }),
        isReferenceConnector: isCanvasReferenceConnector(connector, elementMap),
    };
}

export function getIncomingReferenceConnectors(
    generatorId: string,
    elements: CanvasElement[],
    elementMap: Map<string, CanvasElement> = new Map(elements.map((element) => [element.id, element])),
) {
    return elements.filter((element) => (
        element.type === 'connector'
        && element.connectorTo === generatorId
        && isCanvasReferenceConnector(element, elementMap)
    ));
}

export function getOutgoingReferenceConnectors(
    sourceId: string,
    elements: CanvasElement[],
    elementMap: Map<string, CanvasElement> = new Map(elements.map((element) => [element.id, element])),
) {
    return elements.filter((element) => (
        element.type === 'connector'
        && element.connectorFrom === sourceId
        && isCanvasReferenceConnector(element, elementMap)
    ));
}

function findDuplicateReferenceConnector(elements: CanvasElement[], sourceId: string, targetId: string) {
    return elements.find((element) => (
        element.type === 'connector'
        && element.connectorKind === CANVAS_REFERENCE_CONNECTOR_KIND
        && element.connectorFrom === sourceId
        && element.connectorTo === targetId
    ));
}

function findDuplicateGeneratorFlowConnector(elements: CanvasElement[], sourceId: string, targetId: string) {
    return elements.find((element) => (
        element.type === 'connector'
        && element.connectorKind !== CANVAS_REFERENCE_CONNECTOR_KIND
        && element.connectorFrom === sourceId
        && element.connectorTo === targetId
        && element.connectorFromPort === 'generator-flow-output'
        && element.connectorToPort === 'generator-reference-input'
    ));
}

export function classifyReferenceConnectionTarget(params: {
    sourceId?: string | null;
    sourcePort?: CanvasConnectorPort | null;
    targetId?: string | null;
    targetPort?: CanvasConnectorPort | null;
    elements: CanvasElement[];
    elementMap?: Map<string, CanvasElement>;
}): ReferenceConnectionClassification {
    const { sourceId, sourcePort, targetId, targetPort, elements } = params;
    const elementMap = params.elementMap ?? new Map(elements.map((element) => [element.id, element]));
    if (!sourceId || !sourcePort || !targetId || !targetPort) {
        return { status: 'invalid' };
    }

    if (sourceId === targetId) {
        return { status: 'invalid' };
    }

    const sourceElement = elementMap.get(sourceId);
    const targetElement = elementMap.get(targetId);
    if (!sourceElement || !targetElement) {
        return { status: 'invalid' };
    }

    if (sourcePort === 'image-output' && targetPort === 'generator-reference-input') {
        if (!canReferenceSourceConnectToTarget(sourceElement, targetElement)) {
            return { status: 'invalid' };
        }
        const duplicate = findDuplicateReferenceConnector(elements, sourceElement.id, targetElement.id);
        return duplicate ? { status: 'duplicate', duplicateConnectorId: duplicate.id } : { status: 'valid' };
    }

    if (sourcePort === 'generator-reference-input' && targetPort === 'image-output') {
        if (!canReferenceSourceConnectToTarget(targetElement, sourceElement)) {
            return { status: 'invalid' };
        }
        const duplicate = findDuplicateReferenceConnector(elements, targetElement.id, sourceElement.id);
        return duplicate ? { status: 'duplicate', duplicateConnectorId: duplicate.id } : { status: 'valid' };
    }

    if (sourcePort === 'generator-flow-output' && targetPort === 'generator-reference-input') {
        if (!isReferenceTargetElement(sourceElement) || !isReferenceTargetElement(targetElement) || sourceElement.id === targetElement.id) {
            return { status: 'invalid' };
        }
        const duplicate = findDuplicateGeneratorFlowConnector(elements, sourceElement.id, targetElement.id);
        return duplicate ? { status: 'duplicate', duplicateConnectorId: duplicate.id } : { status: 'valid' };
    }

    if (sourcePort === 'generator-reference-input' && targetPort === 'generator-flow-output') {
        if (!isReferenceTargetElement(sourceElement) || !isReferenceTargetElement(targetElement) || sourceElement.id === targetElement.id) {
            return { status: 'invalid' };
        }
        const duplicate = findDuplicateGeneratorFlowConnector(elements, targetElement.id, sourceElement.id);
        return duplicate ? { status: 'duplicate', duplicateConnectorId: duplicate.id } : { status: 'valid' };
    }

    return { status: 'invalid' };
}

export function resolveReferenceConnectorImages(generatorId: string, elements: CanvasElement[]) {
    const elementMap = new Map(elements.map((element) => [element.id, element]));
    const images: string[] = [];
    for (const connector of getIncomingReferenceConnectors(generatorId, elements, elementMap)) {
        const source = connector.connectorFrom ? elementMap.get(connector.connectorFrom) : undefined;
        if (!canReferenceSourceConnectToTarget(source, elementMap.get(generatorId)) || source.type !== 'image' || !source.content || images.includes(source.content)) {
            continue;
        }
        images.push(source.content);
    }
    return images;
}

export function resolveReferenceConnectorVideos(generatorId: string, elements: CanvasElement[]) {
    const elementMap = new Map(elements.map((element) => [element.id, element]));
    const videos: string[] = [];
    for (const connector of getIncomingReferenceConnectors(generatorId, elements, elementMap)) {
        const source = connector.connectorFrom ? elementMap.get(connector.connectorFrom) : undefined;
        if (!canReferenceSourceConnectToTarget(source, elementMap.get(generatorId)) || source.type !== 'video' || !source.content || videos.includes(source.content)) {
            continue;
        }
        videos.push(source.content);
    }
    return videos;
}

export function mergeSerializedImageReferences(serialized: string | undefined, images: string[]) {
    const merged: string[] = [];
    if (serialized?.trim()) {
        try {
            const parsed = JSON.parse(serialized);
            if (Array.isArray(parsed)) {
                parsed.forEach((item) => {
                    if (typeof item === 'string' && item.trim() && !merged.includes(item)) {
                        merged.push(item);
                    }
                });
            }
        } catch {
            // Ignore malformed legacy payloads.
        }
    }

    images.forEach((image) => {
        if (image.trim() && !merged.includes(image)) {
            merged.push(image);
        }
    });

    return merged.length > 0 ? JSON.stringify(merged) : undefined;
}

export function findIncomingReferenceConnectorForImage(
    targetId: string,
    elements: CanvasElement[],
    imageContent: string,
) {
    if (!imageContent.trim()) {
        return undefined;
    }

    const elementMap = new Map(elements.map((element) => [element.id, element]));
    return getIncomingReferenceConnectors(targetId, elements, elementMap).find((connector) => {
        const source = connector.connectorFrom ? elementMap.get(connector.connectorFrom) : undefined;
        return isReferenceSourceElement(source) && source.content === imageContent;
    });
}

export function findIncomingReferenceConnectorForMedia(
    targetId: string,
    elements: CanvasElement[],
    mediaContent: string,
    sourceType: 'image' | 'video',
) {
    if (!mediaContent.trim()) {
        return undefined;
    }

    const elementMap = new Map(elements.map((element) => [element.id, element]));
    return getIncomingReferenceConnectors(targetId, elements, elementMap).find((connector) => {
        const source = connector.connectorFrom ? elementMap.get(connector.connectorFrom) : undefined;
        return isReferenceSourceElement(source) && source.type === sourceType && source.content === mediaContent;
    });
}