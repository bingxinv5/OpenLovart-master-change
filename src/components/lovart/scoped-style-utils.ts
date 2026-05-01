import type { CSSProperties } from 'react';

const UNITLESS_CSS_PROPERTIES = new Set([
    'animationIterationCount',
    'aspectRatio',
    'borderImageOutset',
    'borderImageSlice',
    'borderImageWidth',
    'boxFlex',
    'boxFlexGroup',
    'boxOrdinalGroup',
    'columnCount',
    'columns',
    'flex',
    'flexGrow',
    'flexPositive',
    'flexShrink',
    'flexNegative',
    'flexOrder',
    'gridArea',
    'gridRow',
    'gridRowEnd',
    'gridRowSpan',
    'gridRowStart',
    'gridColumn',
    'gridColumnEnd',
    'gridColumnSpan',
    'gridColumnStart',
    'fontWeight',
    'lineClamp',
    'lineHeight',
    'opacity',
    'order',
    'orphans',
    'tabSize',
    'widows',
    'zIndex',
    'zoom',
]);

function toCssPropertyName(property: string) {
    if (property.startsWith('--')) return property;
    return property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function toCssPropertyValue(property: string, value: unknown) {
    if (value === null || value === undefined || typeof value === 'boolean') return null;
    if (typeof value === 'number') {
        if (value === 0 || property.startsWith('--') || UNITLESS_CSS_PROPERTIES.has(property)) {
            return String(value);
        }
        return `${value}px`;
    }

    return String(value).replace(/[;{}]/g, '').trim();
}

export function buildCssPropertiesRule(className: string, properties: CSSProperties) {
    const declarations = Object.entries(properties)
        .map(([property, value]) => {
            const cssValue = toCssPropertyValue(property, value);
            return cssValue ? `    ${toCssPropertyName(property)}: ${cssValue};` : null;
        })
        .filter(Boolean)
        .join('\n');

    return declarations ? `\n.${className} {\n${declarations}\n}\n` : '';
}
