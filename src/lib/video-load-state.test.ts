import { describe, expect, it } from 'vitest';
import { hasVideoSourceFailed, markVideoSourceFailed } from './video-load-state';

describe('video-load-state', () => {
  it('remembers failed video sources so renderers can avoid retrying broken URLs', () => {
    const src = `https://example.com/missing-${Date.now()}.mp4`;

    expect(hasVideoSourceFailed(src)).toBe(false);
    markVideoSourceFailed(src);
    expect(hasVideoSourceFailed(src)).toBe(true);
  });
});