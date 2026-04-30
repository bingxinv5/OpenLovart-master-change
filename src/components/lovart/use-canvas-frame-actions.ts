import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement, CanvasFrameElement } from './canvas-types';
import type { CanvasElementPatchAttrs } from './canvas-element-patch';
import { isCanvasElementOfType } from './canvas-types';
import { getDescendantIds } from './canvas-alignment';
import { computeFrameLayout } from './canvas-frame-layout';

export function useCanvasFrameActions({
    elements,
    onElementChange,
    onAddElement,
    onSelect,
    applyElementChanges,
}: {
    elements: CanvasElement[];
    onElementChange: (id: string, attrs: Partial<CanvasElement>) => void;
    onAddElement: (element: CanvasElement) => void;
    onSelect: (ids: string[]) => void;
    applyElementChanges: (changes: { id: string; attrs: CanvasElementPatchAttrs }[]) => void;
}) {
    const pendingAutoLayoutRef = useRef<Set<string>>(new Set());

    const scheduleAutoLayout = useCallback((frameId: string) => {
        pendingAutoLayoutRef.current.add(frameId);
    }, []);

    const getFrameDescendantIds = useCallback((parentId: string): string[] => {
        return getDescendantIds(parentId, elements);
    }, [elements]);

    const moveElementToFrame = useCallback((elementId: string, targetFrameId?: string) => {
        const element = elements.find(el => el.id === elementId);
        if (!element || element.type === 'connector') return;

        const nextFrameId = targetFrameId || undefined;
        if ((element.parentFrameId || undefined) === nextFrameId) {
            return;
        }

        if (nextFrameId) {
            const targetFrame = elements.find(el => el.id === nextFrameId && el.type === 'frame');
            if (!targetFrame || elementId === nextFrameId) {
                return;
            }

            const ownDescendants = element.type === 'frame'
                ? new Set(getFrameDescendantIds(element.id))
                : new Set<string>();
            if (ownDescendants.has(nextFrameId)) {
                return;
            }

            onElementChange(elementId, { parentFrameId: nextFrameId });
            if (targetFrame.frameAutoLayout) {
                scheduleAutoLayout(targetFrame.id);
            }

            if (element.parentFrameId) {
                const oldFrame = elements.find(frame => frame.id === element.parentFrameId && frame.type === 'frame');
                if (oldFrame?.frameAutoLayout) {
                    scheduleAutoLayout(oldFrame.id);
                }
            }
            return;
        }

        const oldFrameId = element.parentFrameId;
        onElementChange(elementId, { parentFrameId: undefined });
        if (oldFrameId) {
            const oldFrame = elements.find(frame => frame.id === oldFrameId && frame.type === 'frame');
            if (oldFrame?.frameAutoLayout) {
                scheduleAutoLayout(oldFrameId);
            }
        }
    }, [elements, getFrameDescendantIds, onElementChange, scheduleAutoLayout]);

    const autoLayoutFrame = useCallback((frameId: string) => {
        const frame = elements.find((element): element is CanvasFrameElement => element.id === frameId && isCanvasElementOfType(element, 'frame'));
        if (!frame) return;
        const children = elements.filter(c => c.parentFrameId === frameId && c.type !== 'connector');
        if (children.length === 0) return;

        const changes = computeFrameLayout(frame, children, elements);
        applyElementChanges(changes);
    }, [applyElementChanges, elements]);

    useEffect(() => {
        if (pendingAutoLayoutRef.current.size === 0) {
            return;
        }

        const frameIds = Array.from(pendingAutoLayoutRef.current);
        pendingAutoLayoutRef.current.clear();
        frameIds.forEach((frameId) => {
            const frame = elements.find(element => element.id === frameId && element.type === 'frame' && element.frameAutoLayout);
            if (frame) {
                autoLayoutFrame(frameId);
            }
        });
    }, [autoLayoutFrame, elements]);

    const addFrameAtPosition = useCallback((cx: number, cy: number, width: number = 400, height: number = 300) => {
        const frameId = uuidv4();
        const frameX = cx - Math.round(width / 2);
        const frameY = cy - Math.round(height / 2);
        const frame: CanvasElement = {
            id: frameId,
            type: 'frame',
            x: frameX,
            y: frameY,
            width,
            height,
            framePreset: 'Custom',
            frameBgColor: '#FFFFFF',
            frameClip: true,
            frameName: 'Frame',
        };
        onAddElement(frame);
        onSelect([frame.id]);
        elements.forEach(el => {
            if (el.type === 'connector') return;
            const elCenterX = el.x + (el.width || 0) / 2;
            const elCenterY = el.y + (el.height || 0) / 2;
            if (elCenterX >= frameX && elCenterX <= frameX + width &&
                elCenterY >= frameY && elCenterY <= frameY + height) {
                if (!el.parentFrameId) {
                    onElementChange(el.id, { parentFrameId: frameId });
                }
            }
        });
    }, [elements, onAddElement, onElementChange, onSelect]);

    return {
        scheduleAutoLayout,
        moveElementToFrame,
        autoLayoutFrame,
        addFrameAtPosition,
    };
}