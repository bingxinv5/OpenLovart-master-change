import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cdn-cache', async () => {
  const actual = await vi.importActual<typeof import('./cdn-cache')>('./cdn-cache');
  return {
    ...actual,
    fetchRemoteAssetPrefix: vi.fn(),
  };
});

import { fetchRemoteAssetPrefix } from './cdn-cache';

import {
  detectImageDimensions,
  extractImageResult,
  extractVideoUrl,
  inferGenerationTaskKind,
  inspectImageResultDimensions,
} from './ai-service';

const mockedFetchRemoteAssetPrefix = vi.mocked(fetchRemoteAssetPrefix);

describe('ai-service video extraction', () => {
  beforeEach(() => {
    mockedFetchRemoteAssetPrefix.mockReset();
  });

  it('extracts video url from domestic official task detail object content', () => {
    const payload = {
      status: 'SUCCESS',
      data: {
        content: {
          video_url: 'https://webstatic.aiproxy.vip/output/20260411/example.mp4',
        },
      },
    };

    expect(extractVideoUrl(payload)).toBe('https://webstatic.aiproxy.vip/output/20260411/example.mp4');
    expect(inferGenerationTaskKind(payload)).toBe('video');
  });

  it('extracts JieKou image_urls and videos arrays', () => {
    expect(extractImageResult({
      image_urls: ['https://example.com/jiekou-image.png'],
    })).toMatchObject({
      imageUrl: 'https://example.com/jiekou-image.png',
      images: ['https://example.com/jiekou-image.png'],
    });

    expect(extractVideoUrl({
      videos: [{ video_url: 'https://example.com/jiekou-video.mp4' }],
    })).toBe('https://example.com/jiekou-video.mp4');
  });

  it('detects png image dimensions from a buffer', () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nX1cAAAAASUVORK5CYII=',
      'base64',
    );

    expect(detectImageDimensions(pngBuffer)).toEqual({
      width: 1,
      height: 1,
      format: 'png',
    });
  });

  it('inspects image dimensions from inline image data', async () => {
    const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nX1cAAAAASUVORK5CYII=';

    await expect(inspectImageResultDimensions({
      imageUrl: null,
      imageData,
      images: [],
    })).resolves.toEqual({
      width: 1,
      height: 1,
      format: 'png',
      source: 'data-url',
    });
  });

  it('inspects image dimensions from a remote image prefix fetch', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nX1cAAAAASUVORK5CYII=',
      'base64',
    );

    mockedFetchRemoteAssetPrefix.mockResolvedValue({
      buffer: pngBuffer,
      contentType: 'image/png',
      url: new URL('https://example.com/test.png'),
    });

    await expect(inspectImageResultDimensions({
      imageUrl: 'https://example.com/test.png',
      imageData: null,
      images: [],
    })).resolves.toEqual({
      width: 1,
      height: 1,
      format: 'png',
      source: 'remote-url',
      url: 'https://example.com/test.png',
    });
  });
});