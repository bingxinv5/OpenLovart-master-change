import { describe, expect, it } from 'vitest';

import {
  buildOpenAiGptImagePrompt,
  describeOpenAiGptImageAspectRatio,
  DEFAULT_MAX_REFERENCE_IMAGES,
  getOpenAiGptImagePixelSizeValidationError,
  OPENAI_GPT_IMAGE_PIXEL_SIZES,
  OPENAI_GPT_IMAGE_SIZE_OPTIONS,
  OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS,
  buildUpstreamImageGenerationBody,
  getOpenAiGptImagePromptCompensation,
  getImageGenerationModelBranch,
  getMagicApiGeminiImageSizeOptions,
  getMagicApiGptImageSizeOptions,
  getMaxReferenceImagesForImageModel,
  isMagicApiGptImageOfficialSize,
  resolveMagicApiOpenAiStyleImageSize,
  normalizeOpenAiGptImagePixelSize,
  resolveMagicApiGeminiImageSize,
  resolveOpenAiGptImageAspectRatio,
  resolveOpenAiGptImagePixelSize,
  resolveOpenAiGptImageSize,
} from './image-generation-models';

describe('image-generation-models', () => {
  it('routes gpt-image-2 to the dedicated openai gpt image branch', () => {
    expect(getImageGenerationModelBranch('gpt-image-2')).toBe('openai-gpt-image');
  });

  it('routes MagicAPI-compatible image model aliases to the right branches', () => {
    expect(getImageGenerationModelBranch('gpt-image-2-pro')).toBe('openai-gpt-image');
    expect(getImageGenerationModelBranch('grok-4-2-image')).toBe('grok');
    expect(getImageGenerationModelBranch('doubao-seedream-4-5-251128')).toBe('domestic');
    expect(getMaxReferenceImagesForImageModel('gemini-3-pro-image-preview')).toBeGreaterThan(DEFAULT_MAX_REFERENCE_IMAGES);
  });

  it('keeps gpt-image-2 on the default reference image budget until capability is verified', () => {
    expect(getMaxReferenceImagesForImageModel('gpt-image-2')).toBe(DEFAULT_MAX_REFERENCE_IMAGES);
  });

  it('exposes MagicAPI model-specific image size options', () => {
    expect(getMagicApiGeminiImageSizeOptions('gemini-3-pro-image-preview')).toEqual(['1K', '2K', '4K']);
    expect(getMagicApiGeminiImageSizeOptions('gemini-3.1-flash-image-preview')).toEqual(['1K', '2K', '4K']);
    expect(resolveMagicApiGeminiImageSize('gemini-3.1-flash-image-preview', '4K')).toBe('4K');
    expect(resolveMagicApiGeminiImageSize('gemini-2.5-flash-image-preview', '4K')).toBe('1K');

    expect(getMagicApiGptImageSizeOptions('gpt-image-2')).toEqual([
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
    expect(getMagicApiGptImageSizeOptions('gpt-image-2-pro')).toEqual([
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
    expect(resolveMagicApiOpenAiStyleImageSize('gpt-image-2', '21:9')).toBe('2240x960');
    expect(resolveMagicApiOpenAiStyleImageSize('gpt-image-2', '9:21')).toBe('960x2240');
    expect(resolveMagicApiOpenAiStyleImageSize('gpt-image-2-pro', '21:9')).toBe('2240x960');
    expect(resolveMagicApiOpenAiStyleImageSize('gpt-image-2-pro', '9:21')).toBe('960x2240');
    expect(isMagicApiGptImageOfficialSize('gpt-image-2', '3840x2160')).toBe(false);
    expect(isMagicApiGptImageOfficialSize('gpt-image-2-pro', '3840x2160')).toBe(true);
    expect(isMagicApiGptImageOfficialSize('gpt-image-2-pro', '2240x960')).toBe(false);
    expect(isMagicApiGptImageOfficialSize('gpt-image-2-pro', '3840x2880')).toBe(false);
  });

  it('exposes official and curated gpt-image-2 preset sizes', () => {
    expect(OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS).toEqual(['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '4:5', '5:4', '21:9', '9:21']);
    expect(OPENAI_GPT_IMAGE_SIZE_OPTIONS[0]).toBe('auto');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('1024x1024');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('2048x1152');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('1152x2048');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('2240x960');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('3840x2160');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('2160x3840');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1254x1254');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1672x942');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('942x1672');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1915x821');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1080x2560');
  });

  it('supports the documented gpt-image-2 auto size without forcing a ratio', () => {
    expect(resolveOpenAiGptImageSize('auto', '16:9')).toBe('auto');
    expect(resolveOpenAiGptImageAspectRatio('auto', '16:9')).toBe('auto');
    expect(describeOpenAiGptImageAspectRatio('auto', '16:9')).toBe('自动');
    expect(buildOpenAiGptImagePrompt('loose composition', 'auto', '16:9')).toBe('loose composition');
  });

  it('passes through valid explicit gpt-image-2 pixel sizes and remaps invalid legacy ratios', () => {
    expect(resolveOpenAiGptImagePixelSize('2048x1152', '16:9')).toBe('2048x1152');
    expect(resolveOpenAiGptImagePixelSize(' 1536 x 864 ', '16:9')).toBe('1536x864');
    expect(resolveOpenAiGptImagePixelSize('1672x942', '16:9')).toBe('2048x1152');
    expect(resolveOpenAiGptImagePixelSize(undefined, '1:1')).toBe('1024x1024');
    expect(resolveOpenAiGptImagePixelSize(undefined, '4:3')).toBe('1536x1152');
    expect(resolveOpenAiGptImagePixelSize(undefined, '3:4')).toBe('1152x1536');
    expect(resolveOpenAiGptImagePixelSize(undefined, '3:2')).toBe('1536x1024');
    expect(resolveOpenAiGptImagePixelSize(undefined, '2:3')).toBe('1024x1536');
    expect(resolveOpenAiGptImagePixelSize(undefined, '16:9')).toBe('2048x1152');
    expect(resolveOpenAiGptImagePixelSize(undefined, '9:16')).toBe('1152x2048');
    expect(resolveOpenAiGptImagePixelSize(undefined, '21:9')).toBe('2240x960');
    expect(resolveOpenAiGptImagePixelSize(undefined, '9:21')).toBe('960x2240');
  });

  it('derives gpt-image-2 aspect ratios from explicit pixel sizes', () => {
    expect(resolveOpenAiGptImageAspectRatio('1024x1024')).toBe('1:1');
    expect(resolveOpenAiGptImageAspectRatio('2048x1152')).toBe('16:9');
    expect(resolveOpenAiGptImageAspectRatio('1152x2048')).toBe('9:16');
    expect(resolveOpenAiGptImageAspectRatio('2560x1712')).toBe('3:2');
    expect(resolveOpenAiGptImageAspectRatio('1712x2560')).toBe('2:3');
    expect(resolveOpenAiGptImageAspectRatio('2240x960')).toBe('21:9');
    expect(resolveOpenAiGptImageAspectRatio('960x2240')).toBe('9:21');
    expect(resolveOpenAiGptImageAspectRatio('1080x2560', '9:21')).toBe('9:21');
  });

  it('describes exact aspect ratios for valid and invalid experimental pixel sizes', () => {
    expect(normalizeOpenAiGptImagePixelSize(' 1536 X 864 ')).toBe('1536x864');
    expect(normalizeOpenAiGptImagePixelSize('1672x942')).toBeUndefined();
    expect(getOpenAiGptImagePixelSizeValidationError('1672x942')).toBe('宽高都必须是 16 的倍数');
    expect(describeOpenAiGptImageAspectRatio('1024x1024')).toBe('1:1');
    expect(describeOpenAiGptImageAspectRatio('2048x1152')).toBe('16:9');
    expect(describeOpenAiGptImageAspectRatio('1152x2048')).toBe('9:16');
    expect(describeOpenAiGptImageAspectRatio('2560x1712')).toBe('3:2');
    expect(describeOpenAiGptImageAspectRatio('1712x2560')).toBe('2:3');
    expect(describeOpenAiGptImageAspectRatio('2240x960')).toBe('21:9');
    expect(describeOpenAiGptImageAspectRatio('960x2240')).toBe('9:21');
    expect(describeOpenAiGptImageAspectRatio('1536x864')).toBe('16:9');
    expect(describeOpenAiGptImageAspectRatio('1344x576')).toBe('21:9');
    expect(describeOpenAiGptImageAspectRatio('1080x2560')).toBe('27:64');
  });

  it('builds a ratio-priority prompt compensation for gpt-image-2', () => {
    expect(getOpenAiGptImagePromptCompensation('2240x960', '21:9')).toContain('21:9');
    expect(getOpenAiGptImagePromptCompensation('2240x960', '21:9')).toContain('2240x960');

    const prompt = buildOpenAiGptImagePrompt('city skyline at dusk', '2240x960', '21:9');
    expect(prompt).toContain('city skyline at dusk');
    expect(prompt).toContain('Composition requirements: prioritize a 21:9 frame on a 2240x960 canvas.');
    expect(buildOpenAiGptImagePrompt(prompt, '2240x960', '21:9')).toBe(prompt);
  });

  it('builds the gpt-image-2 request body with the selected explicit pixel size', () => {
    const body = buildUpstreamImageGenerationBody({
      model: 'gpt-image-2',
      prompt: 'studio portrait',
      aspectRatio: '16:9',
      imageSize: '2048x1152',
      quality: 'medium',
      generateCount: 2,
      referenceImages: ['base64-image'],
      responseFormat: 'url',
    });

    expect(body).toMatchObject({
      model: 'gpt-image-2',
      response_format: 'url',
      image: ['base64-image'],
      size: '2048x1152',
      quality: 'medium',
      n: 2,
    });

    expect(body.prompt).toBe(
      'studio portrait\n\nComposition requirements: preserve the reference subject and style, but prioritize a 16:9 frame on a 2048x1152 canvas. Do not crop, pad, expand, or reframe the scene into a different aspect ratio.',
    );

    expect(body).not.toHaveProperty('aspect_ratio');
    expect(body).not.toHaveProperty('image_size');
  });

  it('builds the gpt-image-2 request body with an experimental explicit pixel size', () => {
    const body = buildUpstreamImageGenerationBody({
      model: 'gpt-image-2',
      prompt: 'cinematic alley scene',
      aspectRatio: '16:9',
      imageSize: '1536x864',
      responseFormat: 'url',
    });

    expect(body).toMatchObject({
      model: 'gpt-image-2',
      response_format: 'url',
      size: '1536x864',
    });

    expect(body.prompt).toBe(
      'cinematic alley scene\n\nComposition requirements: prioritize a 16:9 frame on a 1536x864 canvas. Do not crop, pad, expand, or reframe the scene into a different aspect ratio.',
    );
  });

  it('builds the gpt-image-2 request body with the documented auto size', () => {
    const body = buildUpstreamImageGenerationBody({
      model: 'gpt-image-2',
      prompt: 'loose editorial composition',
      aspectRatio: '16:9',
      imageSize: 'auto',
      quality: 'high',
      responseFormat: 'url',
    });

    expect(body).toMatchObject({
      model: 'gpt-image-2',
      response_format: 'url',
      size: 'auto',
      quality: 'high',
      prompt: 'loose editorial composition',
    });
  });
});