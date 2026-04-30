import { describe, expect, it } from 'vitest';
import { getElementPanelStyle } from './canvas-panel-style-utils';

describe('canvas-panel-style-utils', () => {
    it('returns undefined without an element', () => {
        expect(getElementPanelStyle(null, 1, { x: 0, y: 0 })).toBeUndefined();
    });

    it('positions a panel below the element with default fallback height and gap', () => {
        expect(getElementPanelStyle({ x: 100, y: 50 }, 2, { x: 10, y: -20 })).toEqual({
            left: '210px',
            top: '700px',
        });
    });

    it('uses the element height and custom gap when provided', () => {
        expect(getElementPanelStyle({ x: 12, y: 20, height: 80 }, 1.5, { x: -2, y: 3 }, { gap: 12 })).toEqual({
            left: '16px',
            top: '165px',
        });
    });
});