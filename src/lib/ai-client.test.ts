import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-settings', () => ({
  apiSettingsHeaders: vi.fn(() => ({})),
}));

vi.mock('./generation-defaults', () => ({
  resolveImageRequest: vi.fn((request) => ({
    model: 'gemini-3.1-flash-image-preview',
    aspectRatio: '1:1',
    imageSize: '1K',
    ...request,
  })),
  resolveVideoRequest: vi.fn(),
}));

vi.mock('./direct-ai-client', () => ({
  directGenerateImage: vi.fn(),
}));

import { requestImageGeneration } from './ai-client';
import { directGenerateImage } from './direct-ai-client';
import { resolveImageRequest } from './generation-defaults';

describe('requestImageGeneration', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);

    vi.mocked(resolveImageRequest).mockImplementation((request) => ({
      model: 'gemini-3.1-flash-image-preview',
      aspectRatio: '1:1',
      imageSize: '1K',
      ...request,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forces gpt-image-2 through the async proxy path', async () => {
    vi.mocked(directGenerateImage).mockResolvedValue({
      status: 'completed',
      imageUrl: 'https://example.com/direct.png',
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ taskId: 'task-gpt-image-async', status: 'pending' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await requestImageGeneration({
      prompt: 'minimalist poster',
      model: 'gpt-image-2',
      preferDirect: true,
    });

    expect(directGenerateImage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/generate-image');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      prompt: 'minimalist poster',
      model: 'gpt-image-2',
      forceAsync: true,
    });
    expect(result).toEqual({ taskId: 'task-gpt-image-async', status: 'pending' });
  });

  it('keeps direct generation enabled for other image models', async () => {
    vi.mocked(directGenerateImage).mockResolvedValue({
      status: 'completed',
      imageUrl: 'https://example.com/direct.png',
    });

    const result = await requestImageGeneration({
      prompt: 'studio portrait',
      model: 'gemini-3.1-flash-image-preview',
      preferDirect: true,
    });

    expect(directGenerateImage).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'completed',
      imageUrl: 'https://example.com/direct.png',
    });
  });
});