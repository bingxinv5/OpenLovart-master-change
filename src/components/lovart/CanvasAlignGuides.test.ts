import { describe, expect, it } from 'vitest';
import type { AlignGuide } from './canvas-alignment';
import { areAlignGuidesEqual } from './CanvasAlignGuides';

const baseGuides: AlignGuide[] = [
    { type: 'v', pos: 10, start: 20, end: 80 },
    { type: 'h', pos: 30, start: 40, end: 120 },
];

describe('areAlignGuidesEqual', () => {
    it('treats structurally identical guides as equal', () => {
        expect(areAlignGuidesEqual(baseGuides, [
            { type: 'v', pos: 10, start: 20, end: 80 },
            { type: 'h', pos: 30, start: 40, end: 120 },
        ])).toBe(true);
    });

    it('detects changed guide geometry', () => {
        expect(areAlignGuidesEqual(baseGuides, [
            { type: 'v', pos: 10, start: 20, end: 80 },
            { type: 'h', pos: 30, start: 40, end: 121 },
        ])).toBe(false);
    });
});