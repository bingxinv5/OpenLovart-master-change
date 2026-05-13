/**
 * Boundary tests for the generation-defaults settings adapter.
 *
 * Verifies:
 * - Types are re-exported correctly from workbench-settings
 * - Request resolvers fill missing fields from stored defaults
 * - Request resolvers preserve explicitly provided fields
 */

import { describe, it, expect } from 'vitest';
import {
    getImageGenerationDefaults,
    getVideoGenerationDefaults,
    resolveImageRequest,
    resolveVideoRequest,
    type ImageGenerationDefaults,
    type VideoGenerationDefaults,
} from './generation-defaults';

describe('generation-defaults adapter', () => {
    // ── Type re-exports ────────────────────────────────────

    it('re-exports ImageGenerationDefaults with expected shape', () => {
        const defaults: ImageGenerationDefaults = getImageGenerationDefaults();
        expect(defaults).toHaveProperty('model');
        expect(defaults).toHaveProperty('aspectRatio');
        expect(defaults).toHaveProperty('imageSize');
        expect(defaults).toHaveProperty('quality');
        expect(defaults).toHaveProperty('generateCount');
    });

    it('re-exports VideoGenerationDefaults with expected shape', () => {
        const defaults: VideoGenerationDefaults = getVideoGenerationDefaults();
        expect(defaults).toHaveProperty('model');
        expect(defaults).toHaveProperty('aspectRatio');
        expect(defaults).toHaveProperty('duration');
        expect(defaults).toHaveProperty('enhancePrompt');
    });

    // ── Image request resolver ──────────────────────────────

    it('resolveImageRequest fills missing fields from defaults', () => {
        const defaults = getImageGenerationDefaults();
        const resolved = resolveImageRequest({ prompt: 'cat' });
        expect(resolved.prompt).toBe('cat');
        expect(resolved.model).toBe(defaults.model);
        expect(resolved.aspectRatio).toBe(defaults.aspectRatio);
        expect(resolved.imageSize).toBe(defaults.imageSize);
        expect(resolved.quality).toBe(defaults.quality);
    });

    it('resolveImageRequest preserves explicitly provided fields', () => {
        const resolved = resolveImageRequest({
            prompt: 'dog',
            model: 'nano-banana-2',
            aspectRatio: '1:1',
            imageSize: '2K',
            quality: 'high',
        });
        expect(resolved.model).toBe('nano-banana-2');
        expect(resolved.aspectRatio).toBe('1:1');
        expect(resolved.imageSize).toBe('2K');
        expect(resolved.quality).toBe('high');
    });

    it('resolveImageRequest preserves the explicit gpt-image-2 alias', () => {
        const resolved = resolveImageRequest({
            prompt: 'portrait',
            model: 'gpt-image-2',
        });

        expect(resolved.model).toBe('gpt-image-2');
    });

    it('can resolve MagicAPI image defaults explicitly by provider', () => {
        const defaults = getImageGenerationDefaults('magicapi');

        expect(defaults.model).toBe('gemini-3-pro-image-preview');
        expect(defaults.imageSize).toBe('2K');
        expect(defaults.aspectRatio).toBe('21:9');
        expect(defaults.generateCount).toBe(1);
    });

    // ── Video request resolver ──────────────────────────────

    it('resolveVideoRequest fills missing fields from defaults', () => {
        const defaults = getVideoGenerationDefaults();
        const resolved = resolveVideoRequest({ prompt: 'sunrise' });
        expect(resolved.prompt).toBe('sunrise');
        expect(resolved.model).toBe(defaults.model);
        expect(resolved.aspectRatio).toBe(defaults.aspectRatio);
        expect(resolved.duration).toBe(defaults.duration);
        // enhancePrompt is always set by the resolver even though the return type doesn't declare it
        expect((resolved as Record<string, unknown>).enhancePrompt).toBe(defaults.enhancePrompt);
    });

    it('resolveVideoRequest preserves explicitly provided fields', () => {
        const resolved = resolveVideoRequest({
            prompt: 'sunset',
            model: 'veo3.1-components',
            aspectRatio: '9:16',
            duration: '5s',
            enhancePrompt: false,
        });
        expect(resolved.model).toBe('veo3.1-components');
        expect(resolved.aspectRatio).toBe('9:16');
        expect(resolved.duration).toBe('5s');
        expect(resolved.enhancePrompt).toBe(false);
    });

    it('resolveVideoRequest preserves the explicit veo3.1-fast alias', () => {
        const resolved = resolveVideoRequest({
            prompt: 'city lights',
            model: 'veo3.1-fast',
        });
        expect(resolved.model).toBe('veo3.1-fast');
    });

    it('resolveVideoRequest preserves the explicit doubao-seedance model and sdols duration', () => {
        const resolved = resolveVideoRequest({
            prompt: 'tea commercial',
            model: 'doubao-seedance-2-0-260128',
            duration: '15s',
            aspectRatio: '4:3',
        });
        expect(resolved.model).toBe('doubao-seedance-2-0-260128');
        expect(resolved.duration).toBe('15s');
        expect(resolved.aspectRatio).toBe('4:3');
    });

    it('resolveVideoRequest handles enhancePrompt=false correctly (not overridden by default)', () => {
        const resolved = resolveVideoRequest({
            prompt: 'test',
            enhancePrompt: false,
        });
        expect((resolved as Record<string, unknown>).enhancePrompt).toBe(false);
    });

    it('can resolve MagicAPI video defaults explicitly by provider', () => {
        const defaults = getVideoGenerationDefaults('magicapi');

        expect(defaults.model).toBe('sora-2');
        expect(defaults.aspectRatio).toBe('16:9');
        expect(defaults.duration).toBe('10s');
        expect(defaults.enhancePrompt).toBe(false);
    });
});
