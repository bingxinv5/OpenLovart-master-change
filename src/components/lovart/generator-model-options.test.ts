import { describe, expect, it } from 'vitest';
import {
    getMaxAudiosForVideoModel,
    getMaxImagesForVideoModel,
    getMaxVideosForVideoModel,
    getVideoAddImageTitle,
    getVideoAspectRatioOptions,
    getVideoDurationOptions,
    getVideoResolutionOptions,
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
});