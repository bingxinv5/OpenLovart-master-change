import type { CanvasElement } from './canvas-types';

export type CanvasPoint = { x: number; y: number };

export type FrameDrawBox = {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
};

export function createMarkElementAtPoint(params: {
    point: CanvasPoint;
    elements: CanvasElement[];
    nextId: () => string;
}): { element: CanvasElement; targetElement?: CanvasElement } {
    const { point, elements, nextId } = params;
    const existingMarks = elements.filter(element => element.type === 'mark');
    const markNumber = existingMarks.length > 0
        ? Math.max(...existingMarks.map(mark => mark.markNumber || 0)) + 1
        : 1;
    const targetElement = [...elements].reverse().find(element => {
        if (element.type !== 'image' && element.type !== 'video') return false;
        if (!element.content) return false;
        const right = element.x + (element.width || 0);
        const bottom = element.y + (element.height || 0);
        return point.x >= element.x && point.x <= right && point.y >= element.y && point.y <= bottom;
    });

    return {
        element: {
            id: nextId(),
            type: 'mark',
            x: point.x - 16,
            y: point.y - 30,
            width: 32,
            height: 32,
            markNumber,
            markText: '',
            color: '#EF4444',
            markTargetId: targetElement?.id,
        },
        targetElement,
    };
}

export function createFrameElementFromDrawBox(params: {
    box: FrameDrawBox;
    elements: CanvasElement[];
    nextId: () => string;
}): { frame: CanvasElement; containedElementIds: string[] } | null {
    const { box, elements, nextId } = params;
    const x = Math.min(box.startX, box.currentX);
    const y = Math.min(box.startY, box.currentY);
    const width = Math.abs(box.currentX - box.startX);
    const height = Math.abs(box.currentY - box.startY);

    if (width < 20 || height < 20) {
        return null;
    }

    const roundedWidth = Math.round(width);
    const roundedHeight = Math.round(height);
    const frameId = nextId();
    const containedElementIds = elements
        .filter(element => {
            if (element.type === 'connector' || element.parentFrameId) return false;
            const centerX = element.x + (element.width || 0) / 2;
            const centerY = element.y + (element.height || 0) / 2;
            return centerX >= x && centerX <= x + roundedWidth && centerY >= y && centerY <= y + roundedHeight;
        })
        .map(element => element.id);

    return {
        frame: {
            id: frameId,
            type: 'frame',
            x,
            y,
            width: roundedWidth,
            height: roundedHeight,
            framePreset: 'Custom',
            frameBgColor: '#FFFFFF',
            frameClip: true,
            frameName: 'Frame',
        },
        containedElementIds,
    };
}

export function createPathElementFromPoints(params: {
    points: CanvasPoint[];
    nextId: () => string;
}): CanvasElement | null {
    const { points, nextId } = params;
    if (points.length <= 1) {
        return null;
    }

    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;

    return {
        id: nextId(),
        type: 'path',
        x: minX,
        y: minY,
        width: Math.max(width, 1),
        height: Math.max(height, 1),
        points: points.map(point => ({ x: point.x - minX, y: point.y - minY })),
        color: '#000000',
        strokeWidth: 3,
    };
}

export function collectDragInitialPositions(
    elements: CanvasElement[],
    selectionIds: string[],
): { id: string; x: number; y: number }[] {
    const frameChildIds = new Set<string>();
    const selectionIdSet = new Set(selectionIds);

    const collectDescendants = (parentId: string) => {
        elements.forEach(child => {
            if (child.parentFrameId !== parentId || selectionIdSet.has(child.id) || frameChildIds.has(child.id)) {
                return;
            }
            frameChildIds.add(child.id);
            if (child.type === 'frame') collectDescendants(child.id);
        });
    };

    selectionIds.forEach(selectionId => {
        const element = elements.find(item => item.id === selectionId);
        if (element?.type === 'frame') collectDescendants(selectionId);
    });

    const dragIds = new Set([...selectionIds, ...frameChildIds]);
    return elements
        .filter(element => dragIds.has(element.id))
        .map(element => ({ id: element.id, x: element.x, y: element.y }));
}

export function getDragSelectionAnchor(
    elements: CanvasElement[],
    selectionIds: string[],
): CanvasPoint | null {
    const selectionIdSet = new Set(selectionIds);
    const selectedElements = elements.filter(element => selectionIdSet.has(element.id));
    if (selectedElements.length === 0) {
        return null;
    }

    return {
        x: Math.min(...selectedElements.map(element => element.x)),
        y: Math.min(...selectedElements.map(element => element.y)),
    };
}