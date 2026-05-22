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

  it('uses the server proxy first for remote video urls to avoid browser CORS failures', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:3100' },
      setTimeout,
      clearTimeout,
    });

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Blob(['video-ok'], { type: 'video/mp4' }), {
        status: 200,
        headers: { 'Content-Type': 'video/mp4' },
      }));

    vi.stubGlobal('fetch', fetchMock);

    const blob = await fetchRemoteBlob(
      'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-2-0/result.mp4?X-Tos-Signature=test',
      'lovart-video-status',
      1_000,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/proxy-download?url=https%3A%2F%2Fark-acg-cn-beijing.tos-cn-beijing.volces.com%2Fdoubao-seedance-2-0%2Fresult.mp4%3FX-Tos-Signature%3Dtest&filename=lovart-video-status');
    expect(blob).not.toBeNull();
    await expect(blob?.text()).resolves.toBe('video-ok');
  });
});