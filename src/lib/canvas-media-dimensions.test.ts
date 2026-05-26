import { describe, expect, it } from 'vitest';
import {
  getMediaToolbarDimensions,
  parsePixelDimensions,
  resolveVideoResolutionPixelDimensions,
} from './canvas-media-dimensions';

describe('canvas-media-dimensions', () => {
  it('parses explicit pixel dimensions', () => {
    expect(parsePixelDimensions('960x2240')).toEqual({ width: 960, height: 2240 });
    expect(parsePixelDimensions(' 3840 × 2160 ')).toEqual({ width: 3840, height: 2160 });
    expect(parsePixelDimensions('2K')).toBeNull();
  });

  it('prefers natural media dimensions for toolbar display', () => {
    expect(getMediaToolbarDimensions({
      type: 'image',
      width: 400,
      height: 933,
      mediaNaturalWidth: 960,
      mediaNaturalHeight: 2240,
      selectedImageSize: '1024x1024',
    })).toEqual({ width: 960, height: 2240, source: 'natural' });
  });

  it('uses selected image pixel size before canvas bounds', () => {
    expect(getMediaToolbarDimensions({
      type: 'image',
      width: 400,
      height: 933,
      selectedImageSize: '960x2240',
    })).toEqual({ width: 960, height: 2240, source: 'selected-image-size' });
  });

  it('derives video pixels from resolution and aspect ratio when natural size is unavailable', () => {
    expect(resolveVideoResolutionPixelDimensions('720p', '9:16')).toEqual({ width: 720, height: 1280 });
    expect(getMediaToolbarDimensions({
      type: 'video',
      width: 400,
      height: 711,
      selectedResolution: '1080p',
      selectedAspectRatio: '16:9',
    })).toEqual({ width: 1920, height: 1080, source: 'selected-video-resolution' });
  });

  it('falls back to canvas bounds when no media pixel size is known', () => {
    expect(getMediaToolbarDimensions({ type: 'image', width: 400, height: 933 })).toEqual({
      width: 400,
      height: 933,
      source: 'canvas',
    });
  });
});