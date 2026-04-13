"use client";

import { useEffect, useRef } from 'react';
import { createGenerationTaskPatch } from '@/lib/generation-task-state';
import { readFileAsDataUrl, type ElementChangeHandler } from './generator-panel-shared';

export function createGeneratorTaskUpdate(taskId: string, taskType: 'image' | 'video') {
    return createGenerationTaskPatch(taskId, taskType);
}

type PersistGeneratorValueParams<TValue> = {
    elementId: string;
    key: string;
    value: TValue;
    onElementChange?: ElementChangeHandler;
    skipInitial?: boolean;
    serialize?: (value: TValue) => unknown | Promise<unknown>;
    debounceMs?: number;
};

export function usePersistGeneratorValue<TValue>({
    elementId,
    key,
    value,
    onElementChange,
    skipInitial = false,
    serialize,
    debounceMs = 0,
}: PersistGeneratorValueParams<TValue>) {
    const hasMountedRef = useRef(false);
    const lastSerializedValueRef = useRef<unknown>(undefined);
    const hasSerializedValueRef = useRef(false);
    const serializeRef = useRef<typeof serialize>(serialize);
    const onElementChangeRef = useRef(onElementChange);

    useEffect(() => {
        serializeRef.current = serialize;
        onElementChangeRef.current = onElementChange;
    }, [serialize, onElementChange]);

    useEffect(() => {
        hasMountedRef.current = false;
        hasSerializedValueRef.current = false;
        lastSerializedValueRef.current = undefined;
    }, [elementId, key]);

    useEffect(() => {
        if (skipInitial && !hasMountedRef.current) {
            hasMountedRef.current = true;
            return;
        }

        let cancelled = false;
        let timeoutId: number | null = null;

        const persistValue = () => {
            Promise.resolve(serializeRef.current ? serializeRef.current(value) : value).then((serializedValue) => {
                if (cancelled) return;

                if (hasSerializedValueRef.current && Object.is(lastSerializedValueRef.current, serializedValue)) {
                    return;
                }

                lastSerializedValueRef.current = serializedValue;
                hasSerializedValueRef.current = true;
                onElementChangeRef.current?.(elementId, { [key]: serializedValue });
            });
        };

        if (debounceMs > 0) {
            timeoutId = window.setTimeout(persistValue, debounceMs);
        } else {
            persistValue();
        }

        hasMountedRef.current = true;

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [debounceMs, elementId, key, skipInitial, value]);
}

export function useClearGeneratorError(
    elementId: string,
    errorFromElement: string | null | undefined,
    onElementChange?: ElementChangeHandler,
) {
    useEffect(() => {
        if (!errorFromElement) return;
        onElementChange?.(elementId, { generatingError: undefined });
    }, [elementId, errorFromElement, onElementChange]);
}

export function serializeReferenceImage(referenceImage: File | string | null) {
    if (referenceImage === null) return undefined;
    if (typeof referenceImage === 'string') return referenceImage;
    return readFileAsDataUrl(referenceImage);
}

export async function serializeReferenceImages(images: (File | string)[]): Promise<string | undefined> {
    if (images.length === 0) return undefined;
    const results: string[] = [];
    for (const img of images) {
        if (typeof img === 'string') {
            results.push(img);
        } else {
            results.push(await readFileAsDataUrl(img));
        }
    }
    return JSON.stringify(results);
}
