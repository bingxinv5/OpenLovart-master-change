import { describe, expect, it } from 'vitest';
import type { CanvasElement } from './canvas-types';
import {
    getInitialStoryboardDraft,
    getStoryboardSummaryParts,
    isElementLocked,
    validateStoryboardPrefix,
} from './layers-panel-utils';

function makeElement(attrs: Partial<CanvasElement> = {}): CanvasElement {
    return {
        id: 'element-1',
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        ...attrs,
    } as CanvasElement;
}

describe('layers-panel-utils', () => {
    it('validates storyboard prefixes', () => {
        expect(validateStoryboardPrefix('A')).toBeNull();
        expect(validateStoryboardPrefix('SHOT-')).toBeNull();
        expect(validateStoryboardPrefix('')).toBeNull();
        expect(validateStoryboardPrefix('A01')).toBe('前缀建议只使用字母或连字符，例如 A、SC、SHOT-。');
    });

    it('detects locked elements including locked frames', () => {
        expect(isElementLocked(makeElement())).toBe(false);
        expect(isElementLocked(makeElement({ locked: true }))).toBe(true);
        expect(isElementLocked(makeElement({ type: 'frame', frameLocked: true }))).toBe(true);
    });

    it('builds storyboard summary parts from non-empty metadata', () => {
        const element = makeElement({
            storyboardShotCode: ' A01 ',
            storyboardSceneType: '中景',
            storyboardCameraMove: ' ',
            storyboardDuration: '3s',
        });

        expect(getStoryboardSummaryParts(element)).toEqual(['A01', '中景', '3s']);
    });

    it('creates storyboard draft defaults from an element', () => {
        expect(getInitialStoryboardDraft(makeElement({ storyboardShotCode: 'A02' }))).toMatchObject({
            storyboardShotCode: 'A02',
            storyboardSceneType: '',
        });
    });
});