import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKBENCH_SETTINGS,
  getImageDefaultsForProvider,
  normalizeWorkbenchSettings,
  setImageDefaultsForProvider,
} from './workbench-settings';

describe('workbench-settings', () => {
  it('defaults the canvas theme to light', () => {
    const normalized = normalizeWorkbenchSettings({});

    expect(DEFAULT_WORKBENCH_SETTINGS.canvasTheme).toBe('light');
    expect(normalized.canvasTheme).toBe('light');
  });

  it('preserves supported canvas themes', () => {
    const normalized = normalizeWorkbenchSettings({
      canvasTheme: 'dark',
    });

    expect(normalized.canvasTheme).toBe('dark');
  });

  it('falls back to light for invalid canvas themes', () => {
    const normalized = normalizeWorkbenchSettings({
      canvasTheme: 'system',
    });

    expect(normalized.canvasTheme).toBe('light');
  });

  it('uses 2K as the default size for standard image models', () => {
    const normalized = normalizeWorkbenchSettings({
      imageDefaults: {
        ...DEFAULT_WORKBENCH_SETTINGS.imageDefaults,
        model: 'nano-banana-2',
        imageSize: '1915x821',
      },
    });

    expect(DEFAULT_WORKBENCH_SETTINGS.imageDefaults.model).toBe('gemini-3.1-flash-image-preview');
    expect(DEFAULT_WORKBENCH_SETTINGS.imageDefaults.imageSize).toBe('2K');
    expect(normalized.imageDefaults.model).toBe('nano-banana-2');
    expect(normalized.imageDefaults.imageSize).toBe('2K');
  });

  it('keeps image defaults isolated by provider', () => {
    const normalized = normalizeWorkbenchSettings({});

    expect(getImageDefaultsForProvider(normalized, 'bltcy')).toEqual({
      model: 'gemini-3.1-flash-image-preview',
      aspectRatio: '21:9',
      imageSize: '2K',
      quality: 'auto',
      generateCount: 1,
    });
    expect(getImageDefaultsForProvider(normalized, 'magicapi')).toEqual({
      model: 'gemini-3-pro-image-preview',
      aspectRatio: '21:9',
      imageSize: '2K',
      quality: 'auto',
      generateCount: 1,
    });
  });

  it('updates MagicAPI image defaults without changing the default provider defaults', () => {
    const updated = setImageDefaultsForProvider(normalizeWorkbenchSettings({}), 'magicapi', {
      model: 'gpt-image-2-pro',
      aspectRatio: '16:9',
      imageSize: '3840x2160',
      quality: 'high',
      generateCount: 2,
    });

    expect(updated.imageDefaults.model).toBe('gemini-3.1-flash-image-preview');
    expect(getImageDefaultsForProvider(updated, 'bltcy').model).toBe('gemini-3.1-flash-image-preview');
    expect(getImageDefaultsForProvider(updated, 'magicapi')).toEqual({
      model: 'gpt-image-2-pro',
      aspectRatio: '16:9',
      imageSize: '3840x2160',
      quality: 'high',
      generateCount: 2,
    });
  });

  it('preserves MagicAPI-compatible image default models in provider-specific defaults', () => {
    const normalized = normalizeWorkbenchSettings({
      imageProviderDefaults: {
        magicapi: {
          ...DEFAULT_WORKBENCH_SETTINGS.imageProviderDefaults.magicapi,
          model: 'gpt-image-2-pro',
          aspectRatio: '16:9',
          imageSize: '3840x2160',
          quality: 'high',
        },
      },
    });

    const magicDefaults = getImageDefaultsForProvider(normalized, 'magicapi');
    expect(normalized.imageDefaults.model).toBe('gemini-3.1-flash-image-preview');
    expect(magicDefaults.model).toBe('gpt-image-2-pro');
    expect(magicDefaults.imageSize).toBe('3840x2160');
    expect(magicDefaults.quality).toBe('high');
  });

  it('preserves MagicAPI GPT portrait widescreen defaults for provider-specific settings', () => {
    const normalized = normalizeWorkbenchSettings({
      imageProviderDefaults: {
        magicapi: {
          ...DEFAULT_WORKBENCH_SETTINGS.imageProviderDefaults.magicapi,
          model: 'gpt-image-2-pro',
          aspectRatio: '9:21',
          imageSize: '960x2240',
          quality: 'high',
        },
      },
    });

    const magicDefaults = getImageDefaultsForProvider(normalized, 'magicapi');
    expect(magicDefaults.model).toBe('gpt-image-2-pro');
    expect(magicDefaults.aspectRatio).toBe('9:21');
    expect(magicDefaults.imageSize).toBe('960x2240');
  });

  it('migrates legacy gpt-image-2 defaults to explicit pixel sizes', () => {
    const normalized = normalizeWorkbenchSettings({
      imageDefaults: {
        ...DEFAULT_WORKBENCH_SETTINGS.imageDefaults,
        model: 'gpt-image-2',
        aspectRatio: '16:9',
        imageSize: '4K',
      },
    });

    expect(normalized.imageDefaults.model).toBe('gpt-image-2');
    expect(normalized.imageDefaults.aspectRatio).toBe('16:9');
    expect(normalized.imageDefaults.imageSize).toBe('2048x1152');
  });

  it('preserves explicit gpt-image-2 pixel defaults', () => {
    const normalized = normalizeWorkbenchSettings({
      imageDefaults: {
        ...DEFAULT_WORKBENCH_SETTINGS.imageDefaults,
        model: 'gpt-image-2',
        aspectRatio: '21:9',
        imageSize: '1344x576',
      },
    });

    expect(normalized.imageDefaults.aspectRatio).toBe('21:9');
    expect(normalized.imageDefaults.imageSize).toBe('1344x576');
  });

  it('replaces invalid legacy gpt-image-2 pixel defaults with a legal preset', () => {
    const normalized = normalizeWorkbenchSettings({
      imageDefaults: {
        ...DEFAULT_WORKBENCH_SETTINGS.imageDefaults,
        model: 'gpt-image-2',
        aspectRatio: '21:9',
        imageSize: '1915x821',
      },
    });

    expect(normalized.imageDefaults.aspectRatio).toBe('21:9');
    expect(normalized.imageDefaults.imageSize).toBe('2240x960');
  });

  it('maps legacy gpt-image-2 21:9 defaults to the remaining stable size', () => {
    const normalized = normalizeWorkbenchSettings({
      imageDefaults: {
        ...DEFAULT_WORKBENCH_SETTINGS.imageDefaults,
        model: 'gpt-image-2',
        aspectRatio: '21:9',
        imageSize: '4K',
      },
    });

    expect(normalized.imageDefaults.aspectRatio).toBe('21:9');
    expect(normalized.imageDefaults.imageSize).toBe('2240x960');
  });

  it('normalizes invalid gpt-image-2 quality defaults back to auto', () => {
    const normalized = normalizeWorkbenchSettings({
      imageDefaults: {
        ...DEFAULT_WORKBENCH_SETTINGS.imageDefaults,
        model: 'gpt-image-2',
        quality: 'ultra',
      },
    });

    expect(normalized.imageDefaults.model).toBe('gpt-image-2');
    expect(normalized.imageDefaults.quality).toBe('auto');
  });

  it('preserves documented gpt-image-2 auto size defaults', () => {
    const normalized = normalizeWorkbenchSettings({
      imageDefaults: {
        ...DEFAULT_WORKBENCH_SETTINGS.imageDefaults,
        model: 'gpt-image-2',
        aspectRatio: '16:9',
        imageSize: 'auto',
        quality: 'high',
      },
    });

    expect(normalized.imageDefaults.model).toBe('gpt-image-2');
    expect(normalized.imageDefaults.imageSize).toBe('auto');
    expect(normalized.imageDefaults.aspectRatio).toBe('auto');
    expect(normalized.imageDefaults.quality).toBe('high');
  });
});