import { describe, expect, it } from 'vitest';
import { chooseLodEncodeType, resolveLodQuality } from './image-worker-lod-operation';

describe('image-worker-lod-operation', () => {
    it('keeps requested quality for photo-like sources', () => {
        expect(resolveLodQuality('image/jpeg', 64, { 64: 0.45 })).toBe(0.45);
        expect(resolveLodQuality('image/webp', 256)).toBe(0.7);
    });

    it('raises tiny and small text-dense thumbnails to readable minimums', () => {
        expect(resolveLodQuality('image/png', 64, { 64: 0.4 })).toBe(0.72);
        expect(resolveLodQuality('image/svg+xml', 256, { 256: 0.5 })).toBe(0.84);
        expect(resolveLodQuality('image/png', 1024, { 1024: 0.65 })).toBe(0.65);
    });

    it('uses webp for png lod output and jpeg for other sources', () => {
        expect(chooseLodEncodeType('image/png')).toBe('image/webp');
        expect(chooseLodEncodeType('image/jpeg')).toBe('image/jpeg');
        expect(chooseLodEncodeType('image/svg+xml')).toBe('image/jpeg');
    });
});
