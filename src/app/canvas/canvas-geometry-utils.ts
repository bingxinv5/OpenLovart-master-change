/**
 * canvas-geometry-utils.ts — 画布矩形碰撞、分割布局评分
 *
 * Pure geometry functions for canvas layout decisions.
 * Split from canvas-media-utils to keep media utilities
 * focused on image sizing, viewport, and collections.
 */

import type { CanvasElement } from '@/components/lovart/canvas-types';

export function rectsIntersect(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function getRectIntersectionArea(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
) {
    const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return x * y;
}

export type ViewportBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

export function getSplitLayoutBounds(
    originX: number,
    originY: number,
    colWidths: number[],
    rowHeights: number[],
    gap: number,
) {
    const width = colWidths.reduce((sum, item) => sum + item, 0) + Math.max(0, colWidths.length - 1) * gap;
    const height = rowHeights.reduce((sum, item) => sum + item, 0) + Math.max(0, rowHeights.length - 1) * gap;
    return {
        x: originX,
        y: originY,
        width,
        height,
    };
}

export function scoreSplitLayoutCandidate(
    bounds: { x: number; y: number; width: number; height: number },
    existingElements: CanvasElement[],
    viewport: ViewportBounds,
    sourceBounds: { x: number; y: number; width: number; height: number },
) {
    let overlapArea = 0;
    let overlapCount = 0;

    existingElements.forEach((element) => {
        const width = element.width || 0;
        const height = element.height || 0;
        if (width <= 0 || height <= 0) return;

        const elementBounds = { x: element.x, y: element.y, width, height };
        if (!rectsIntersect(bounds, elementBounds)) return;

        overlapCount += 1;
        overlapArea += getRectIntersectionArea(bounds, elementBounds);
    });

    const outsideLeft = Math.max(0, viewport.minX - bounds.x);
    const outsideTop = Math.max(0, viewport.minY - bounds.y);
    const outsideRight = Math.max(0, bounds.x + bounds.width - viewport.maxX);
    const outsideBottom = Math.max(0, bounds.y + bounds.height - viewport.maxY);
    const outsidePenalty = (outsideLeft + outsideTop + outsideRight + outsideBottom) * 12;

    const sourceCenterX = sourceBounds.x + sourceBounds.width / 2;
    const sourceCenterY = sourceBounds.y + sourceBounds.height / 2;
    const candidateCenterX = bounds.x + bounds.width / 2;
    const candidateCenterY = bounds.y + bounds.height / 2;
    const distancePenalty = Math.hypot(candidateCenterX - sourceCenterX, candidateCenterY - sourceCenterY) * 0.35;

    return overlapArea * 3 + overlapCount * 100_000 + outsidePenalty + distancePenalty;
}

export function chooseSplitLayoutOrigin(
    args: {
        sourceBounds: { x: number; y: number; width: number; height: number };
        viewport: ViewportBounds;
        existingElements: CanvasElement[];
        colWidths: number[];
        rowHeights: number[];
        gap: number;
    },
) {
    const { sourceBounds, viewport, existingElements, colWidths, rowHeights, gap } = args;
    const layoutWidth = colWidths.reduce((sum, item) => sum + item, 0) + Math.max(0, colWidths.length - 1) * gap;
    const layoutHeight = rowHeights.reduce((sum, item) => sum + item, 0) + Math.max(0, rowHeights.length - 1) * gap;
    const margin = 56;

    const candidates = [
        { x: sourceBounds.x + sourceBounds.width + margin, y: sourceBounds.y },
        { x: sourceBounds.x, y: sourceBounds.y + sourceBounds.height + margin },
        { x: sourceBounds.x - layoutWidth - margin, y: sourceBounds.y },
        { x: sourceBounds.x, y: sourceBounds.y - layoutHeight - margin },
        { x: viewport.minX + 32, y: viewport.minY + 32 },
        {
            x: Math.round((viewport.minX + viewport.maxX - layoutWidth) / 2),
            y: Math.round(Math.min(viewport.maxY - layoutHeight - 32, sourceBounds.y + sourceBounds.height + margin)),
        },
    ];

    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;

    candidates.forEach((candidate) => {
        const bounds = getSplitLayoutBounds(candidate.x, candidate.y, colWidths, rowHeights, gap);
        const score = scoreSplitLayoutCandidate(bounds, existingElements, viewport, sourceBounds);
        if (score < bestScore) {
            bestScore = score;
            best = candidate;
        }
    });

    return best;
}
