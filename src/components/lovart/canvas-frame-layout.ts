/**
 * Pure frame auto-layout computation.
 *
 * Extracted from CanvasArea.tsx `autoLayoutFrame` — given a frame and
 * its children, returns the position / size changes without side-effects.
 */

import type { CanvasElement, FrameAutoLayoutMode, FrameAutoLayoutAlign } from './canvas-types';
import type { ElementChange } from './canvas-alignment';
import { getDescendantIds } from './canvas-alignment';

// ── Internal types ────────────────────────────────────────────────────

interface LayoutItem {
    id: string;
    w: number;
    h: number;
    origW: number;
    origH: number;
    type: CanvasElement['type'];
    oldX: number;
    oldY: number;
}

interface RowInfo {
    items: LayoutItem[];
    rowH: number;
}

// ── Core computation ──────────────────────────────────────────────────

/**
 * Compute position/size changes to apply a frame auto-layout.
 *
 * @param frame      The parent frame element.
 * @param children   Direct non-connector children of the frame.
 * @param allElements All canvas elements (needed for descendant re-positioning).
 * @returns Array of element changes to apply, including potential frame height change.
 */
export function computeFrameLayout(
    frame: CanvasElement,
    children: CanvasElement[],
    allElements: CanvasElement[],
): ElementChange[] {
    if (children.length === 0) return [];

    const padding = 16;
    const gap = Math.max(0, frame.frameAutoLayoutGap ?? 14);
    const frameW = frame.width || 400;
    const usableW = frameW - padding * 2;

    const mode: FrameAutoLayoutMode = frame.frameAutoLayoutMode || 'flow';
    const align: FrameAutoLayoutAlign = frame.frameAutoLayoutAlign || 'center';

    const clampItem = (item: CanvasElement): LayoutItem => {
        let w = item.width || 200;
        let h = item.height || 200;
        if (w > usableW) {
            const ratio = usableW / w;
            w = usableW;
            h *= ratio;
        }
        return { id: item.id, w, h, origW: item.width || 200, origH: item.height || 200, type: item.type, oldX: item.x, oldY: item.y };
    };

    const items = children.map(clampItem);
    const changeMap = new Map<string, Partial<CanvasElement>>();

    const queueChange = (id: string, attrs: Partial<CanvasElement>) => {
        changeMap.set(id, { ...(changeMap.get(id) || {}), ...attrs });
    };

    const placeItem = (item: LayoutItem, x: number, y: number) => {
        const newX = Math.round(x);
        const newY = Math.round(y);
        const changes: Partial<CanvasElement> = { x: newX, y: newY };
        if (item.w !== item.origW || item.h !== item.origH) {
            changes.width = Math.round(item.w);
            changes.height = Math.round(item.h);
        }
        queueChange(item.id, changes);

        if (item.type === 'frame') {
            const deltaX = newX - item.oldX;
            const deltaY = newY - item.oldY;
            if (deltaX !== 0 || deltaY !== 0) {
                const descIds = getDescendantIds(item.id, allElements);
                descIds.forEach(descId => {
                    const descEl = allElements.find(e => e.id === descId);
                    if (!descEl) return;
                    queueChange(descId, { x: descEl.x + deltaX, y: descEl.y + deltaY });
                });
            }
        }
    };

    let requiredHeight = frame.height || 300;

    if (mode === 'row') {
        const totalRawWidth = items.reduce((sum, item) => sum + item.w, 0) + gap * Math.max(0, items.length - 1);
        const scaleRatio = totalRawWidth > usableW ? usableW / totalRawWidth : 1;
        const scaledItems = items.map(item => ({ ...item, w: item.w * scaleRatio, h: item.h * scaleRatio }));
        const rowHeight = Math.max(...scaledItems.map(item => item.h));
        requiredHeight = Math.max(60, rowHeight + padding * 2);
        const rowWidth = scaledItems.reduce((sum, item) => sum + item.w, 0) + gap * Math.max(0, scaledItems.length - 1);
        let cursorX = frame.x + padding + (align === 'center' ? Math.max(0, (usableW - rowWidth) / 2) : 0);
        const cursorY = frame.y + padding;
        scaledItems.forEach(item => {
            placeItem(item, cursorX, cursorY + (rowHeight - item.h) / 2);
            cursorX += item.w + gap;
        });
    } else if (mode === 'column') {
        let cursorY = frame.y + padding;
        items.forEach(item => {
            placeItem(item, frame.x + padding + (align === 'center' ? (usableW - item.w) / 2 : 0), cursorY);
            cursorY += item.h + gap;
        });
        requiredHeight = Math.max(60, cursorY - frame.y - gap + padding);
    } else if (mode === 'grid') {
        const maxWidth = Math.max(...items.map(item => item.w));
        const maxHeight = Math.max(...items.map(item => item.h));
        const columnCount = Math.max(1, Math.floor((usableW + gap) / Math.max(maxWidth + gap, 1)));
        const safeColumnCount = Math.max(1, Math.min(items.length, columnCount || 1));
        const totalGridWidth = safeColumnCount * maxWidth + gap * Math.max(0, safeColumnCount - 1);
        const startX = frame.x + padding + (align === 'center' ? Math.max(0, (usableW - totalGridWidth) / 2) : 0);
        const rowCount = Math.ceil(items.length / safeColumnCount);
        requiredHeight = Math.max(60, padding * 2 + rowCount * maxHeight + Math.max(0, rowCount - 1) * gap);

        items.forEach((item, index) => {
            const col = index % safeColumnCount;
            const row = Math.floor(index / safeColumnCount);
            const cellX = startX + col * (maxWidth + gap);
            const cellY = frame.y + padding + row * (maxHeight + gap);
            placeItem(item, cellX + (maxWidth - item.w) / 2, cellY + (maxHeight - item.h) / 2);
        });
    } else {
        // 'flow' mode
        const rows: RowInfo[] = [];
        let curRow: LayoutItem[] = [];
        let curRowW = 0;

        items.forEach(item => {
            const projectedW = curRowW + item.w + (curRow.length > 0 ? gap : 0);
            if (curRow.length > 0 && projectedW > usableW) {
                rows.push({ items: curRow, rowH: Math.max(...curRow.map(it => it.h)) });
                curRow = [item];
                curRowW = item.w;
            } else {
                curRow.push(item);
                curRowW = projectedW;
            }
        });
        if (curRow.length > 0) {
            rows.push({ items: curRow, rowH: Math.max(...curRow.map(it => it.h)) });
        }

        requiredHeight = Math.max(60, rows.reduce((sum, row) => sum + row.rowH, 0) + gap * Math.max(0, rows.length - 1) + padding * 2);
        let curY = frame.y + padding;
        rows.forEach(row => {
            const rowWidth = row.items.reduce((sum, item) => sum + item.w, 0) + gap * Math.max(0, row.items.length - 1);
            let curX = frame.x + padding + (align === 'center' ? (usableW - rowWidth) / 2 : 0);
            row.items.forEach(item => {
                placeItem(item, curX, curY + (row.rowH - item.h) / 2);
                curX += item.w + gap;
            });
            curY += row.rowH + gap;
        });
    }

    if (Math.abs(requiredHeight - (frame.height || 300)) > 2) {
        queueChange(frame.id, { height: Math.round(requiredHeight), framePreset: 'Custom' });
    }

    return Array.from(changeMap.entries()).map(([id, attrs]) => ({ id, attrs }));
}
