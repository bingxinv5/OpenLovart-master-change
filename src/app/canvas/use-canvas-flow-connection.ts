import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CanvasElement, CanvasPoint } from '@/components/lovart/canvas-types';
import type { CanvasConnectorPort } from '@/components/lovart/canvas-types';
import {
    CANVAS_REFERENCE_CONNECTOR_KIND,
    canReferenceSourceConnectToTarget,
    isReferenceSourceElement,
    isReferenceTargetElement,
    mergeSerializedImageReferences,
    type ReferenceSourceElement,
    type ReferenceTargetElement,
} from '@/components/lovart/canvas-reference-connectors';

type CanvasGeneratorBuilder = (
    type: Extract<CanvasElement['type'], 'image-generator' | 'video-generator' | 'storyboard-planner'>,
    attrs: Omit<CanvasElement, 'id' | 'type'>,
) => CanvasElement;

export type ReferenceConnectionTargetType = Extract<CanvasElement['type'], 'image-generator' | 'video-generator' | 'storyboard-planner'>;
export type ReferenceConnectionPort = Extract<CanvasConnectorPort, 'image-output' | 'generator-reference-input' | 'generator-flow-output'>;

type ReferenceConnectionStart = {
    elementId: string;
    port: ReferenceConnectionPort;
};
interface UseCanvasFlowConnectionOptions {
    elementsMapRef: MutableRefObject<Map<string, CanvasElement>>;
    dirtyTrackerRef: MutableRefObject<{
        markAdded: (id: string) => void;
        markModified: (id: string) => void;
    }>;
    setElements: Dispatch<SetStateAction<CanvasElement[]>>;
    buildGeneratorElement: CanvasGeneratorBuilder;
}

function appendSerializedReferenceImages(target: string[], serialized?: string) {
    if (!serialized?.trim()) {
        return;
    }

    try {
        const parsed = JSON.parse(serialized);
        if (!Array.isArray(parsed)) {
            return;
        }

        parsed.forEach((item) => {
            if (typeof item === 'string' && item.trim() && !target.includes(item)) {
                target.push(item);
            }
        });
    } catch {
        // Ignore malformed legacy reference payloads.
    }
}

function parseSerializedFrameImages(serialized?: string): Array<{ id: string; image: string; imageType: string; name: string }> {
    if (!serialized?.trim()) {
        return [];
    }

    try {
        const parsed = JSON.parse(serialized);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.flatMap((item) => {
            if (!item || typeof item !== 'object') {
                return [];
            }

            const image = typeof (item as { image?: unknown }).image === 'string'
                ? (item as { image: string }).image
                : '';
            if (!image.trim()) {
                return [];
            }

            return [{
                id: typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : uuidv4(),
                image,
                imageType: typeof (item as { imageType?: unknown }).imageType === 'string'
                    ? (item as { imageType: string }).imageType
                    : 'reference',
                name: typeof (item as { name?: unknown }).name === 'string'
                    ? (item as { name: string }).name
                    : '连线参考图',
            }];
        });
    } catch {
        return [];
    }
}

function mergeSerializedFrameReferenceImages(serialized: string | undefined, image: string) {
    const next = parseSerializedFrameImages(serialized);
    if (!next.some((item) => item.image === image)) {
        next.push({
            id: uuidv4(),
            image,
            imageType: 'reference',
            name: '连线参考图',
        });
    }

    return next.length > 0 ? JSON.stringify(next) : undefined;
}

function parseSerializedReferenceVideos(serialized?: string): Array<{ id: string; url: string; name: string; kind: 'video' }> {
    if (!serialized?.trim()) {
        return [];
    }

    try {
        const parsed = JSON.parse(serialized) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.flatMap((item) => {
            if (typeof item === 'string' && item.trim()) {
                return [{ id: uuidv4(), url: item.trim(), name: '连线参考视频', kind: 'video' as const }];
            }

            if (!item || typeof item !== 'object') {
                return [];
            }

            const url = typeof (item as { url?: unknown }).url === 'string'
                ? (item as { url: string }).url.trim()
                : '';
            if (!url) {
                return [];
            }

            const name = typeof (item as { name?: unknown }).name === 'string'
                ? (item as { name: string }).name.trim()
                : '';

            return [{
                id: typeof (item as { id?: unknown }).id === 'string' && (item as { id: string }).id.trim()
                    ? (item as { id: string }).id.trim()
                    : uuidv4(),
                url,
                name: name || '连线参考视频',
                kind: 'video' as const,
            }];
        });
    } catch {
        return [];
    }
}

function mergeSerializedVideoReferences(serialized: string | undefined, video: string, name = '连线参考视频') {
    const next = parseSerializedReferenceVideos(serialized);
    if (!next.some((item) => item.url === video)) {
        next.push({
            id: uuidv4(),
            url: video,
            name,
            kind: 'video',
        });
    }

    return next.length > 0 ? JSON.stringify(next) : undefined;
}

function appendLinkedElements(element: CanvasElement, linkedIds: string[]) {
    const next = [...(element.linkedElements || [])];
    linkedIds.forEach((linkedId) => {
        if (!next.includes(linkedId)) {
            next.push(linkedId);
        }
    });
    return next;
}

function createReferenceConnector(sourceId: string, targetId: string, groupId?: string): CanvasElement {
    return {
        id: uuidv4(),
        type: 'connector',
        x: 0,
        y: 0,
        connectorFrom: sourceId,
        connectorTo: targetId,
        connectorKind: CANVAS_REFERENCE_CONNECTOR_KIND,
        connectorFromPort: 'image-output',
        connectorToPort: 'generator-reference-input',
        connectorStyle: 'solid',
        color: '#00BCFF',
        strokeWidth: 2.25,
        groupId,
    };
}

function createGeneratorFlowConnector(
    sourceId: string,
    targetId: string,
    groupId?: string,
): CanvasElement {
    return {
        id: uuidv4(),
        type: 'connector',
        x: 0,
        y: 0,
        connectorFrom: sourceId,
        connectorTo: targetId,
        connectorFromPort: 'generator-flow-output',
        connectorToPort: 'generator-reference-input',
        connectorStyle: 'solid',
        color: '#00BCFF',
        strokeWidth: 2.25,
        groupId,
    };
}

function getReferenceTargetSize(type: ReferenceConnectionTargetType) {
    return type === 'storyboard-planner'
        ? { width: 420, height: 320 }
        : { width: 400, height: 400 };
}

function buildGeneratorFlowNodeAttrs(
    type: ReferenceConnectionTargetType,
    anchorPoint: CanvasPoint,
    groupId: string,
    placement: 'upstream' | 'downstream',
    linkedElementId: string,
): Omit<CanvasElement, 'id' | 'type'> {
    const { width, height } = getReferenceTargetSize(type);
    return {
        x: placement === 'upstream' ? anchorPoint.x - width : anchorPoint.x,
        y: anchorPoint.y - height / 2,
        width,
        height,
        savedPrompt: '',
        groupId,
        linkedElements: [linkedElementId],
    };
}

function buildReferenceTargetAttrs(
    type: ReferenceConnectionTargetType,
    sourceElement: ReferenceSourceElement,
    anchorPoint: CanvasPoint,
    groupId: string,
): Omit<CanvasElement, 'id' | 'type'> {
    const { width, height } = getReferenceTargetSize(type);
    const baseAttrs: Omit<CanvasElement, 'id' | 'type'> = {
        x: anchorPoint.x,
        y: anchorPoint.y - height / 2,
        width,
        height,
        referenceImageId: undefined,
        savedPrompt: sourceElement.savedPrompt || '',
        groupId,
        linkedElements: [sourceElement.id],
    };

    if (type === 'image-generator') {
        return {
            ...baseAttrs,
            savedReferenceImages: sourceElement.type === 'image'
                ? mergeSerializedImageReferences(undefined, [sourceElement.content])
                : undefined,
        };
    }

    if (type === 'video-generator') {
        return {
            ...baseAttrs,
            savedFrameImages: sourceElement.type === 'image'
                ? mergeSerializedFrameReferenceImages(undefined, sourceElement.content)
                : undefined,
            savedReferenceVideos: sourceElement.type === 'video'
                ? mergeSerializedVideoReferences(undefined, sourceElement.content)
                : undefined,
        };
    }

    return {
        ...baseAttrs,
        savedReferenceImages: sourceElement.type === 'image'
            ? mergeSerializedImageReferences(undefined, [sourceElement.content])
            : undefined,
    };
}

function applyReferenceConnectionToElements(
    elements: CanvasElement[],
    sourceElement: ReferenceSourceElement,
    targetElement: ReferenceTargetElement,
    connectorElement: CanvasElement,
) {
    return elements.map((element) => {
        if (element.id === sourceElement.id) {
            return {
                ...element,
                groupId: element.groupId || targetElement.groupId,
                linkedElements: appendLinkedElements(element, [connectorElement.id, targetElement.id]),
            };
        }

        if (element.id === targetElement.id) {
            return {
                ...element,
                referenceImageId: undefined,
                savedReferenceImages: sourceElement.type === 'image' && (element.type === 'image-generator' || element.type === 'storyboard-planner')
                    ? mergeSerializedImageReferences(element.savedReferenceImages, [sourceElement.content])
                    : element.savedReferenceImages,
                savedFrameImages: sourceElement.type === 'image' && element.type === 'video-generator'
                    ? mergeSerializedFrameReferenceImages(element.savedFrameImages, sourceElement.content)
                    : element.savedFrameImages,
                savedReferenceVideos: sourceElement.type === 'video' && element.type === 'video-generator'
                    ? mergeSerializedVideoReferences(element.savedReferenceVideos, sourceElement.content)
                    : element.savedReferenceVideos,
                linkedElements: appendLinkedElements(element, [sourceElement.id, connectorElement.id]),
            };
        }

        return element;
    });
}

function applyGeneratorFlowConnectionToElements(
    elements: CanvasElement[],
    sourceElement: CanvasElement & { type: ReferenceConnectionTargetType },
    targetElement: CanvasElement & { type: ReferenceConnectionTargetType },
    connectorElement: CanvasElement,
) {
    return elements.map((element) => {
        if (element.id === sourceElement.id) {
            return {
                ...element,
                groupId: element.groupId || targetElement.groupId,
                linkedElements: appendLinkedElements(element, [connectorElement.id, targetElement.id]),
            };
        }

        if (element.id === targetElement.id) {
            return {
                ...element,
                groupId: element.groupId || sourceElement.groupId,
                linkedElements: appendLinkedElements(element, [sourceElement.id, connectorElement.id]),
            };
        }

        return element;
    });
}

function canStartReferenceConnectionFromPort(element: CanvasElement | undefined, port: ReferenceConnectionPort) {
    if (port === 'image-output') {
        return isReferenceSourceElement(element);
    }

    return isReferenceTargetElement(element);
}

export function useCanvasFlowConnection({
    elementsMapRef,
    dirtyTrackerRef,
    setElements,
    buildGeneratorElement,
}: UseCanvasFlowConnectionOptions) {
    const [referenceConnectionStart, setReferenceConnectionStart] = useState<ReferenceConnectionStart | null>(null);
    const referenceConnectionSourceId = referenceConnectionStart?.elementId ?? null;
    const referenceConnectionPort = referenceConnectionStart?.port ?? null;

    const handleCancelReferenceConnection = useCallback(() => {
        setReferenceConnectionStart(null);
    }, []);

    const handleStartReferenceConnection = useCallback((sourceId: string, port: ReferenceConnectionPort = 'image-output') => {
        const sourceElement = elementsMapRef.current.get(sourceId);
        if (!canStartReferenceConnectionFromPort(sourceElement, port)) {
            return;
        }

        setReferenceConnectionStart({ elementId: sourceId, port });
    }, [elementsMapRef]);

    const completeReferenceMediaConnection = useCallback((sourceElement: ReferenceSourceElement, targetElement: ReferenceTargetElement) => {
        if (!sourceElement.content) {
            return;
        }

        if (!canReferenceSourceConnectToTarget(sourceElement, targetElement)) {
            return;
        }

        let addedConnectorId: string | null = null;
        let sourceWasModified = false;
        let targetWasModified = false;
        setElements((prev) => {
            const duplicateConnector = prev.find((element) => (
                element.type === 'connector'
                && element.connectorKind === CANVAS_REFERENCE_CONNECTOR_KIND
                && element.connectorFrom === sourceElement.id
                && element.connectorTo === targetElement.id
            ));

            if (duplicateConnector) {
                return prev;
            }

            const connectorElement = createReferenceConnector(sourceElement.id, targetElement.id, targetElement.groupId || sourceElement.groupId);
            addedConnectorId = connectorElement.id;

            sourceWasModified = true;
            targetWasModified = true;
            const updatedPrev = applyReferenceConnectionToElements(prev, sourceElement, targetElement, connectorElement);

            return [...updatedPrev, connectorElement];
        });

        if (addedConnectorId) {
            dirtyTrackerRef.current.markAdded(addedConnectorId);
        }
        if (sourceWasModified) {
            dirtyTrackerRef.current.markModified(sourceElement.id);
        }
        if (targetWasModified) {
            dirtyTrackerRef.current.markModified(targetElement.id);
        }
    }, [dirtyTrackerRef, setElements]);

    const completeGeneratorFlowConnection = useCallback((sourceElement: CanvasElement & { type: ReferenceConnectionTargetType }, targetElement: CanvasElement & { type: ReferenceConnectionTargetType }) => {
        let addedConnectorId: string | null = null;
        let sourceWasModified = false;
        let targetWasModified = false;
        setElements((prev) => {
            const duplicateConnector = prev.find((element) => (
                element.type === 'connector'
                && element.connectorKind !== CANVAS_REFERENCE_CONNECTOR_KIND
                && element.connectorFrom === sourceElement.id
                && element.connectorTo === targetElement.id
                && element.connectorFromPort === 'generator-flow-output'
                && element.connectorToPort === 'generator-reference-input'
            ));

            if (duplicateConnector) {
                return prev;
            }

            const connectorElement = createGeneratorFlowConnector(sourceElement.id, targetElement.id, targetElement.groupId || sourceElement.groupId);
            addedConnectorId = connectorElement.id;

            sourceWasModified = true;
            targetWasModified = true;
            const updatedPrev = applyGeneratorFlowConnectionToElements(prev, sourceElement, targetElement, connectorElement);

            return [...updatedPrev, connectorElement];
        });

        if (addedConnectorId) {
            dirtyTrackerRef.current.markAdded(addedConnectorId);
        }
        if (sourceWasModified) {
            dirtyTrackerRef.current.markModified(sourceElement.id);
        }
        if (targetWasModified) {
            dirtyTrackerRef.current.markModified(targetElement.id);
        }
    }, [dirtyTrackerRef, setElements]);

    const handleCompleteReferenceConnection = useCallback((targetId: string, targetPort: ReferenceConnectionPort = 'generator-reference-input') => {
        const start = referenceConnectionStart;
        if (!start) {
            return;
        }

        const startElement = elementsMapRef.current.get(start.elementId);
        const targetElement = elementsMapRef.current.get(targetId);

        if (start.port === 'image-output' && targetPort === 'generator-reference-input') {
            if (canReferenceSourceConnectToTarget(startElement, targetElement) && isReferenceTargetElement(targetElement)) {
                completeReferenceMediaConnection(startElement, targetElement);
            }
            setReferenceConnectionStart(null);
            return;
        }

        if (start.port === 'generator-reference-input' && targetPort === 'image-output') {
            if (canReferenceSourceConnectToTarget(targetElement, startElement) && isReferenceTargetElement(startElement)) {
                completeReferenceMediaConnection(targetElement, startElement);
            }
            setReferenceConnectionStart(null);
            return;
        }

        if (start.port === 'generator-flow-output' && targetPort === 'generator-reference-input') {
            if (isReferenceTargetElement(startElement) && isReferenceTargetElement(targetElement) && startElement.id !== targetElement.id) {
                completeGeneratorFlowConnection(startElement, targetElement);
            }
            setReferenceConnectionStart(null);
            return;
        }

        if (start.port === 'generator-reference-input' && targetPort === 'generator-flow-output') {
            if (isReferenceTargetElement(startElement) && isReferenceTargetElement(targetElement) && startElement.id !== targetElement.id) {
                completeGeneratorFlowConnection(targetElement, startElement);
            }
            setReferenceConnectionStart(null);
            return;
        }

        setReferenceConnectionStart(null);
    }, [completeGeneratorFlowConnection, completeReferenceMediaConnection, elementsMapRef, referenceConnectionStart]);

    const handleCreateReferenceConnectionFromCanvasSelection = useCallback((sourceElementId: string, targetElementId: string) => {
        const sourceElement = elementsMapRef.current.get(sourceElementId);
        const targetElement = elementsMapRef.current.get(targetElementId);

        if (canReferenceSourceConnectToTarget(sourceElement, targetElement) && isReferenceTargetElement(targetElement)) {
            completeReferenceMediaConnection(sourceElement, targetElement);
        }
    }, [completeReferenceMediaConnection, elementsMapRef]);

    const handleCreateReferenceConnectionTarget = useCallback((type: ReferenceConnectionTargetType, anchorPoint: CanvasPoint) => {
        const start = referenceConnectionStart;
        if (!start) {
            return;
        }

        const sourceElement = elementsMapRef.current.get(start.elementId);
        if (start.port === 'image-output') {
            if (!canReferenceSourceConnectToTarget(sourceElement, { type, id: '', x: 0, y: 0 }) || !sourceElement.content) {
                setReferenceConnectionStart(null);
                return;
            }

            const groupId = sourceElement.groupId || uuidv4();
            const targetElement = buildGeneratorElement(type, buildReferenceTargetAttrs(type, sourceElement, anchorPoint, groupId)) as CanvasElement & { type: ReferenceConnectionTargetType };
            const connectorElement = createReferenceConnector(sourceElement.id, targetElement.id, groupId);
            targetElement.linkedElements = appendLinkedElements(targetElement, [connectorElement.id]);

            setElements((prev) => {
                const next = prev.map((element) => {
                    if (element.id !== sourceElement.id) {
                        return element;
                    }

                    return {
                        ...element,
                        groupId,
                        linkedElements: appendLinkedElements(element, [connectorElement.id, targetElement.id]),
                    };
                });

                return [...next, connectorElement, targetElement];
            });

            dirtyTrackerRef.current.markModified(sourceElement.id);
            dirtyTrackerRef.current.markAdded(connectorElement.id);
            dirtyTrackerRef.current.markAdded(targetElement.id);
            setReferenceConnectionStart(null);
            return;
        }

        if (!isReferenceTargetElement(sourceElement)) {
            setReferenceConnectionStart(null);
            return;
        }

        const placement: 'upstream' | 'downstream' = start.port === 'generator-reference-input'
            ? 'upstream'
            : 'downstream';
        const groupId = sourceElement.groupId || uuidv4();
        const newGeneratorElement = buildGeneratorElement(type, buildGeneratorFlowNodeAttrs(type, anchorPoint, groupId, placement, sourceElement.id)) as CanvasElement & { type: ReferenceConnectionTargetType };
        const flowSourceElement = placement === 'upstream' ? newGeneratorElement : sourceElement;
        const flowTargetElement = placement === 'upstream' ? sourceElement : newGeneratorElement;
        const connectorElement = createGeneratorFlowConnector(flowSourceElement.id, flowTargetElement.id, groupId);
        newGeneratorElement.linkedElements = appendLinkedElements(newGeneratorElement, [connectorElement.id]);

        setElements((prev) => {
            const next = prev.map((element) => {
                if (element.id !== sourceElement.id) {
                    return element;
                }

                return {
                    ...element,
                    groupId,
                    linkedElements: appendLinkedElements(element, [connectorElement.id, newGeneratorElement.id]),
                };
            });

            return placement === 'upstream'
                ? [...next, newGeneratorElement, connectorElement]
                : [...next, connectorElement, newGeneratorElement];
        });

        dirtyTrackerRef.current.markModified(sourceElement.id);
        dirtyTrackerRef.current.markAdded(connectorElement.id);
        dirtyTrackerRef.current.markAdded(newGeneratorElement.id);
        setReferenceConnectionStart(null);
    }, [buildGeneratorElement, dirtyTrackerRef, elementsMapRef, referenceConnectionStart, setElements]);

    const handleConnectFlow = useCallback((sourceElement: CanvasElement) => {
        const persistedSourceElement = elementsMapRef.current.get(sourceElement.id);
        const latestSourceElement = persistedSourceElement
            ? { ...persistedSourceElement, ...sourceElement }
            : sourceElement;
        if (!latestSourceElement.content) return;

        const spacing = 120;
        const groupId = uuidv4();
        const generatorId = uuidv4();
        const hasLinkedFlowConnector = latestSourceElement.linkedElements?.some((linkedId) => elementsMapRef.current.get(linkedId)?.type === 'connector') ?? false;
        const shouldInheritSavedReferences = !(latestSourceElement.type === 'image' && (latestSourceElement.referenceImageId || hasLinkedFlowConnector));

        const inheritedReferenceImages = (() => {
            const nextImages = [latestSourceElement.content];
            if (latestSourceElement.type === 'image' && latestSourceElement.flowReferenceImages?.trim()) {
                appendSerializedReferenceImages(nextImages, latestSourceElement.flowReferenceImages);
            } else if (shouldInheritSavedReferences && latestSourceElement.savedReferenceImages?.trim()) {
                appendSerializedReferenceImages(nextImages, latestSourceElement.savedReferenceImages);
            }

            return nextImages.length > 0 ? JSON.stringify(nextImages) : undefined;
        })();

        const generatorElement: CanvasElement = {
            ...buildGeneratorElement('image-generator', {
                x: latestSourceElement.x + (latestSourceElement.width || 400) + spacing,
                y: latestSourceElement.y,
                width: latestSourceElement.width || 400,
                height: latestSourceElement.height || 400,
                referenceImageId: undefined,
                savedPrompt: latestSourceElement.savedPrompt || '',
                savedReferenceImages: inheritedReferenceImages,
                groupId,
                linkedElements: [latestSourceElement.id],
            }),
            id: generatorId,
        };

        const connectorElement = createReferenceConnector(latestSourceElement.id, generatorId, groupId);
        generatorElement.linkedElements = appendLinkedElements(generatorElement, [connectorElement.id]);

        setElements(prev => {
            const updatedPrev = prev.map(el => {
                if (el.id === sourceElement.id) {
                    return {
                        ...el,
                        groupId,
                        linkedElements: appendLinkedElements(el, [connectorElement.id, generatorId]),
                    };
                }
                return el;
            });
            return [...updatedPrev, connectorElement, generatorElement];
        });
        dirtyTrackerRef.current.markModified(latestSourceElement.id);
        dirtyTrackerRef.current.markAdded(connectorElement.id);
        dirtyTrackerRef.current.markAdded(generatorId);
    }, [buildGeneratorElement, dirtyTrackerRef, elementsMapRef, setElements]);

    return {
        handleConnectFlow,
        referenceConnectionSourceId,
        referenceConnectionPort,
        handleStartReferenceConnection,
        handleCompleteReferenceConnection,
        handleCreateReferenceConnectionFromCanvasSelection,
        handleCreateReferenceConnectionTarget,
        handleCancelReferenceConnection,
    };
}