// Content-Security-Policy for the built app (before accounts exist, so a
// session token in the browser is never exposed to injected scripts).
// GitHub Pages cannot send HTTP headers, so the policy is a <meta> tag,
// added at build time only: Vite's dev server needs inline scripts and a
// websocket. (A meta CSP cannot set frame-ancestors, report-uri or sandbox.)
import type { Plugin } from 'vite';

/**
 * - scripts: the app itself, plus the three official player APIs it loads
 *   (YouTube iframe API, SoundCloud widget API, Spotify iframe API). No inline
 *   scripts. eval is allowed only because the Spotify API requires it.
 * - styles and fonts: the app's own files only (React style props use the
 *   CSSOM, which CSP does not block).
 * - media, images, connections: any http(s) — radio streams, artwork and
 *   station icons come from anywhere, the app probes streams for CORS, and the
 *   cloud backend (https) and its realtime channel (wss) are other origins.
 * - frames: the official embedded players (https only).
 * - workers: the service worker, and hls.js' blob: worker.
 */
export const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  // Spotify's loader (open.spotify.com) pulls its code from embed-cdn.spotifycdn.com,
  // and that code needs eval: without 'unsafe-eval' the Spotify iFrame API never
  // becomes ready (verified in Chrome and Edge, 2026-09-25). Inline scripts and
  // scripts from any other host stay blocked. Revisit if Spotify drops eval, or
  // if its API is moved into an isolated frame.
  'script-src': ["'self'", "'unsafe-eval'", 'https://www.youtube.com', 'https://s.ytimg.com', 'https://w.soundcloud.com', 'https://open.spotify.com', 'https://embed-cdn.spotifycdn.com'],
  'style-src': ["'self'"],
  'font-src': ["'self'"],
  'img-src': ["'self'", 'https:', 'http:', 'data:', 'blob:'],
  'media-src': ["'self'", 'https:', 'http:', 'data:', 'blob:'],
  'connect-src': ["'self'", 'https:', 'http:', 'wss:'],
  'frame-src': ['https:'],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

export function cspContent(directives: Record<string, string[]> = CSP_DIRECTIVES): string {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

export function cspPlugin(): Plugin {
  return {
    name: 'liqueamp-csp',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: cspContent() }, injectTo: 'head-prepend' }];
    },
  };
}
