import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectRetainedLocalImageRefs } from './local-image-ref-usage';

function createLocalStorageMock() {
    const store = new Map<string, string>();

    return {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string) {
            return store.has(key) ? store.get(key)! : null;
        },
        key(index: number) {
            return Array.from(store.keys())[index] ?? null;
        },
        removeItem(key: string) {
            store.delete(key);
        },
        setItem(key: string, value: string) {
            store.set(key, value);
        },
    };
}

describe('collectRetainedLocalImageRefs', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'window', {
            value: {
                localStorage: createLocalStorageMock(),
            },
            configurable: true,
            writable: true,
        });
    });

    afterEach(() => {
        window.localStorage.clear();
        Reflect.deleteProperty(globalThis, 'window');
    });

    it('collects imgrefs from local media and reference stores', () => {
        window.localStorage.setItem('lovart_project_media_history:project-a', JSON.stringify([
            { kind: 'image', content: 'imgref://media-1' },
            { kind: 'image', content: 'https://example.com/remote.png' },
            { kind: 'video', content: 'imgref://video-ignored' },
        ]));
        window.localStorage.setItem('lovart_project_reference_library:project-a', JSON.stringify([
            { image: 'imgref://ref-1' },
            { image: 'data:image/png;base64,AAAA' },
        ]));
        window.localStorage.setItem('lovart_image_generation_history', JSON.stringify([
            { referenceImages: ['imgref://history-1', 'https://example.com/history.png'] },
        ]));
        window.localStorage.setItem('lovart_favorite_reference_images', JSON.stringify([
            { image: 'imgref://favorite-1' },
            { image: 'blob:http://localhost/favorite-blob' },
        ]));

        expect(new Set(collectRetainedLocalImageRefs())).toEqual(new Set([
            'imgref://media-1',
            'imgref://ref-1',
            'imgref://history-1',
            'imgref://favorite-1',
        ]));
    });
});