import type React from 'react';
import type { CanvasElement } from '@/components/lovart/canvas-types';
import type { CanvasToastType } from './canvas-feedback';

type ToastFn = (message: string, type?: CanvasToastType) => void;

export function beginImageToolSubmission(params: {
    setSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
    setStatus: React.Dispatch<React.SetStateAction<string>>;
    loadingToast: string;
    showToast: ToastFn;
}) {
    params.setSubmitting(true);
    params.setStatus('正在读取原图...');
    params.showToast(params.loadingToast, 'info');
}

export function endImageToolSubmission(
    setSubmitting: React.Dispatch<React.SetStateAction<boolean>>,
    setStatus: React.Dispatch<React.SetStateAction<string>>,
) {
    setSubmitting(false);
    setStatus('');
}

export function ensureImageToolSource(
    element: CanvasElement,
    errorMessage: string,
    showToast: ToastFn,
): element is CanvasElement & { type: 'image'; content: string } {
    if (element.type === 'image' && element.content) {
        return true;
    }

    showToast(errorMessage, 'error');
    return false;
}