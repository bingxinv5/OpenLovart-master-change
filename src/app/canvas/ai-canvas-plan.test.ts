import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { buildAiCanvasSelectionSummary, parseAiCanvasPlanActions } from './ai-canvas-plan';

function makeElement(id: string, overrides: Partial<CanvasElement>): CanvasElement {
    return {
        id,
        type: 'text',
        x: 0,
        y: 0,
        ...overrides,
    };
}

describe('ai-canvas-plan', () => {
    it('parses only supported canvas actions', () => {
        expect(parseAiCanvasPlanActions({
            canvasActions: [
                { type: 'create-image-generator', prompt: '  make poster ', title: ' Hero ', useSelectionAsReferences: true },
                { type: 'create-video-generator', prompt: '', title: 'Clip', useSelectionAsReferences: 'yes' },
                { type: 'create-text-note', text: '  note  ' },
                { type: 'create-text-note', text: '   ' },
                { type: 'frame-selection' },
                { type: 'save-selection-as-reference' },
                { type: 'unknown-action' },
                null,
            ],
        })).toEqual([
            { type: 'create-image-generator', prompt: 'make poster', title: 'Hero', useSelectionAsReferences: true },
            { type: 'create-video-generator', prompt: undefined, title: 'Clip', useSelectionAsReferences: undefined },
            { type: 'create-text-note', text: 'note' },
            { type: 'frame-selection' },
            { type: 'save-selection-as-reference' },
        ]);
    });

    it('returns an empty action list for invalid plans', () => {
        expect(parseAiCanvasPlanActions(null)).toEqual([]);
        expect(parseAiCanvasPlanActions({ canvasActions: 'bad' })).toEqual([]);
        expect(parseAiCanvasPlanActions([])).toEqual([]);
    });

    it('summarizes empty and selected canvas elements', () => {
        const elements = [
            makeElement('image-1111', { type: 'image', content: 'imgref:1', displayName: '封面图' }),
            makeElement('text-2222', { type: 'text', savedPrompt: '标题文案' }),
            makeElement('connector-3333', { type: 'connector' }),
        ];

        expect(buildAiCanvasSelectionSummary(elements, [])).toBe('当前没有选中任何元素。');
        expect(buildAiCanvasSelectionSummary(elements, ['image-1111', 'text-2222'])).toBe(
            '当前选中 2 个元素：图片 1 个，文本 1 个。 示例名称：封面图、标题文案。 可创建编组：是。 可加入项目参考库：是。',
        );
        expect(buildAiCanvasSelectionSummary(elements, ['connector-3333'])).toContain('可创建编组：否');
    });
});