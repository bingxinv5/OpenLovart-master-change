import { describe, expect, it } from 'vitest';
import { buildCanvasRenderPlan } from './canvas-render-plan';
import type { CanvasElement } from './canvas-types';

function makeElement(id: string, attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id,
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        ...attrs,
    };
}

function buildDefaultPlan(overrides: Partial<Parameters<typeof buildCanvasRenderPlan>[0]> = {}) {
    return buildCanvasRenderPlan({
        elements: [],
        selectedIds: [],
        pan: { x: 0, y: 0 },
        scale: 1,
        viewportSize: { width: 1000, height: 1000 },
        isDragging: false,
        isPanning: false,
        isResizing: false,
        isSelecting: false,
        ...overrides,
    });
}

describe('buildCanvasRenderPlan', () => {
    it('uses a non-virtualized fallback when viewport dimensions are not ready', () => {
        const result = buildDefaultPlan({
            viewportSize: { width: 0, height: 0 },
            elements: [
                makeElement('visible'),
                makeElement('hidden', { hidden: true }),
            ],
        });

        expect(result.visibleElements.map(element => element.id)).toEqual(['visible']);
        expect(result.culledCount).toBe(0);
        expect(result.virtualizedCount).toBe(0);
        expect(result.deferredCount).toBe(0);
        expect(result.partitionCount).toBe(1);
    });

    it('uses spatial index hits and still keeps selected elements, frames, and connectors visible', () => {
        const searchCalls: unknown[] = [];
        const spatialIndex = {
            size: 1,
            search(bounds: unknown) {
                searchCalls.push(bounds);
                return ['indexed'];
            },
        };

        const result = buildDefaultPlan({
            spatialIndex,
            selectedIds: ['selected'],
            elements: [
                makeElement('indexed', { x: 100, y: 100 }),
                makeElement('selected', { x: 8000, y: 8000 }),
                makeElement('frame', { type: 'frame', x: 9000, y: 9000 }),
                makeElement('connector', { type: 'connector', x: 10000, y: 10000 }),
                makeElement('outside', { x: 11000, y: 11000 }),
            ],
        });

        expect(searchCalls).toHaveLength(1);
        expect(result.visibleElements.map(element => element.id)).toEqual([
            'indexed',
            'selected',
            'frame',
            'connector',
        ]);
    });

    it('falls back to linear viewport culling when no spatial index is available', () => {
        const result = buildDefaultPlan({
            elements: [
                makeElement('inside', { x: 100, y: 100 }),
                makeElement('outside', { x: 5000, y: 5000 }),
            ],
        });

        expect(result.visibleElements.map(element => element.id)).toEqual(['inside']);
        expect(result.culledCount).toBe(1);
    });

    it('virtualizes dense canvases while keeping selected, frame, and connector elements rendered', () => {
        const denseElements = Array.from({ length: 260 }, (_, index) => (
            makeElement(`image-${index}`, { x: index * 4, y: index * 3 })
        ));
        const specialElements = [
            makeElement('selected', { x: 10000, y: 10000 }),
            makeElement('frame', { type: 'frame', x: 12000, y: 12000 }),
            makeElement('connector', { type: 'connector', x: 14000, y: 14000 }),
        ];

        const result = buildDefaultPlan({
            elements: [...denseElements, ...specialElements],
            selectedIds: ['selected'],
        });
        const visibleIds = new Set(result.visibleElements.map(element => element.id));

        expect(result.visibleElements.length).toBeLessThanOrEqual(result.maxVisibleElements);
        expect(result.virtualizedCount).toBeGreaterThan(0);
        expect(result.deferredCount).toBeGreaterThan(0);
        expect(result.partitionCount).toBeGreaterThan(0);
        expect(visibleIds.has('selected')).toBe(true);
        expect(visibleIds.has('frame')).toBe(true);
        expect(visibleIds.has('connector')).toBe(true);
    });

    it('lowers max visible elements during active interactions', () => {
        const idle = buildDefaultPlan({ viewportSize: { width: 1600, height: 1000 } });
        const dragging = buildDefaultPlan({
            viewportSize: { width: 1600, height: 1000 },
            isDragging: true,
        });

        expect(dragging.maxVisibleElements).toBeLessThan(idle.maxVisibleElements);
    });
});