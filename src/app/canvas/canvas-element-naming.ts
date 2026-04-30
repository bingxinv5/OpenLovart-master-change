/**
 * canvas-element-naming.ts — Element naming, cloning, and tool-result helpers.
 *
 * Pure functions for CanvasElement display name resolution,
 * filename sanitization, and tool-result naming patterns.
 * Separated from canvas-export-utils to keep export concerns focused on file I/O.
 */

import type { CanvasElement } from '@/components/lovart/canvas-types';
import { isCanvasElementOfType } from '@/components/lovart/canvas-types';

export function cloneCanvasElement(element: CanvasElement): CanvasElement {
    return JSON.parse(JSON.stringify(element)) as CanvasElement;
}

export function sanitizeToolName(value: string, fallback: string): string {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

export function sanitizeFilenameStem(value: string, fallback: string): string {
    const normalized = value
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/[.\s]+$/g, '')
        .trim();

    if (!normalized) return fallback;
    return normalized.length > 48 ? `${normalized.slice(0, 48).trim()}…` : normalized;
}

export function getElementBaseName(element: CanvasElement): string {
    if (element.displayName?.trim()) return sanitizeToolName(element.displayName, '图片');
    if (element.annotationTitle?.trim()) return sanitizeToolName(element.annotationTitle, '图片');
    if (element.frameName?.trim()) return sanitizeToolName(element.frameName, '图片');
    if (element.savedPrompt?.trim()) return sanitizeToolName(element.savedPrompt, '图片');
    if (isCanvasElementOfType(element, 'video')) return '视频';
    return '图片';
}

export function buildToolResultNames(source: CanvasElement, toolLabel: string, count = 1): { groupName: string; itemNames: string[] } {
    const baseName = getElementBaseName(source);
    const groupName = `${baseName} · ${toolLabel}`;
    const itemNames = Array.from({ length: count }, (_, index) => {
        if (count <= 1) {
            return groupName;
        }
        return `${groupName} ${String(index + 1).padStart(2, '0')}`;
    });

    return { groupName, itemNames };
}

export function resolveToolResultNaming(params: {
    element: CanvasElement;
    prefix?: string;
    groupLabel: string;
    fallbackLabel: string;
    count?: number;
    buildPrefixedItemNames: (trimmedPrefix: string) => string[];
}): { groupName: string; itemNames: string[] } {
    const trimmedPrefix = params.prefix?.trim();
    if (trimmedPrefix) {
        return {
            groupName: `${trimmedPrefix} · ${params.groupLabel}`,
            itemNames: params.buildPrefixedItemNames(trimmedPrefix),
        };
    }

    return buildToolResultNames(params.element, params.fallbackLabel, params.count);
}
