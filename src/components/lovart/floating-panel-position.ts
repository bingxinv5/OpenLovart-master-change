import type { CSSProperties } from 'react';

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
