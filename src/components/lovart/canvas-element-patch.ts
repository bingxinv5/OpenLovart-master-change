import type {
    CanvasElement,
    CanvasElementOfType,
    CanvasElementType,
    CanvasFrameElement,
    CanvasGenerationStateProps,
    CanvasGeneratorElement,
    CanvasImageElement,
    CanvasMediaElement,
} from './canvas-types';
import {
    isCanvasElementOfType,
    isCanvasGeneratorElement,
    isCanvasMediaElement,
} from './canvas-types';

export type CanvasElementPatchAttrs = Partial<Omit<CanvasElement, 'id' | 'type'>>;
export type TypedCanvasElementPatch<TElement extends CanvasElement> = Partial<Omit<TElement, 'id' | 'type'>>;

export function patchCanvasElement<TElement extends CanvasElement>(
    element: TElement,
    patch: CanvasElementPatchAttrs,
): TElement {
    return { ...element, ...patch };
}

export function patchElementOfType<TType extends CanvasElementType>(
    element: CanvasElement,
    type: TType,
    patch: TypedCanvasElementPatch<CanvasElementOfType<TType>>,
): CanvasElement {
    if (!isCanvasElementOfType(element, type)) {
        return element;
    }

    return { ...element, ...patch };
}

export function patchImageElement(
    element: CanvasElement,
    patch: TypedCanvasElementPatch<CanvasImageElement>,
): CanvasElement {
    return patchElementOfType(element, 'image', patch);
}

export function patchFrameElement(
    element: CanvasElement,
    patch: TypedCanvasElementPatch<CanvasFrameElement>,
): CanvasElement {
    return patchElementOfType(element, 'frame', patch);
}

export function patchGeneratorElement(
    element: CanvasElement,
    patch: TypedCanvasElementPatch<CanvasGeneratorElement>,
): CanvasElement {
    if (!isCanvasGeneratorElement(element)) {
        return element;
    }

    return { ...element, ...patch };
}

export function patchMediaElement(
    element: CanvasElement,
    patch: TypedCanvasElementPatch<CanvasMediaElement>,
): CanvasElement {
    if (!isCanvasMediaElement(element)) {
        return element;
    }

    return { ...element, ...patch };
}

export function patchGenerationTargetElement(
    element: CanvasElement,
    patch: Partial<CanvasGenerationStateProps>,
): CanvasElement {
    if (!isCanvasGeneratorElement(element) && !isCanvasMediaElement(element)) {
        return element;
    }

    return { ...element, ...patch };
}
