/*
 * LIQUEAMP service worker (ARCH §34, MASTER §71).
 * Template — the build fills in the version and the precache list (see
 * pwa/serviceWorkerPlugin.ts). Not used in development.
 *
 * What it does:
 *  - caches the application shell (HTML, JS, CSS, fonts, icons) so LIQUEAMP
 *    opens without a network; local data lives in IndexedDB and needs no SW
 *  - never touches other origins: streams, the radio directory, artwork and
 *    provider players always go to the network (streams are not assumed to
 *    work offline — SPEC §5)
 *  - never intercepts media range requests
 *  - never activates itself mid-session: a new version waits until the app
 *    asks for it, so an update cannot cut off playback
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL_CACHE = `liqueamp-shell-${VERSION}`;
/** Same-origin build assets that are not precached (e.g. the HLS chunk), cached on first use. */
const RUNTIME_CACHE = 'liqueamp-runtime';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        // old shells, and runtime assets of old builds (their hashed names are gone)
        if ((key.startsWith('liqueamp-shell-') && key !== SHELL_CACHE) || key === RUNTIME_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_INFO' && event.ports[0]) event.ports[0].postMessage({ version: VERSION, precached: PRECACHE.length, cache: SHELL_CACHE });
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Any route (/, /browse, /control/themes …) is the same single-page shell.
    event.respondWith(appShell(request));
    return;
  }
  if (PRECACHE.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, url));
  }
});

async function appShell(request) {
  const cached = await caches.match('/index.html', { cacheName: SHELL_CACHE, ignoreVary: true });
  return cached || fetch(request);
}

async function cacheFirst(request, url) {
  // ignoreVary: module scripts and fonts are requested in CORS mode (with an
  // Origin header) while the precache fetched them without one; servers that
  // send \`Vary: Origin\` would otherwise make every lookup miss.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && url.pathname.startsWith('/assets/')) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
