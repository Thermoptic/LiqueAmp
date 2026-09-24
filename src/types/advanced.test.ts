import { describe, expect, it } from 'vitest';
import { parseTags, validArtwork } from '../lib/mediaFields';
import { DEFAULT_PROVIDERS, sanitizeAnalysis, sanitizeProviders, sanitizeRender } from './advanced';

describe('advanced settings validation', () => {
  it('provider config keeps known providers and booleans only', () => {
    expect(sanitizeProviders({ spotify: { enabled: false }, bogus: { enabled: false }, youtube: { enabled: 'no' } })).toEqual({
      ...DEFAULT_PROVIDERS,
      spotify: { enabled: false },
    });
    expect(sanitizeProviders('x')).toEqual(DEFAULT_PROVIDERS);
  });

  it('analysis and render settings fall back to defaults and clamp', () => {
    expect(sanitizeAnalysis({ fftSize: 3000, smoothing: 2 })).toEqual({ fftSize: 2048, smoothing: 0.95 });
    expect(sanitizeAnalysis({ fftSize: 512, smoothing: -1 })).toEqual({ fftSize: 512, smoothing: 0 });
    expect(sanitizeRender({ frameLimit: 45, dprCap: 1.5, debug: 'yes' })).toEqual({ frameLimit: 'auto', dprCap: 1.5, debug: false });
  });
});

describe('media field helpers', () => {
  it('tags are trimmed, de-duplicated case-insensitively and capped', () => {
    expect(parseTags(' #Jazz, jazz ,  lo-fi,, Chill ')).toEqual(['Jazz', 'lo-fi', 'Chill']);
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(','))).toHaveLength(20);
  });

  it('artwork must be http(s) or empty', () => {
    expect(validArtwork('')).toBe(true);
    expect(validArtwork('https://x/a.jpg')).toBe(true);
    expect(validArtwork('javascript:alert(1)')).toBe(false);
    expect(validArtwork('not a url')).toBe(false);
  });
});
