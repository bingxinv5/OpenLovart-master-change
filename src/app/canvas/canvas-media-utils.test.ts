import { describe, expect, it } from 'vitest';

import { fitAspectRatioLabelToBounds, parseAspectRatioLabel } from './canvas-media-utils';

describe('canvas-media-utils aspect ratio helpers', () => {
  it('parses known aspect ratio labels', () => {
    expect(parseAspectRatioLabel('21:9')).toEqual({
      label: '21:9',
      width: 21,
      height: 9,
    });
  });

  it('parses generic aspect ratio labels', () => {
    expect(parseAspectRatioLabel('7:3')).toEqual({
      label: '7:3',
      width: 7,
      height: 3,
    });
  });

  it('ignores auto or invalid aspect ratios', () => {
    expect(parseAspectRatioLabel('auto')).toBeNull();
    expect(parseAspectRatioLabel('')).toBeNull();
    expect(parseAspectRatioLabel('wide')).toBeNull();
  });

  it('fits 21:9 into a square placeholder without leaving it square', () => {
    expect(fitAspectRatioLabelToBounds('21:9', 400, 400)).toEqual({
      width: 400,
      height: 171,
      aspectRatio: '21:9',
    });
  });

  it('fits portrait ratios into a square placeholder', () => {
    expect(fitAspectRatioLabelToBounds('3:4', 400, 400)).toEqual({
      width: 300,
      height: 400,
      aspectRatio: '3:4',
    });
  });
});