// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { precacheManifest, renderServiceWorker, shouldPrecache } from './serviceWorkerPlugin';

const files = [
  { path: '/index.html', content: '<html>' },
  { path: '/assets/index-abc.js', content: 'app' },
  { path: '/assets/hls-xyz.js', content: 'hls' },
  { path: '/assets/index-abc.js.map', content: '{}' },
  { path: '/sw.js', content: 'old worker' },
  { path: '/icons/icon-192.png', content: Buffer.from([1, 2, 3]) },
];

describe('service worker build', () => {
  it('precaches the shell but not the worker, source maps or the HLS library', () => {
    expect(shouldPrecache('/assets/hls-D9b4QHpD.js')).toBe(false);
    expect(shouldPrecache('/assets/ControlPage-x.js')).toBe(true);
    expect(precacheManifest(files).urls).toEqual(['/assets/index-abc.js', '/icons/icon-192.png', '/index.html']);
  });

  it('the version changes with any shell file, and only then', () => {
    const a = precacheManifest(files).version;
    expect(precacheManifest([...files].reverse()).version).toBe(a); // order-independent
    expect(precacheManifest(files.map((f) => (f.path === '/sw.js' ? { ...f, content: 'new worker' } : f))).version).toBe(a);
    expect(precacheManifest(files.map((f) => (f.path === '/icons/icon-192.png' ? { ...f, content: Buffer.from([9]) } : f))).version).not.toBe(a);
  });

  it('fills the real template and leaves no placeholder behind', () => {
    const template = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
    const out = renderServiceWorker(template, { urls: ['/index.html'], version: 'v123' });
    expect(out).toContain("const VERSION = 'v123';");
    expect(out).toContain('const PRECACHE = ["/index.html"];');
    expect(out).not.toMatch(/__VERSION__|__PRECACHE__/);
    expect(() => renderServiceWorker('const VERSION = 1;', { urls: [], version: 'x' })).toThrow();
  });

  it('the worker never intercepts other origins or range requests, and never skips waiting on its own', () => {
    const sw = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
    expect(sw).toContain("if (url.origin !== self.location.origin) return;");
    expect(sw).toContain("request.headers.has('range')");
    // skipWaiting only in response to the app's message
    expect(sw.match(/skipWaiting\(\)/g)).toHaveLength(1);
    expect(sw).toMatch(/type === 'SKIP_WAITING'\) self\.skipWaiting\(\)/);
  });
});
