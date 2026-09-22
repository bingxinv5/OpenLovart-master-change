import { describe, expect, it } from 'vitest';
import { getAiProvider } from './ai-providers';
import { migrateGeekNowBaseUrl, validateAiGatewayBaseUrl } from './network-policy';

describe('GeekNow gateway migration', () => {
  const provider = getAiProvider('magicapi');
  it.each(['geeknow.top', 'api.geeknow.top', 'www.geeknow.top'])('migrates %s before gateway validation', (host) => {
    expect(validateAiGatewayBaseUrl(`https://${host}/v1/`, {
      defaultBaseUrl: provider.defaultBaseUrl,
      allowedPublicPatterns: provider.allowedPublicPatterns,
    }).normalizedBaseUrl).toBe('https://geeknow.ai/v1');
  });
  it('preserves unrelated hosts and rejects lookalikes and embedded credentials', () => {
    expect(migrateGeekNowBaseUrl('https://geek.closeai.icu')).toBe('https://geek.closeai.icu');
    for (const url of ['https://api.geeknow.top.evil.example', 'https://user:pass@api.geeknow.top']) {
      expect(() => validateAiGatewayBaseUrl(url, {
        defaultBaseUrl: provider.defaultBaseUrl, allowedPublicPatterns: provider.allowedPublicPatterns,
      })).toThrow();
    }
  });
});
