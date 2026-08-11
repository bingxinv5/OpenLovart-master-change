import { describe, expect, it } from 'vitest';

import { buildImageImportBatches } from './use-canvas-media-import';

describe('image import batching', () => {
  it('splits a large import into ordered persistence batches', () => {
    const batches = buildImageImportBatches(Array.from({ length: 12 }, (_, index) => index), 5);

    expect(batches).toEqual([
      { start: 0, items: [0, 1, 2, 3, 4] },
      { start: 5, items: [5, 6, 7, 8, 9] },
      { start: 10, items: [10, 11] },
    ]);
  });

  it('uses a safe minimum batch size', () => {
    expect(buildImageImportBatches(['a', 'b'], 0)).toEqual([
      { start: 0, items: ['a'] },
      { start: 1, items: ['b'] },
    ]);
  });
});
