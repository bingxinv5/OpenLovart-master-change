import { describe, expect, it, vi } from 'vitest';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import { beginImageToolSubmission, endImageToolSubmission, ensureImageToolSource } from './image-tool-submission';

function makeElement(overrides: Partial<CanvasElement>): CanvasElement {
    return {
        id: 'element-id',
        type: 'text',
        x: 0,
        y: 0,
        ...overrides,
    };
}

describe('image-tool-submission', () => {
    it('starts image tool submission with loading state and toast', () => {
        const setSubmitting = vi.fn();
        const setStatus = vi.fn();
        const showToast = vi.fn();

        beginImageToolSubmission({
            setSubmitting,
            setStatus,
            loadingToast: 'loading',
            showToast,
        });

        expect(setSubmitting).toHaveBeenCalledWith(true);
        expect(setStatus).toHaveBeenCalledWith('正在读取原图...');
        expect(showToast).toHaveBeenCalledWith('loading', 'info');
    });

    it('ends image tool submission by clearing state', () => {
        const setSubmitting = vi.fn();
        const setStatus = vi.fn();

        endImageToolSubmission(setSubmitting, setStatus);

        expect(setSubmitting).toHaveBeenCalledWith(false);
        expect(setStatus).toHaveBeenCalledWith('');
    });

    it('validates image tool source elements', () => {
        const showToast = vi.fn();

        expect(ensureImageToolSource(makeElement({ type: 'image', content: 'imgref:1' }), 'bad', showToast)).toBe(true);
        expect(showToast).not.toHaveBeenCalled();

        expect(ensureImageToolSource(makeElement({ type: 'image' }), 'missing', showToast)).toBe(false);
        expect(showToast).toHaveBeenCalledWith('missing', 'error');
    });
});