import { describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, cspContent } from './cspPlugin';

describe('Content-Security-Policy', () => {
  const csp = cspContent();

  it('allows no inline scripts, no plugins and no foreign base URL', () => {
    expect(CSP_DIRECTIVES['script-src']).not.toContain("'unsafe-inline'");
    expect(CSP_DIRECTIVES['style-src']).not.toContain("'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('scripts come only from the app and the three official player APIs', () => {
    expect(CSP_DIRECTIVES['script-src']).toEqual([
      "'self'",
      "'unsafe-eval'", // required by the Spotify iFrame API; see cspPlugin.ts
      'https://www.youtube.com',
      'https://s.ytimg.com',
      'https://w.soundcloud.com',
      'https://open.spotify.com',
      'https://embed-cdn.spotifycdn.com',
    ]);
  });

  it('keeps streams, artwork, the directory, the cloud backend and the players working', () => {
    for (const d of ['media-src', 'img-src', 'connect-src']) expect(CSP_DIRECTIVES[d]).toEqual(expect.arrayContaining(['https:', 'http:']));
    expect(CSP_DIRECTIVES['connect-src']).toContain('wss:');
    expect(CSP_DIRECTIVES['frame-src']).toEqual(['https:']);
    expect(CSP_DIRECTIVES['worker-src']).toEqual(["'self'", 'blob:']); // service worker + hls.js
  });
});
