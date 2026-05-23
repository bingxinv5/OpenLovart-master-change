import { afterEach, describe, expect, it } from 'vitest';
import { dispatchCanvasImageSelected } from './canvas-selection';

const originalWindow = globalThis.window;

function installEventTargetWindow() {
    const target = new EventTarget();
    const fakeWindow = {
        dispatchEvent: target.dispatchEvent.bind(target),
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
    };

    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: fakeWindow,
    });

    return fakeWindow;
}

describe('canvas image selection events', () => {
    afterEach(() => {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: originalWindow,
        });
    });

    it('includes the picked source element id in generator selection events', () => {
        const fakeWindow = installEventTargetWindow();
        const events: CustomEvent[] = [];

        fakeWindow.addEventListener('canvas-image-selected', (event) => {
            events.push(event as CustomEvent);
        });

        dispatchCanvasImageSelected('generator-1', 'data:image/png;base64,abc', 'reference', 'image-1', 'image');

        expect(events).toHaveLength(1);
        expect(events[0].detail).toEqual({
            generatorId: 'generator-1',
            imageContent: 'data:image/png;base64,abc',
            imageType: 'reference',
            sourceElementId: 'image-1',
            sourceElementType: 'image',
        });
    });
});