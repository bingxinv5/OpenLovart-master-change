import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-settings', () => ({
  apiSettingsHeaders: vi.fn(() => ({})),
}));

vi.mock('./generation-defaults', () => ({
  resolveImageRequest: vi.fn((request) => ({
    model: 'gemini-3.1-flash-image-preview',
    aspectRatio: '1:1',
    imageSize: '1K',
    quality: 'auto',
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
      quality: 'auto',
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
      quality: 'auto',
      forceAsync: true,
    });
    expect(result).toEqual({ taskId: 'task-gpt-image-async', status: 'pending' });
  });

  it('forces other image models through the async proxy path as well', async () => {
    vi.mocked(directGenerateImage).mockResolvedValue({
      status: 'completed',
      imageUrl: 'https://example.com/direct.png',
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ taskId: 'task-gemini-async', status: 'pending' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await requestImageGeneration({
      prompt: 'studio portrait',
      model: 'gemini-3.1-flash-image-preview',
      preferDirect: true,
    });

    expect(directGenerateImage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/generate-image');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      prompt: 'studio portrait',
      model: 'gemini-3.1-flash-image-preview',
      quality: 'auto',
      forceAsync: true,
    });
    expect(result).toEqual({ taskId: 'task-gemini-async', status: 'pending' });
  });

  it('forwards explicit quality through the proxy request body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ taskId: 'task-quality-1', status: 'pending' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await requestImageGeneration({
      prompt: 'editorial portrait',
      model: 'gpt-image-2',
      quality: 'high',
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      prompt: 'editorial portrait',
      model: 'gpt-image-2',
      quality: 'high',
    });
  });

  it('formats upstream invalid token errors with actionable API key guidance', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      error: '图片生成失败',
      details: 'Invalid token (request id: 20260513044345585531636zrVIzKx)',
    }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(requestImageGeneration({
      prompt: 'token error',
      model: 'gemini-3.1-flash-image-preview',
    })).rejects.toThrow('当前平台 API Key 无效或已过期');
  });
});