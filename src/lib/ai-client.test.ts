import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-settings', () => ({
  apiSettingsHeaders: vi.fn((feature?: string) => (feature ? { 'x-ai-feature-test': feature } : {})),
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

import {
  GENERATION_POLLING_CONFIG,
  getGenerationPollingDelay,
  getGenerationPollingStrategy,
  pollGenerationTask,
  requestImageGeneration,
} from './ai-client';
import { apiSettingsHeaders } from './api-settings';
import { directGenerateImage } from './direct-ai-client';
import { resolveImageRequest } from './generation-defaults';

describe('generation polling strategy', () => {
  it('keeps the video soft timeout separate from the hard timeout', () => {
    const strategy = getGenerationPollingStrategy('video', { intervalMs: 1_000 });

    expect(strategy.staleTimeoutMs).toBe(20 * 60 * 1000);
    expect(strategy.hardTimeoutMs).toBe(4 * 60 * 60 * 1000);
    expect(strategy.maxAttempts).toBe(4 * 60 * 60);
  });

  it('backs off video polling as tasks get older', () => {
    expect(getGenerationPollingDelay('video', 2 * 60 * 1000)).toBe(GENERATION_POLLING_CONFIG.intervalMs);
    expect(getGenerationPollingDelay('video', 12 * 60 * 1000)).toBe(GENERATION_POLLING_CONFIG.videoBackoffIntervalMs);
    expect(getGenerationPollingDelay('video', 21 * 60 * 1000)).toBe(GENERATION_POLLING_CONFIG.videoLongRunningIntervalMs);
    expect(getGenerationPollingDelay('video', 5 * 60 * 1000, true)).toBe(GENERATION_POLLING_CONFIG.videoLongRunningIntervalMs);
  });

  it('keeps a longer retry window for transient video status errors', () => {
    expect(GENERATION_POLLING_CONFIG.videoRetryableErrorTimeoutMs).toBe(15 * 60 * 1000);
  });
});

describe('pollGenerationTask error classification', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats temporary upstream status errors as retryable', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ details: 'upstream unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(pollGenerationTask('task-video-1', 'video')).resolves.toEqual({
      status: 'retryable-error',
      error: 'upstream unavailable',
    });
  });

  it('treats credential and request errors as permanent failures', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ details: 'LAOMANDI_API_KEY 未配置' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(pollGenerationTask('laomandi:task-video-1', 'video')).resolves.toEqual({
      status: 'failed',
      error: 'LAOMANDI_API_KEY 未配置',
    });

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: '缺少 taskId 参数' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(pollGenerationTask('', 'video')).resolves.toEqual({
      status: 'failed',
      error: '缺少 taskId 参数',
    });
  });
});

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
    expect(apiSettingsHeaders).toHaveBeenCalledWith('image');

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/generate-image');
    expect(init?.headers).toMatchObject({ 'x-ai-feature-test': 'image' });
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
    expect(apiSettingsHeaders).toHaveBeenCalledWith('image');

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/generate-image');
    expect(init?.headers).toMatchObject({ 'x-ai-feature-test': 'image' });
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

  it('routes chat requests through chat feature headers', async () => {
    fetchMock.mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { requestAiChat } = await import('./ai-client');
    await requestAiChat({ messages: [{ role: 'user', content: 'hello' }] });

    expect(apiSettingsHeaders).toHaveBeenCalledWith('chat');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/ai-chat');
    expect(init?.headers).toMatchObject({ 'x-ai-feature-test': 'chat' });
  });

  it('routes status polling through the matching generation feature headers', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'processing', progress: 12 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { pollGenerationTask } = await import('./ai-client');
    await pollGenerationTask('task-123', 'video');

    expect(apiSettingsHeaders).toHaveBeenCalledWith('video');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/video-status?taskId=task-123');
    expect(init?.headers).toMatchObject({ 'x-ai-feature-test': 'video' });
  });
});