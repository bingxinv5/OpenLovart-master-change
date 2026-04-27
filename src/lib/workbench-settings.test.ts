import { describe, expect, it } from 'vitest';

import { DEFAULT_WORKBENCH_SETTINGS, normalizeWorkbenchSettings } from './workbench-settings';

describe('workbench-settings', () => {
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