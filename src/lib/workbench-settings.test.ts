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
    expect(normalized.imageDefaults.imageSize).toBe('1672x942');
  });

  it('preserves explicit gpt-image-2 pixel defaults', () => {
    const normalized = normalizeWorkbenchSettings({
      imageDefaults: {
        ...DEFAULT_WORKBENCH_SETTINGS.imageDefaults,
        model: 'gpt-image-2',
        aspectRatio: '21:9',
        imageSize: '1915x821',
      },
    });

    expect(normalized.imageDefaults.aspectRatio).toBe('21:9');
    expect(normalized.imageDefaults.imageSize).toBe('1915x821');
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
});