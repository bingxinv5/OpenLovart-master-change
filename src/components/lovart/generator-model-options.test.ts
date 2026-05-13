import { describe, expect, it } from 'vitest';
import {
    getMaxAudiosForVideoModel,
    getMaxImagesForVideoModel,
    getMaxVideosForVideoModel,
    getVideoAddImageTitle,
    getVideoAspectRatioOptions,
    getVideoDurationOptions,
    getVideoModelOptionsForProvider,
    getVideoResolutionOptions,
    getImageModelOptionsForProvider,
    resolveImageGeneratorModelOptions,
} from './generator-model-options';

describe('generator model options', () => {
    it('derives OpenAI image options with size, quality, aspect ratio and count summary', () => {
        const options = resolveImageGeneratorModelOptions({
            model: 'gpt-image-2',
            imageSize: '1536x1024',
            aspectRatio: '16:9',
            quality: 'high',
            generateCount: 2,
            referenceImageCount: 0,
        });

        expect(options.isOpenAiGptImageModel).toBe(true);
        expect(options.availableImageQualities).toEqual(['auto', 'low', 'medium', 'high']);
        expect(options.displayedAspectRatio).toBe('3:2');
        expect(options.settingsSummary).toBe('1536x1024 · 高 · 3:2 · ×2');
    });

    it('uses reference-image aspect ratio wording for Grok image references', () => {
        const options = resolveImageGeneratorModelOptions({
            model: 'grok-4.2-image',
            imageSize: '2K',
            aspectRatio: '16:9',
            quality: 'auto',
            generateCount: 1,
            referenceImageCount: 1,
        });

        expect(options.grokUsesReferenceAspectRatio).toBe(true);
        expect(options.availableImageSizes).toEqual(['1K', '2K']);
        expect(options.settingsSummary).toBe('参考图比例 · 2K · ×1');
    });

    it('exposes MagicAPI-specific image model options by provider', () => {
        expect(getImageModelOptionsForProvider('magicapi')).toEqual([
            'gemini-3-pro-image-preview',
            'gemini-3.1-flash-image-preview',
            'doubao-seedream-5-0-260128',
            'grok-4-2-image',
            'gpt-image-2',
            'gpt-image-2-pro',
        ]);
    });

    it('derives MagicAPI Gemini options from the GeekNow adapter profile', () => {
        const proOptions = resolveImageGeneratorModelOptions({
            providerId: 'magicapi',
            model: 'gemini-3-pro-image-preview',
            imageSize: '2K',
            aspectRatio: '16:9',
            quality: 'auto',
            generateCount: 1,
            referenceImageCount: 0,
        });
        expect(proOptions.availableAspectRatios).toEqual(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']);
        expect(proOptions.availableImageSizes).toEqual(['1K', '2K', '4K']);

        const flashOptions = resolveImageGeneratorModelOptions({
            providerId: 'magicapi',
            model: 'gemini-3.1-flash-image-preview',
            imageSize: '4K',
            aspectRatio: '16:9',
            quality: 'auto',
            generateCount: 1,
            referenceImageCount: 0,
        });
        expect(flashOptions.availableImageSizes).toEqual(['1K', '2K', '4K']);
    });

    it('derives MagicAPI GPT image options by model capability', () => {
        const standardOptions = resolveImageGeneratorModelOptions({
            providerId: 'magicapi',
            model: 'gpt-image-2',
            imageSize: '2560x1712',
            aspectRatio: '3:2',
            quality: 'high',
            generateCount: 1,
            referenceImageCount: 0,
        });
        expect(standardOptions.displayedAspectRatio).toBe('3:2');
        expect(standardOptions.settingsSummary).toBe('2560x1712 · 高 · 3:2 · ×1');
        expect(standardOptions.availableAspectRatios).toEqual(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21']);
        expect(standardOptions.availableImageSizes).toEqual([
            '1024x1024',
            '1536x1152',
            '1536x1024',
            '1024x1536',
            '1920x1080',
            '1080x1920',
            '2048x2048',
            '2048x1536',
            '2560x1712',
            '1712x2560',
            '2048x1152',
            '1152x2048',
            '2240x960',
            '960x2240',
            '2880x2880',
            '3840x2880',
            '3840x2560',
            '2560x3840',
            '3840x2160',
            '2160x3840',
        ]);

        const gptOptions = resolveImageGeneratorModelOptions({
            providerId: 'magicapi',
            model: 'gpt-image-2-pro',
            imageSize: '3840x2160',
            aspectRatio: '16:9',
            quality: 'low',
            generateCount: 1,
            referenceImageCount: 0,
        });
        expect(gptOptions.availableImageSizes).toEqual([
            '2048x2048',
            '2048x1536',
            '2560x1712',
            '1712x2560',
            '2048x1152',
            '1152x2048',
            '2240x960',
            '960x2240',
            '2880x2880',
            '3840x2880',
            '3840x2560',
            '2560x3840',
            '3840x2160',
            '2160x3840',
        ]);
        expect(gptOptions.availableImageQualities).toEqual(['high']);
    });

    it('derives MagicAPI OpenAI-style non-GPT image options from plugin size maps', () => {
        const doubaoOptions = resolveImageGeneratorModelOptions({
            providerId: 'magicapi',
            model: 'doubao-seedream-5-0-260128',
            imageSize: '2K',
            aspectRatio: '21:9',
            quality: 'auto',
            generateCount: 1,
            referenceImageCount: 0,
        });
        expect(doubaoOptions.availableImageSizes).toEqual(['3024x1296']);
    });

    it('derives video media limits by model', () => {
        expect(getMaxImagesForVideoModel('veo3.1-components')).toBe(3);
        expect(getMaxImagesForVideoModel('doubao-seedance-2-0-260128')).toBe(9);
        expect(getMaxVideosForVideoModel('doubao-seedance-2-0-260128')).toBe(3);
        expect(getMaxAudiosForVideoModel('doubao-seedance-2-0-260128')).toBe(3);
        expect(getMaxVideosForVideoModel('veo3.1')).toBe(0);
    });

    it('derives domestic video model option lists and copy', () => {
        expect(getVideoAspectRatioOptions('doubao-seedance-2-0-260128')).toEqual(['16:9', '9:16', '1:1', '4:3', '3:4']);
        expect(getVideoDurationOptions('doubao-seedance-2-0-260128')).toEqual(['4s', '5s', '6s', '7s', '8s', '9s', '10s', '11s', '12s', '13s', '14s', '15s']);
        expect(getVideoResolutionOptions('doubao-seedance-2-0-260128')).toEqual(['480p', '720p']);
        expect(getVideoAddImageTitle('doubao-seedance-2-0-260128', 'first-last-frame')).toBe('添加首尾帧图片');
        expect(getVideoAddImageTitle('doubao-seedance-2-0-260128', 'omni-reference')).toBe('添加全能参考素材');
    });

    it('exposes MagicAPI-specific video model options by provider', () => {
        expect(getVideoModelOptionsForProvider('magicapi')).toEqual([
            'sora-2',
            'grok-video-3-pro',
            'doubao-seed-2-0-pro-260215',
            'veo_3_1',
            'veo_3_1-fast',
            'veo_3_1-components',
        ]);
        expect(getVideoDurationOptions('sora-2')).toEqual(['5s', '10s', '15s']);
        expect(getVideoDurationOptions('grok-video-3-pro')).toEqual(['10s']);
        expect(getVideoResolutionOptions('grok-video-3-pro')).toEqual(['720p', '1080p']);
        expect(getVideoDurationOptions('doubao-seed-2-0-pro-260215')).toEqual(['4s', '5s', '6s', '7s', '8s', '9s', '10s', '11s', '12s', '13s', '14s', '15s']);
        expect(getVideoAspectRatioOptions('doubao-seed-2-0-pro-260215')).toEqual(['16:9', '9:16', '1:1', '4:3', '3:4']);
        expect(getVideoResolutionOptions('doubao-seed-2-0-pro-260215')).toEqual(['480p', '720p']);
        expect(getVideoDurationOptions('veo_3_1')).toEqual(['5s', '8s']);
        expect(getVideoDurationOptions('veo_3_1-fast')).toEqual(['5s', '8s']);
        expect(getVideoDurationOptions('veo_3_1-components')).toEqual(['5s', '8s']);
    });
});
