import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';

type CanvasGeneratorBuilder = (
    type: Extract<CanvasElement['type'], 'image-generator' | 'video-generator' | 'storyboard-planner'>,
    attrs: Omit<CanvasElement, 'id' | 'type'>,
) => CanvasElement;

interface UseCanvasFlowConnectionOptions {
    elementsMapRef: MutableRefObject<Map<string, CanvasElement>>;
    dirtyTrackerRef: MutableRefObject<{
        markAdded: (id: string) => void;
        markModified: (id: string) => void;
    }>;
    setElements: Dispatch<SetStateAction<CanvasElement[]>>;
    focusNewElement: (elementId: string) => void;
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

export function useCanvasFlowConnection({
    elementsMapRef,
    dirtyTrackerRef,
    setElements,
    focusNewElement,
    buildGeneratorElement,
}: UseCanvasFlowConnectionOptions) {
    return useCallback((sourceElement: CanvasElement) => {
        const persistedSourceElement = elementsMapRef.current.get(sourceElement.id);
        const latestSourceElement = persistedSourceElement
            ? { ...persistedSourceElement, ...sourceElement }
            : sourceElement;
        if (!latestSourceElement.content) return;

        const spacing = 120;
        const groupId = uuidv4();
        const connectorId = uuidv4();
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
                referenceImageId: latestSourceElement.id,
                savedPrompt: latestSourceElement.savedPrompt || '',
                savedReferenceImages: inheritedReferenceImages,
                groupId,
                linkedElements: [latestSourceElement.id, connectorId],
            }),
            id: generatorId,
        };

        const connectorElement: CanvasElement = {
            id: connectorId,
            type: 'connector',
            x: 0,
            y: 0,
            connectorFrom: latestSourceElement.id,
            connectorTo: generatorId,
            connectorStyle: 'dashed',
            color: '#6B7280',
            strokeWidth: 2,
            groupId,
        };

        setElements(prev => {
            const updatedPrev = prev.map(el => {
                if (el.id === sourceElement.id) {
                    return {
                        ...el,
                        groupId,
                        linkedElements: [connectorId, generatorId],
                    };
                }
                return el;
            });
            return [...updatedPrev, connectorElement, generatorElement];
        });
        dirtyTrackerRef.current.markModified(latestSourceElement.id);
        dirtyTrackerRef.current.markAdded(connectorId);
        dirtyTrackerRef.current.markAdded(generatorId);

        focusNewElement(generatorId);
    }, [buildGeneratorElement, dirtyTrackerRef, elementsMapRef, focusNewElement, setElements]);
}