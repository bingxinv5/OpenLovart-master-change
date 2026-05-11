import type { CanvasElement } from '@/components/lovart/canvas-types';
import { boundsIntersect, getCanvasElementBounds, type CanvasBounds } from '@/lib/canvas-element-bounds';
import type { ActiveChunkSummary, ChunkResidencyState } from './canvas-runtime-types';
import type { CanvasChunkManifestEntry } from './project-storage';

type ViewportSize = {
    width: number;
    height: number;
};

export interface BuildActiveChunkSummaryInput {
    elements: CanvasElement[];
    chunkManifest: CanvasChunkManifestEntry[];
    hasRootChunk: boolean;
    elementById: Map<string, CanvasElement>;
    elementChunkIdById: Map<string, string>;
    selectedIds: string[];
    highlightedLayerIds: string[];
    highlightedResultId: string | null;
    pinnedChunkIds: string[];
    validChunkIdSet: Set<string>;
    pan: { x: number; y: number };
    scale: number;
    viewportSize: ViewportSize;
}

export function buildActiveChunkSummary({
    elements,
    chunkManifest,
    hasRootChunk,
    elementById,
    elementChunkIdById,
    selectedIds,
    highlightedLayerIds,
    highlightedResultId,
    pinnedChunkIds,
    validChunkIdSet,
    pan,
    scale,
    viewportSize,
}: BuildActiveChunkSummaryInput): ActiveChunkSummary {
    if (elements.length === 0 || chunkManifest.length === 0) {
        return {
            activeChunkIds: [],
            releasedChunkIds: [],
            activeElements: elements,
        };
    }

    const activeChunkIds = new Set<string>(hasRootChunk ? ['root'] : []);
    const activationMargin = Math.max(240, 360 / Math.max(scale, 0.2));
    const vpLeft = (-pan.x / scale) - activationMargin;
    const vpTop = (-pan.y / scale) - activationMargin;
    const vpRight = (viewportSize.width - pan.x) / scale + activationMargin;
    const vpBottom = (viewportSize.height - pan.y) / scale + activationMargin;
    const viewportBounds: CanvasBounds = { minX: vpLeft, minY: vpTop, maxX: vpRight, maxY: vpBottom };

    for (const chunk of chunkManifest) {
        if (!chunk.topFrameId) {
            continue;
        }

        const frame = elementById.get(chunk.topFrameId);
        if (!frame) {
            continue;
        }

        const intersectsViewport = boundsIntersect(getCanvasElementBounds(frame), viewportBounds)
            || chunk.elementIds.some((elementId) => {
                const element = elementById.get(elementId);
                return !!element && boundsIntersect(getCanvasElementBounds(element), viewportBounds);
            });

        if (intersectsViewport) {
            activeChunkIds.add(chunk.id);
        }
    }

    for (const elementId of [...selectedIds, ...highlightedLayerIds, ...(highlightedResultId ? [highlightedResultId] : [])]) {
        const chunkId = elementChunkIdById.get(elementId);
        if (chunkId) {
            activeChunkIds.add(chunkId);
        }
    }

    pinnedChunkIds.forEach((chunkId) => {
        if (validChunkIdSet.has(chunkId)) {
            activeChunkIds.add(chunkId);
        }
    });

    const activeElements = elements.filter((element) => activeChunkIds.has(elementChunkIdById.get(element.id) || 'root'));
    const releasedChunkIds = chunkManifest
        .map((chunk) => chunk.id)
        .filter((chunkId) => !activeChunkIds.has(chunkId));

    return {
        activeChunkIds: Array.from(activeChunkIds),
        releasedChunkIds,
        activeElements,
    };
}

export interface BuildChunkResidencyStateInput {
    residentChunkIds: string[];
    phase: ChunkResidencyState['phase'];
    chunkManifest: CanvasChunkManifestEntry[];
    chunkMetaById: Map<string, CanvasChunkManifestEntry>;
    labels?: {
        lastActivatedChunkLabel?: string;
        lastReleasedChunkLabel?: string;
    };
}

export function buildChunkResidencyState({
    residentChunkIds,
    phase,
    chunkManifest,
    chunkMetaById,
    labels,
}: BuildChunkResidencyStateInput): ChunkResidencyState {
    const residentSet = new Set(residentChunkIds);
    const orderedResidentChunkIds = chunkManifest
        .map((chunk) => chunk.id)
        .filter((chunkId) => residentSet.has(chunkId));
    const orderedResidentSet = new Set(orderedResidentChunkIds);
    const unloadedChunkIds = chunkManifest
        .map((chunk) => chunk.id)
        .filter((chunkId) => !orderedResidentSet.has(chunkId));

    const countElements = (chunkIds: string[]) => chunkIds.reduce((sum, chunkId) => sum + (chunkMetaById.get(chunkId)?.elementCount || 0), 0);

    return {
        phase,
        residentChunkIds: orderedResidentChunkIds,
        unloadedChunkIds,
        residentElementCount: countElements(orderedResidentChunkIds),
        unloadedElementCount: countElements(unloadedChunkIds),
        lastActivatedChunkLabel: labels?.lastActivatedChunkLabel,
        lastReleasedChunkLabel: labels?.lastReleasedChunkLabel,
    };
}

export function buildCanvasRuntimeElements(
    elements: CanvasElement[],
    chunkManifestLength: number,
    residentChunkIds: string[],
    activeChunkIds: string[],
    elementChunkIdById: Map<string, string>,
) {
    if (elements.length === 0 || chunkManifestLength === 0) {
        return elements;
    }

    const residentSet = residentChunkIds.length > 0
        ? new Set(residentChunkIds)
        : new Set(activeChunkIds);

    return elements.filter((element) => residentSet.has(elementChunkIdById.get(element.id) || 'root'));
}

export function buildChunkPanelEntries(
    chunkManifest: CanvasChunkManifestEntry[],
    activeChunkIds: string[],
    residentChunkIds: string[],
    pinnedChunkIds: string[],
) {
    const activeSet = new Set(activeChunkIds);
    const residentSet = new Set(residentChunkIds.length > 0 ? residentChunkIds : activeChunkIds);
    const pinnedSet = new Set(pinnedChunkIds);

    return chunkManifest
        .map((chunk) => ({
            ...chunk,
            isActive: activeSet.has(chunk.id),
            isPinned: pinnedSet.has(chunk.id),
            isResident: residentSet.has(chunk.id),
        }))
        .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || Number(b.isActive) - Number(a.isActive) || b.elementCount - a.elementCount);
}