import { describe, expect, it } from 'vitest';

import { buildGeneratorAspectRatioPatch, resolveGeneratorAspectRatioBounds } from './generator-aspect-ratio-layout';

describe('generator aspect ratio layout', () => {
    it('grows width for a wider ratio around the current center', () => {
        expect(resolveGeneratorAspectRatioBounds('16:9', {
            x: 100,
            y: 200,
            width: 400,
            height: 400,
        }, { fallbackWidth: 400, fallbackHeight: 400 })).toEqual({
            x: -55,
            y: 200,
            width: 711,
            height: 400,
        });
    });

    it('grows height for a taller ratio around a stable base size', () => {
        expect(resolveGeneratorAspectRatioBounds('9:16', {
            x: 100,
            y: 288,
            width: 400,
            height: 225,
        }, { fallbackWidth: 400, fallbackHeight: 400 })).toEqual({
            x: 100,
            y: 45,
            width: 400,
            height: 711,
        });
    });

    it('does not compound growth when switching between wide and tall ratios', () => {
        expect(resolveGeneratorAspectRatioBounds('21:9', {
            x: 10,
            y: -185,
            width: 400,
            height: 711,
        }, { fallbackWidth: 400, fallbackHeight: 400 })).toEqual({
            x: -256,
            y: -29,
            width: 933,
            height: 400,
        });
    });

    it('builds a patch only for changed bounds or selected ratio', () => {
        expect(buildGeneratorAspectRatioPatch('16:9', {
            x: 100,
            y: 200,
            width: 711,
            height: 400,
            selectedAspectRatio: '16:9',
        }, { fallbackWidth: 400, fallbackHeight: 400 })).toBeNull();

        expect(buildGeneratorAspectRatioPatch('1:1', {
            x: 100,
            y: 288,
            width: 400,
            height: 225,
            selectedAspectRatio: '16:9',
        }, { fallbackWidth: 400, fallbackHeight: 400 })).toEqual({
            selectedAspectRatio: '1:1',
            y: 201,
            height: 400,
        });
    });
});