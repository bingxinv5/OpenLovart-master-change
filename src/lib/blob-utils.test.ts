import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchRemoteBlob } from './blob-utils';

describe('fetchRemoteBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retries transient failures for local proxy image urls', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:3100' },
      setTimeout,
      clearTimeout,
    });

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('temporary failure', { status: 500 }))
      .mockResolvedValueOnce(new Response(new Blob(['ok'], { type: 'image/png' }), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }));

    vi.stubGlobal('fetch', fetchMock);

    const blob = await fetchRemoteBlob(
      'http://localhost:3100/api/proxy-download?url=https%3A%2F%2Fexample.com%2Fimage.png&filename=lovart-test',
      'lovart-test',
      1_000,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(blob).not.toBeNull();
    await expect(blob?.text()).resolves.toBe('ok');
  });
});