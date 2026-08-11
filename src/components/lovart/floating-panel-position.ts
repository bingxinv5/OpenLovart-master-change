import type { CSSProperties } from 'react';

export interface CanvasVisualViewport {
    scale: number;
    pan: { x: number; y: number };
}

export interface FloatingPanelAnchorRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FloatingPanelScreenPosition {
    left: number;
    top: number;
    placement: 'above' | 'below';
}

function sanitizeClassPart(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function toCssLength(value: CSSProperties['left'] | CSSProperties['top'], fallback: string) {
    if (typeof value === 'number') {
        return `${value}px`;
    }

    const length = String(value || '').trim();
    if (/^-?\d+(\.\d+)?(px|rem|em|vh|vw|%)$/.test(length)) {
        return length;
    }

    return fallback;
}

function toCssTransform(value: CSSProperties['transform'], fallback: string) {
    const transform = String(value || '').trim();
    if (/^scale\(\d+(\.\d+)?\)$/.test(transform)) {
        return transform;
    }

    return fallback;
}

export function resolveFloatingPanelScale(value: CSSProperties['transform'], fallback = 1) {
    const transform = String(value || '').trim();
    const match = /^scale\((\d+(?:\.\d+)?)\)$/.exec(transform);
    const scale = match ? Number.parseFloat(match[1]) : fallback;
    return Number.isFinite(scale) && scale > 0 ? scale : fallback;
}

function toCssTransformOrigin(value: CSSProperties['transformOrigin'], fallback: string) {
    const transformOrigin = String(value || '').trim();
    if (/^(top|center|bottom)\s+(left|center|right)$/.test(transformOrigin)) {
        return transformOrigin;
    }

    return fallback;
}

export function buildFloatingPanelPositionClassName(prefix: string, id: string) {
    return `${prefix}-${sanitizeClassPart(id)}`;
}

export function buildFloatingPanelPositionCss(className: string, style: CSSProperties | undefined) {
    return `
.${className} {
    left: ${toCssLength(style?.left, '0px')};
    top: ${toCssLength(style?.top, '0px')};
    transform: ${toCssTransform(style?.transform, 'none')};
    transform-origin: ${toCssTransformOrigin(style?.transformOrigin, 'top left')};
}
`;
}


export function resolveFloatingPanelScreenPosition({
    anchor,
    viewport,
    panelWidth,
    panelHeight,
    panelScale = 1,
    viewportWidth,
    viewportHeight,
    gap = 20,
    margin = 16,
}: {
    anchor: FloatingPanelAnchorRect;
    viewport: CanvasVisualViewport;
    panelWidth: number;
    panelHeight: number;
    panelScale?: number;
    viewportWidth?: number;
    viewportHeight?: number;
    gap?: number;
    margin?: number;
}): FloatingPanelScreenPosition {
    const visualWidth = Math.max(0, panelWidth) * panelScale;
    const visualHeight = Math.max(0, panelHeight) * panelScale;
    const anchorLeft = anchor.x * viewport.scale + viewport.pan.x;
    const anchorTop = anchor.y * viewport.scale + viewport.pan.y;
    const anchorWidth = Math.max(0, anchor.width) * viewport.scale;
    const anchorHeight = Math.max(0, anchor.height) * viewport.scale;
    const requestedLeft = anchorLeft + anchorWidth / 2 - visualWidth / 2;

    const left = Number.isFinite(viewportWidth) && (viewportWidth ?? 0) > 0
        ? Math.max(margin, Math.min(requestedLeft, Math.max(margin, (viewportWidth as number) - visualWidth - margin)))
        : requestedLeft;

    const belowTop = anchorTop + anchorHeight + gap;
    const aboveTop = anchorTop - visualHeight - gap;
    let top = belowTop;
    let placement: FloatingPanelScreenPosition['placement'] = 'below';

    if (Number.isFinite(viewportHeight) && (viewportHeight ?? 0) > 0 && visualHeight > 0) {
        const height = viewportHeight as number;
        const spaceBelow = height - margin - belowTop;
        const spaceAbove = anchorTop - gap - margin;
        if (visualHeight > spaceBelow && spaceAbove > spaceBelow) {
            top = aboveTop;
            placement = 'above';
        }
        top = Math.max(margin, Math.min(top, Math.max(margin, height - visualHeight - margin)));
    }

    return { left, top, placement };
}
