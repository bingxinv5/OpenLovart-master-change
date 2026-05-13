import { describe, expect, it } from 'vitest';

import { classifyGenerationError } from './generator-error-utils';

describe('generator-error-utils', () => {
  it('classifies Gemini provider routing errors with token guidance', () => {
    const message = classifyGenerationError(
      'image',
      new Error("No provider for 'gemini-3.1-flash-image-preview' (format=GEMINI_NATIVE)"),
    );

    expect(message).toContain('Gemini 生图通道暂不可用');
    expect(message).toContain('default 组');
    expect(message).toContain('Gemini 图片通道');
  });

  it('classifies GPT image provider routing errors with model guidance', () => {
    const message = classifyGenerationError(
      'image',
      new Error('no available platform found for model gpt-5-2-image and no fallbacks configured: no usable platform found for model: gpt-5-2-image'),
    );

    expect(message).toContain('GPT 生图通道暂不可用');
    expect(message).toContain('gpt-5-2-image / gpt-image-2 图片通道');
    expect(message).toContain('更换一把已验证支持 GPT 生图的 API Key');
  });

  it('classifies upstream overloaded errors as user-friendly capacity issues', () => {
    const message = classifyGenerationError(
      'image',
      new Error('system memory overloaded'),
    );

    expect(message).toContain('上游服务繁忙');
    expect(message).toContain('1K/2K');
  });

  it('classifies bad gateway status errors as user-friendly upstream failures', () => {
    const message = classifyGenerationError(
      'image',
      new Error('bad response status code 502'),
    );

    expect(message).toContain('上游服务暂时不可用');
    expect(message).toContain('网关错误');
  });

  it('classifies slow upstream generation timeouts with resolution guidance', () => {
    const message = classifyGenerationError(
      'image',
      new Error('图片生成请求失败：上游生成耗时过长，已等待约 300 秒，任务可能没有及时返回结果。'),
    );

    expect(message).toContain('上游生成超时');
    expect(message).toContain('降低图片分辨率');
    expect(message).toContain('gpt-image-2-pro');
  });

  it('classifies upstream invalid token errors as API key failures', () => {
    const message = classifyGenerationError(
      'image',
      new Error('图片生成请求失败：Invalid token (request id: 20260513044345585531636zrVIzKx)'),
    );

    expect(message).toContain('API 密钥错误');
    expect(message).toContain('API Key 无效或已过期');
  });
});