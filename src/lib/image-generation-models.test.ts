import { describe, expect, it } from 'vitest';

import {
  buildOpenAiGptImagePrompt,
  describeOpenAiGptImageAspectRatio,
  DEFAULT_MAX_REFERENCE_IMAGES,
  OPENAI_GPT_IMAGE_PIXEL_SIZES,
  OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS,
  buildUpstreamImageGenerationBody,
  getOpenAiGptImagePromptCompensation,
  getImageGenerationModelBranch,
  getMaxReferenceImagesForImageModel,
  normalizeOpenAiGptImagePixelSize,
  resolveOpenAiGptImageAspectRatio,
  resolveOpenAiGptImagePixelSize,
} from './image-generation-models';

describe('image-generation-models', () => {
  it('routes gpt-image-2 to the dedicated openai gpt image branch', () => {
    expect(getImageGenerationModelBranch('gpt-image-2')).toBe('openai-gpt-image');
  });

  it('keeps gpt-image-2 on the default reference image budget until capability is verified', () => {
    expect(getMaxReferenceImagesForImageModel('gpt-image-2')).toBe(DEFAULT_MAX_REFERENCE_IMAGES);
  });

  it('exposes gpt-image-2 aspect ratios that can be derived from explicit pixel sizes', () => {
    expect(OPENAI_GPT_IMAGE_SELECTABLE_ASPECT_RATIOS).toEqual(['1:1', '3:2', '2:3', '16:9', '9:16', '21:9']);
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('1254x1254');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('1672x942');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('942x1672');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).toContain('2240x960');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1024x1024');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1792x1008');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('576x1024');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1915x821');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('2048x1152');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1152x2048');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1344x576');
    expect(OPENAI_GPT_IMAGE_PIXEL_SIZES).not.toContain('1080x2560');
  });

  it('passes through explicit gpt-image-2 pixel sizes and can still migrate legacy ratios', () => {
    expect(resolveOpenAiGptImagePixelSize('1672x942', '16:9')).toBe('1672x942');
    expect(resolveOpenAiGptImagePixelSize(' 1536 x 864 ', '16:9')).toBe('1536x864');
    expect(resolveOpenAiGptImagePixelSize(undefined, '1:1')).toBe('1254x1254');
    expect(resolveOpenAiGptImagePixelSize(undefined, '3:2')).toBe('1536x1024');
    expect(resolveOpenAiGptImagePixelSize(undefined, '2:3')).toBe('1024x1536');
    expect(resolveOpenAiGptImagePixelSize(undefined, '16:9')).toBe('1672x942');
    expect(resolveOpenAiGptImagePixelSize(undefined, '9:16')).toBe('942x1672');
    expect(resolveOpenAiGptImagePixelSize(undefined, '21:9')).toBe('2240x960');
    expect(resolveOpenAiGptImagePixelSize(undefined, '9:21')).toBe('1024x1536');
  });

  it('derives gpt-image-2 aspect ratios from explicit pixel sizes', () => {
    expect(resolveOpenAiGptImageAspectRatio('1254x1254')).toBe('1:1');
    expect(resolveOpenAiGptImageAspectRatio('1672x942')).toBe('16:9');
    expect(resolveOpenAiGptImageAspectRatio('942x1672')).toBe('9:16');
    expect(resolveOpenAiGptImageAspectRatio('2240x960')).toBe('21:9');
    expect(resolveOpenAiGptImageAspectRatio('1080x2560', '9:21')).toBe('2:3');
  });

  it('describes exact aspect ratios for experimental pixel sizes', () => {
    expect(normalizeOpenAiGptImagePixelSize(' 1536 X 864 ')).toBe('1536x864');
    expect(describeOpenAiGptImageAspectRatio('1254x1254')).toBe('1:1');
    expect(describeOpenAiGptImageAspectRatio('1672x942')).toBe('16:9');
    expect(describeOpenAiGptImageAspectRatio('942x1672')).toBe('9:16');
    expect(describeOpenAiGptImageAspectRatio('2240x960')).toBe('21:9');
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
      imageSize: '1672x942',
      generateCount: 2,
      referenceImages: ['base64-image'],
      responseFormat: 'url',
    });

    expect(body).toMatchObject({
      model: 'gpt-image-2',
      response_format: 'url',
      image: ['base64-image'],
      size: '1672x942',
      n: 2,
    });

    expect(body.prompt).toBe(
      'studio portrait\n\nComposition requirements: preserve the reference subject and style, but prioritize a 16:9 frame on a 1672x942 canvas. Do not crop, pad, expand, or reframe the scene into a different aspect ratio.',
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
});