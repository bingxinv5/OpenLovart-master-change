/**
 * Generation Settings Adapter
 *
 * Single source of truth for resolving generation request options.
 * Reads persisted workbench settings and fills in missing fields
 * so that downstream transport (ai-client) never needs to know
 * about settings or defaults.
 *
 * Boundary:
 *   workbench-settings.ts → persistence & normalization
 *   this module           → defaults resolution for generation requests
 *   ai-client.ts          → transport & response parsing only
 *
 * Panel hooks:
 *   useImageGenerationDefaults()  — reactive hook for image panels
 *   useVideoGenerationDefaults()  — reactive hook for video panels
 */

import { useState, useEffect } from 'react';
import {
    getWorkbenchSettings,
    subscribeWorkbenchSettingsChange,
    type ImageGenerationDefaults,
    type VideoGenerationDefaults,
} from './workbench-settings';
import type { ImageGenerationRequest, VideoGenerationRequest } from './ai-client';

// ── Re-export canonical types from workbench-settings ───────

export type { ImageGenerationDefaults, VideoGenerationDefaults };

export function getImageGenerationDefaults(): ImageGenerationDefaults {
    return getWorkbenchSettings().imageDefaults;
}

export function getVideoGenerationDefaults(): VideoGenerationDefaults {
    return getWorkbenchSettings().videoDefaults;
}

// ── Request Resolvers ───────────────────────────────────────

/**
 * Resolve an image generation request: fill any omitted fields
 * with the user's persisted workbench defaults.
 * After this call, model/aspectRatio/imageSize are guaranteed present.
 */
export function resolveImageRequest<T extends ImageGenerationRequest>(
    request: T,
): T & Required<Pick<T, 'model' | 'aspectRatio' | 'imageSize'>> {
    const defaults = getImageGenerationDefaults();
    return {
        ...request,
        model: request.model || defaults.model,
        aspectRatio: request.aspectRatio || defaults.aspectRatio,
        imageSize: request.imageSize || defaults.imageSize,
    } as T & Required<Pick<T, 'model' | 'aspectRatio' | 'imageSize'>>;
}

/**
 * Resolve a video generation request: fill any omitted fields
 * with the user's persisted workbench defaults.
 */
export function resolveVideoRequest<T extends VideoGenerationRequest>(
    request: T,
): T & Required<Pick<T, 'model' | 'aspectRatio' | 'duration'>> {
    const defaults = getVideoGenerationDefaults();
    return {
        ...request,
        model: request.model || defaults.model,
        aspectRatio: request.aspectRatio || defaults.aspectRatio,
        duration: request.duration || defaults.duration,
        enhancePrompt: request.enhancePrompt ?? defaults.enhancePrompt,
    } as T & Required<Pick<T, 'model' | 'aspectRatio' | 'duration'>>;
}

// ── Reactive hooks for panels ───────────────────────────────

/**
 * React hook that provides reactive image generation defaults.
 * Replaces the pattern of calling getWorkbenchSettings().imageDefaults
 * + subscribeWorkbenchSettingsChange() in each panel.
 */
export function useImageGenerationDefaults(): ImageGenerationDefaults {
    const [defaults, setDefaults] = useState<ImageGenerationDefaults>(
        () => getWorkbenchSettings().imageDefaults,
    );

    useEffect(() => {
        return subscribeWorkbenchSettingsChange(() => {
            setDefaults(getWorkbenchSettings().imageDefaults);
        });
    }, []);

    return defaults;
}

/**
 * React hook that provides reactive video generation defaults.
 */
export function useVideoGenerationDefaults(): VideoGenerationDefaults {
    const [defaults, setDefaults] = useState<VideoGenerationDefaults>(
        () => getWorkbenchSettings().videoDefaults,
    );

    useEffect(() => {
        return subscribeWorkbenchSettingsChange(() => {
            setDefaults(getWorkbenchSettings().videoDefaults);
        });
    }, []);

    return defaults;
}
