import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearVideoSourceFailure,
  hasVideoSourceFailed,
  markVideoSourceFailed,
  markVideoSourceLoaded,
  VIDEO_SOURCE_FAILURE_TTL_MS,
} from './video-load-state';

describe('video-load-state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('remembers failed video sources only for a short recovery window', () => {
    const src = 'https://example.com/missing-ttl.mp4';

    expect(hasVideoSourceFailed(src)).toBe(false);
    markVideoSourceFailed(src);
    expect(hasVideoSourceFailed(src)).toBe(true);

    vi.setSystemTime(1_000 + VIDEO_SOURCE_FAILURE_TTL_MS - 1);
    expect(hasVideoSourceFailed(src)).toBe(true);

    vi.setSystemTime(1_000 + VIDEO_SOURCE_FAILURE_TTL_MS);
    expect(hasVideoSourceFailed(src)).toBe(false);
  });

  it('clears failed sources after a successful load or retry', () => {
    const src = 'https://example.com/recovered.mp4';

    markVideoSourceFailed(src);
    expect(hasVideoSourceFailed(src)).toBe(true);
    markVideoSourceLoaded(src);
    expect(hasVideoSourceFailed(src)).toBe(false);

    markVideoSourceFailed(src);
    expect(hasVideoSourceFailed(src)).toBe(true);
    clearVideoSourceFailure(src);
    expect(hasVideoSourceFailed(src)).toBe(false);
  });
});