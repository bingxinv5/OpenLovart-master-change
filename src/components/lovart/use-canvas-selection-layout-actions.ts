import { useCallback, useMemo } from 'react';
import type { CanvasElement } from './canvas-types';
import type { AlignmentDirection, AlignGuide, DistributionAxis, LayoutSelectionMode } from './canvas-alignment';
import { computeAlignment, computeDistribution, computeEqualSpacing, computeLayoutSelection, getElementsBounds } from './canvas-alignment';

export function useCanvasSelectionLayoutActions({
    elements,
    selectedIds,
    onElementChange,
    onBatchElementChange,
    flashAlignGuides,
    multiLayoutGap,
}: {
    elements: CanvasElement[];
    selectedIds: string[];
    onElementChange: (id: string, attrs: Partial<CanvasElement>) => void;
    onBatchElementChange?: (changes: { id: string; attrs: Partial<CanvasElement> }[]) => void;
    flashAlignGuides: (guides: AlignGuide[]) => void;
    multiLayoutGap: number;
}) {
    const selectedRenderableElements = useMemo(() => {
        return elements.filter((element) => selectedIds.includes(element.id) && element.type !== 'connector');
    }, [elements, selectedIds]);

    const applyElementChanges = useCallback((changes: { id: string; attrs: Partial<CanvasElement> }[]) => {
        if (changes.length === 0) return;

        if (onBatchElementChange) {
            onBatchElementChange(changes);
            return;
        }

        changes.forEach((change) => onElementChange(change.id, change.attrs));
    }, [onBatchElementChange, onElementChange]);

    const getSelectedBounds = useCallback(() => {
        return getElementsBounds(selectedRenderableElements);
    }, [selectedRenderableElements]);

    const alignElements = useCallback((direction: AlignmentDirection) => {
        const { changes, guides } = computeAlignment(selectedRenderableElements, direction);
        if (changes.length > 0) applyElementChanges(changes);
        if (guides.length > 0) flashAlignGuides(guides);
    }, [selectedRenderableElements, applyElementChanges, flashAlignGuides]);

    const distributeElements = useCallback((axis: DistributionAxis) => {
        const { changes, guides } = computeDistribution(selectedRenderableElements, axis);
        if (changes.length > 0) applyElementChanges(changes);
        if (guides.length > 0) flashAlignGuides(guides);
    }, [selectedRenderableElements, applyElementChanges, flashAlignGuides]);

    const equalSpacing = useCallback((axis: DistributionAxis, spacing?: number) => {
        const changes = computeEqualSpacing(selectedRenderableElements, axis, spacing);
        if (changes.length > 0) applyElementChanges(changes);
    }, [selectedRenderableElements, applyElementChanges]);

    const layoutSelection = useCallback((mode: LayoutSelectionMode) => {
        const { changes, guides } = computeLayoutSelection(elements, selectedIds, mode, multiLayoutGap);
        if (changes.length > 0) applyElementChanges(changes);
        if (guides.length > 0) flashAlignGuides(guides);
    }, [applyElementChanges, elements, flashAlignGuides, multiLayoutGap, selectedIds]);

    return {
        selectedRenderableElements,
        applyElementChanges,
        getSelectedBounds,
        alignElements,
        distributeElements,
        equalSpacing,
        layoutSelection,
    };
}