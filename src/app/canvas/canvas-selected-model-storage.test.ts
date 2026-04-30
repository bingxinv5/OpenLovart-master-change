import { afterEach, describe, expect, it } from 'vitest';
import {
    CANVAS_SELECTED_MODEL_STORAGE_KEY,
    DEFAULT_CANVAS_SELECTED_MODEL,
    loadCanvasSelectedModel,
    saveCanvasSelectedModel,
} from './canvas-selected-model-storage';

const originalWindow = globalThis.window;

function installLocalStorageMock(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    Object.defineProperty(globalThis, 'window', {
        value: {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    values.set(key, value);
                },
            },
        },
        configurable: true,
    });
    return values;
}

afterEach(() => {
    if (typeof originalWindow === 'undefined') {
        Reflect.deleteProperty(globalThis, 'window');
        return;
    }

    Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
    });
});

describe('canvas-selected-model-storage', () => {
    it('returns the default model outside the browser', () => {
        Reflect.deleteProperty(globalThis, 'window');
        expect(loadCanvasSelectedModel()).toBe(DEFAULT_CANVAS_SELECTED_MODEL);
    });

    it('loads and saves the selected model', () => {
        const values = installLocalStorageMock();

        saveCanvasSelectedModel('gemini-3.1-pro-preview');

        expect(values.get(CANVAS_SELECTED_MODEL_STORAGE_KEY)).toBe('gemini-3.1-pro-preview');
        expect(loadCanvasSelectedModel()).toBe('gemini-3.1-pro-preview');
    });

    it('falls back when storage is empty', () => {
        installLocalStorageMock();

        expect(loadCanvasSelectedModel()).toBe(DEFAULT_CANVAS_SELECTED_MODEL);
    });
});
