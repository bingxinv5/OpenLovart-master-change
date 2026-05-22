import { describe, expect, it } from 'vitest';
import { resolveVideoPlaybackSource } from './video-playback-source';

describe('resolveVideoPlaybackSource', () => {
  const baseOrigin = 'http://localhost:3100';

  it('wraps external http video urls with proxy-download for inline playback', () => {
    expect(resolveVideoPlaybackSource('https://example.com/final.mp4?token=abc', {
      baseOrigin,
      filename: 'lovart-test-video',
    })).toBe('/api/proxy-download?url=https%3A%2F%2Fexample.com%2Ffinal.mp4%3Ftoken%3Dabc&filename=lovart-test-video&inline=1');
  });

  it('keeps local blob data and relative sources unchanged', () => {
    expect(resolveVideoPlaybackSource('blob:http://localhost:3100/video-id', { baseOrigin })).toBe('blob:http://localhost:3100/video-id');
    expect(resolveVideoPlaybackSource('data:video/mp4;base64,AAAA', { baseOrigin })).toBe('data:video/mp4;base64,AAAA');
    expect(resolveVideoPlaybackSource('/uploads/video.mp4', { baseOrigin })).toBe('/uploads/video.mp4');
  });

  it('normalizes already proxied absolute urls back to the current local api path', () => {
    expect(resolveVideoPlaybackSource(
      'http://localhost:3000/api/proxy-download?url=https%3A%2F%2Fexample.com%2Fa.mp4&filename=old&inline=1',
      { baseOrigin },
    )).toBe('/api/proxy-download?url=https%3A%2F%2Fexample.com%2Fa.mp4&filename=old&inline=1');
  });

  it('keeps same-origin absolute urls as local paths without proxy wrapping', () => {
    expect(resolveVideoPlaybackSource('http://localhost:3100/media/video.mp4?cache=1', { baseOrigin }))
      .toBe('/media/video.mp4?cache=1');
  });
});