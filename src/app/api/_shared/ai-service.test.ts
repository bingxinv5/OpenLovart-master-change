import { describe, expect, it } from 'vitest';

import { extractVideoUrl, inferGenerationTaskKind } from './ai-service';

describe('ai-service video extraction', () => {
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
});