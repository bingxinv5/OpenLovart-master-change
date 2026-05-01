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

export function buildFloatingPanelPositionClassName(prefix: string, id: string) {
    return `${prefix}-${sanitizeClassPart(id)}`;
}

export function buildFloatingPanelPositionCss(className: string, style: CSSProperties | undefined) {
    return `
.${className} {
    left: ${toCssLength(style?.left, '0px')};
    top: ${toCssLength(style?.top, '0px')};
}
`;
}
