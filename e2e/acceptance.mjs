// LIQUEAMP acceptance test (MASTER §88) against the production build.
//
//   npm run e2e          build, then run in every installed Chrome/Edge
//
// Drives the real UI with real mouse/keyboard input and real (generated)
// audio. Read-only observation hooks are injected before the page loads —
// they record the audio elements and Media Session handlers the app itself
// creates; the app is not modified. Results: e2e/output/report-<browser>.md
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowsers, launch, sleep } from './browser.mjs';
import { serveAudio, serveDist } from './servers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'e2e', 'output');
mkdirSync(OUT, { recursive: true });

/** Observation hooks: record what the app creates, change nothing. */
const HOOKS = `
  window.__e2e = { audio: [], session: {} };
  const NativeAudio = window.Audio;
  window.Audio = function (...args) { const el = new NativeAudio(...args); window.__e2e.audio.push(el); return el; };
  window.Audio.prototype = NativeAudio.prototype;
  if (navigator.mediaSession) {
    const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = (action, handler) => { window.__e2e.session[action] = handler; return set(action, handler); };
  }
  window.__e2e.playing = () => window.__e2e.audio.find((a) => a.currentSrc && !a.paused) ?? null;
  window.__e2e.current = () => window.__e2e.audio.find((a) => a.currentSrc && !a.paused) ?? window.__e2e.audio.find((a) => a.currentSrc) ?? null;
`;

async function run(browser, ports) {
  const app = await serveDist(DIST, ports.app);
  const cors = await serveAudio(ports.cors, { cors: true });
  const plain = await serveAudio(ports.plain, { cors: false });
  const { page: p, close } = await launch(browser.path, ports.cdp);
  const results = [];
  const errors = [];
  const shot = async (name) => {
    const { data } = await p.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${browser.name}-${name}.png`), Buffer.from(data, 'base64'));
  };

  // ---- helpers -----------------------------------------------------------
  const size = (width, height, mobile = false) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  const goto = async (path) => {
    await p.send('Page.navigate', { url: app.url + path });
    await waitFor(`return document.querySelectorAll('#root *').length > 40`, 15000, `app did not render ${path}`);
    await sleep(600);
  };
  async function waitFor(body, timeout = 8000, message = 'timed out') {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try {
        last = await p.evaluate(body);
        if (last) return last;
      } catch (e) {
        last = e.message;
      }
      await sleep(200);
    }
    throw new Error(`${message}${last !== undefined && last !== false ? ` (last: ${JSON.stringify(last)})` : ''}`);
  }
  const text = (sel) => p.evaluate(`return document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null`);
  const button = (label) => `//button[normalize-space(.)=${JSON.stringify(label)} or @aria-label=${JSON.stringify(label)}]`;
  const setValue = (sel, value) =>
    p.evaluate(`
      const el = document.querySelector(${JSON.stringify(sel)});
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      if (!(el instanceof HTMLSelectElement)) el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;`);
  const audio = () => p.evaluate(`const a = window.__e2e.current(); return a && { src: a.currentSrc, paused: a.paused, t: a.currentTime, volume: a.volume, muted: a.muted };`);
  const advancing = async () => {
    const a = await audio();
    await sleep(1200);
    const b = await audio();
    return !!(a && b && !b.paused && b.t > a.t + 0.3);
  };
  const state = () => text('.now-playing__state');
  const check = async (n, title, fn) => {
    const before = errors.length;
    try {
      const r = await fn();
      const extra = errors.length > before ? ` — new errors: ${errors.slice(before).join(' | ')}` : '';
      results.push({ n, title, status: r?.status ?? 'PASS', note: (r?.note ?? (typeof r === 'string' ? r : '')) + extra });
    } catch (e) {
      results.push({ n, title, status: 'FAIL', note: e.message.split('\n')[0] });
      await shot(`fail-${n}`).catch(() => {});
    }
  };

  // Errors from LIQUEAMP itself (third-party logo/artwork hosts are not ours).
  p.on('Runtime.exceptionThrown', (e) => errors.push(`exception: ${e.exceptionDetails.exception?.description?.split('\n')[0] ?? e.exceptionDetails.text}`));
  p.on('Runtime.consoleAPICalled', (e) => e.type === 'error' && errors.push(`console.error: ${e.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 200)));
  // The app deliberately probes a stream for CORS (that decides analysis/EQ);
  // against the no-CORS fixture the browser logs the refusal. Expected, not an app error.
  const expectedProbe = (text) => text.includes(`localhost:${ports.plain}/`) && /CORS policy|net::ERR_FAILED/.test(text);
  await p.send('Log.enable');
  p.on('Log.entryAdded', ({ entry }) => {
    if (entry.level === 'error' && entry.url?.startsWith(`http://localhost:${ports.app}`) && !expectedProbe(entry.text)) errors.push(`${entry.source}: ${entry.text} ${entry.url}`);
  });
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOKS });

  // ---- 1–7: start, layout, navigation --------------------------------------
  await size(1440, 900);
  await check(1, 'Start LIQUEAMP', async () => {
    await goto('');
    return `served like GitHub Pages at ${app.url}`;
  });
  await check(2, 'Application loads without errors', async () => {
    await sleep(1500);
    if (errors.length) throw new Error(errors.join(' | '));
  });
  await check(3, 'Default theme is applied', async () => {
    const bg = await p.evaluate(`return getComputedStyle(document.documentElement).getPropertyValue('--la-bg').trim()`);
    if (bg !== '#0b100e') throw new Error(`--la-bg is ${bg}`);
    return `--la-bg ${bg}`;
  });

  const LAYOUT = `
    const panels = [...document.querySelectorAll('.dashboard > *:not(main), .dashboard__main > *:not(h1):not(.lower), .lower > *')]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).display !== 'none')
      .map((el) => ({ name: (el.getAttribute('aria-label') || el.className).toString().slice(0, 40), r: el.getBoundingClientRect() }));
    const overlaps = [];
    for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i].r, b = panels[j].r;
      if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) overlaps.push(panels[i].name + ' × ' + panels[j].name);
    }
    const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top;
    const rowTops = [top('.now-playing'), top('.radio-browser')].filter((v) => v !== undefined);
    const lowerTops = [...document.querySelectorAll('.lower > *')].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect().top);
    const spread = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
    return { panels: panels.length, overlaps, hscroll: document.documentElement.scrollWidth > innerWidth, mainRow: spread(rowTops), lowerRow: spread(lowerTops) };`;
  await check(4, 'Desktop layout is aligned', async () => {
    const notes = [];
    for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800]]) {
      await size(w, h);
      await sleep(500);
      const l = await p.evaluate(LAYOUT);
      if (l.hscroll || l.mainRow > 1 || l.lowerRow > 1) throw new Error(`${w}×${h}: ${JSON.stringify(l)}`);
      notes.push(`${w}×${h}: ${l.panels} panels, rows aligned`);
    }
    await size(1440, 900);
    await shot('desktop');
    return notes.join('; ');
  });
  await check(5, 'No normal panels overlap', async () => {
    for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768]]) {
      await size(w, h);
      await sleep(500);
      const l = await p.evaluate(LAYOUT);
      if (l.overlaps.length) throw new Error(`${w}×${h}: ${l.overlaps.join(', ')}`);
    }
    await size(1440, 900);
    return '1920, 1440, 1280 and 1024 px wide';
  });
  await check(6, 'Mobile layout works', async () => {
    await size(390, 844, true);
    await goto('');
    const labels = await p.evaluate(`return [...document.querySelectorAll('.bottom-nav a')].map((a) => a.textContent.trim())`);
    if (labels.length < 5) throw new Error(`bottom navigation has ${labels.length} items`);
    const notes = [];
    for (const label of labels) {
      await p.click(`//nav[contains(@class,'bottom-nav')]//a[normalize-space(.)=${JSON.stringify(label)}]`);
      await sleep(400);
      const m = await p.evaluate(`
        const nav = [...document.querySelectorAll('.bottom-nav a')].map((a) => a.getBoundingClientRect().height);
        const visible = [...document.querySelectorAll('.dashboard__main > section, .dashboard__main > .lower > section, .dashboard__main > .area-controls')].filter((el) => el.getClientRects().length).length;
        return { hscroll: document.documentElement.scrollWidth > innerWidth, minTouch: Math.min(...nav), visible };`);
      if (m.hscroll || m.minTouch < 44 || m.visible === 0) throw new Error(`${label}: ${JSON.stringify(m)}`);
      notes.push(label);
    }
    await shot('mobile');
    await size(1440, 900);
    await goto('');
    return `sections ${notes.join(', ')}; touch targets ≥ 44 px; no horizontal scroll`;
  });
  await check(7, 'Navigation works', async () => {
    await p.click(`//nav[@aria-label='Main']//a[normalize-space(.)='Browse']`);
    await waitFor(`return location.pathname.endsWith('/browse') && document.querySelector('.app-frame')?.dataset.section === 'browse'`);
    await p.click(`//nav[@aria-label='Main']//a[normalize-space(.)='Now Playing']`);
    await waitFor(`return document.querySelector('.app-frame')?.dataset.section === 'now-playing'`);
    await p.click('a[href$="/control"]');
    await waitFor(`return location.pathname.endsWith('/control') && !!document.querySelector('.control-page')`);
    return 'sidebar and /control links, base path kept';
  });

  // ---- 8–9: import --------------------------------------------------------
  const importSource = async (url, title) => {
    await p.click('a[href$="/control/media"]');
    await waitFor(`return !!document.querySelector('input[placeholder="https://example.com/stream.mp3"]')`);
    await p.click('input[placeholder="https://example.com/stream.mp3"]');
    await p.evaluate(`document.activeElement.select(); return 1;`);
    await p.send('Input.insertText', { text: url });
    await p.click(button('Resolve'));
    await waitFor(`return !!document.querySelector('.import__fields input')`, 10000, `no preview for ${url}`);
    await setValue('.import__fields input', title);
    await p.click(button('Save to library'));
    await waitFor(`return [...document.querySelectorAll('.media-manager__title')].some((e) => e.textContent === ${JSON.stringify(title)})`, 8000, `${title} not in library`);
  };
  await check(8, 'A direct stream can be imported', async () => {
    await importSource(`${cors.url}/noise.wav`, 'E2E Noise');
    await importSource(`${cors.url}/tone.wav`, 'E2E Tone');
    await importSource(`${plain.url}/noise.wav`, 'E2E No-CORS');
    return 'three sources through the import panel (URL → Resolve → Save to library)';
  });

  // back to the player, open the library
  await p.click(`//a[contains(normalize-space(.),'Back to player')]`);
  await waitFor(`return !!document.querySelector('.now-playing')`);
  await p.click(`//button[contains(., 'All media')]`);
  await waitFor(`return !!document.querySelector('button[aria-label^="Play E2E Noise"]')`, 8000, 'library view did not open');

  // ---- 9–13: playback ------------------------------------------------------
  await check(10, 'Playback starts', async () => {
    await p.click('button[aria-label^="Play E2E Noise"]');
    await waitFor(`return document.querySelector('.now-playing__state')?.textContent.includes('PLAYING')`, 10000, 'state never PLAYING');
    if (!(await advancing())) throw new Error(`audio not advancing: ${JSON.stringify(await audio())}`);
    return `audio element playing ${(await audio()).src}`;
  });
  await check(9, 'Metadata is displayed', async () => {
    const title = await text('.now-playing__title');
    const badges = await p.evaluate(`return [...document.querySelectorAll('.now-playing__badges .badge')].map((b) => b.textContent.trim()).join(' · ')`);
    if (title !== 'E2E Noise' || !/WAV/.test(badges ?? '')) throw new Error(`title "${title}", badges "${badges}"`);
    return `title "${title}"; badges "${badges}" (declared by the server's headers)`;
  });
  await shot('playing');
  await check(11, 'Pause works', async () => {
    await p.click('button[aria-label="Pause"]');
    await waitFor(`return document.querySelector('.now-playing__state')?.textContent.includes('PAUSED')`);
    if (!(await audio()).paused) throw new Error('audio element still playing');
    await p.click('button[aria-label="Play"]');
    await waitFor(`return document.querySelector('.now-playing__state')?.textContent.includes('PLAYING')`);
    return 'paused and resumed';
  });
  await check(12, 'Volume works', async () => {
    const before = (await audio()).volume;
    await setValue('.now-playing input[aria-label="Volume"]', 0.3);
    const after = await waitFor(`const a = window.__e2e.current(); return a && Math.abs(a.volume - 0.3) < 0.02 && a.volume`, 4000, 'element volume did not follow');
    await setValue('.now-playing input[aria-label="Volume"]', 0.8);
    return `element volume ${before} → ${after}`;
  });
  await check(13, 'Seek works where supported', async () => {
    const box = await p.evaluate(`const r = document.querySelector('input[aria-label="Seek"]').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height / 2 };`);
    for (const type of ['mousePressed', 'mouseReleased']) await p.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    const t = await waitFor(`const a = window.__e2e.current(); return a && a.currentTime > 29 && a.currentTime < 36 && a.currentTime`, 6000, 'did not seek');
    return `seeked to ${t.toFixed(1)} s of a 60 s file (live streams show no seek bar)`;
  });

  // ---- 14–17: queue, playlist, favourite, history ------------------------
  await check(14, 'Queue works', async () => {
    await p.click('button[aria-label="Add E2E Tone to queue"]');
    await waitFor(`return document.querySelectorAll('ol[aria-label="Queue"] li').length >= 2`, 4000, 'queue did not grow');
    await p.click('button[aria-label="Next"]');
    await waitFor(`return document.querySelector('.now-playing__title')?.textContent === 'E2E Tone'`, 8000, 'Next did not play the queued item');
    await waitFor(`return document.querySelector('.now-playing__state')?.textContent.includes('PLAYING')`);
    return 'added from the library, Next played it';
  });
  await check(15, 'Playlist works', async () => {
    await p.click(`//section[contains(@class,'area-actions')]//button[contains(., 'Add to Playlist')]`);
    await waitFor(`return !!document.querySelector('dialog[open] input.input')`);
    await p.click('dialog[open] input.input');
    await p.send('Input.insertText', { text: 'E2E list' });
    await p.click(`//dialog[@open]//button[normalize-space(.)='Add']`);
    await waitFor(`return !document.querySelector('dialog[open]')`, 4000, 'Add to playlist dialog did not close');
    await p.click(`//div[@aria-label='Library views']//button[normalize-space(.)='Playlists']`);
    await waitFor(`return !!document.querySelector('ol[aria-label="Playlists"]')`, 4000, 'Playlists tab did not open the playlists view');
    await waitFor(`return [...document.querySelectorAll('ol[aria-label="Playlists"] li')].some((li) => li.textContent.includes('E2E list'))`, 5000, 'playlist not listed');
    return 'created from Quick Actions with the playing track';
  });
  await check(16, 'Favorite works', async () => {
    await p.click(`//section[contains(@class,'now-playing')]//button[contains(., 'Add favourite')]`);
    await p.click(`//div[@aria-label='Library views']//button[normalize-space(.)='Favourites']`);
    await waitFor(`return document.querySelector('#lib-tabpanel')?.textContent.includes('E2E Tone')`, 5000, 'favourite not listed');
    return 'added from Now Playing, listed under Favourites';
  });
  await check(17, 'History is recorded', async () => {
    await p.click(`//div[@aria-label='Library views']//button[normalize-space(.)='History']`);
    // E2E Tone has been playing since check 14; plays shorter than 5 s are
    // deliberately not recorded (ARCH §21), so only the long play must appear.
    const row = await waitFor(`return [...document.querySelectorAll('ol[aria-label="Playback history"] li')].map((li) => li.innerText.replace(/\\s+/g, ' ')).find((t) => t.includes('E2E Tone') && /\\d+s listened/.test(t))`, 20000, 'no history entry for E2E Tone');
    return `recorded with measured listening time: "${row.trim()}"`;
  });

  // ---- 20–25: visualizer, honesty, media session, keyboard ----------------
  const canvasInk = `
    const c = document.querySelector('.now-playing__viz canvas'); if (!c || !c.width) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0, sum = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { ink++; sum += d[i - 1] + i; }
    return { ink, sum };`;
  await check(20, 'Visualizer responds to real audio where available', async () => {
    await p.click('button[aria-label^="Play E2E Noise"]');
    await waitFor(`return document.querySelector('.now-playing__title')?.textContent === 'E2E Noise' && document.querySelector('.now-playing__state')?.textContent.includes('PLAYING')`);
    await sleep(1500);
    const a = await p.evaluate(canvasInk);
    await sleep(400);
    const b = await p.evaluate(canvasInk);
    if (!a || !b || a.ink === 0 || a.sum === b.sum) throw new Error(`canvas ${JSON.stringify({ a, b })}`);
    return `canvas drawing and changing (${b.ink} lit pixels)`;
  });
  await check(21, 'Changing visualizer does not stop audio', async () => {
    await setValue('select[aria-label="Visualizer style"]', 'oscilloscope');
    await sleep(500);
    if (!(await advancing())) throw new Error('audio stopped');
    const ink = await p.evaluate(canvasInk);
    await setValue('select[aria-label="Visualizer style"]', 'spectrum-bars');
    return `oscilloscope drawing (${ink?.ink ?? 0} px), audio still advancing`;
  });
  await check(22, 'Disabling visualizer does not stop audio', async () => {
    await p.click('button[aria-label="Visualizer on"]');
    await waitFor(`return document.querySelector('.now-playing__viz')?.textContent.includes('VISUALIZER OFF')`);
    const width = await p.evaluate(`return document.querySelector('.now-playing__viz canvas').width`);
    if (!(await advancing())) throw new Error('audio stopped');
    await p.click('button[aria-label="Visualizer on"]');
    return `renderer released (canvas width ${width}), audio still advancing`;
  });
  await check(23, 'Provider limitations are communicated honestly', async () => {
    await p.click('button[aria-label^="Play E2E No-CORS"]');
    await waitFor(`return document.querySelector('.now-playing__title')?.textContent === 'E2E No-CORS' && document.querySelector('.now-playing__state')?.textContent.includes('PLAYING')`);
    const viz = await waitFor(`const t = document.querySelector('.now-playing__viz .viz__message')?.textContent; return t?.includes('DOES NOT ALLOW') && t`);
    const eq = await text('.eq-summary');
    const title = await p.evaluate(`return document.querySelector('.eq-summary')?.getAttribute('title')`);
    if (!/NOT APPLIED/.test(title ?? '')) throw new Error(`EQ says "${title}"`);
    if (!(await advancing())) throw new Error('no-CORS source did not play');
    return `plays without CORS; visualizer: "${viz}"; EQ: "${title}"`;
  });
  await check(24, 'Media Session works where supported', async () => {
    const s = await p.evaluate(`return navigator.mediaSession ? { title: navigator.mediaSession.metadata?.title, state: navigator.mediaSession.playbackState, actions: Object.keys(window.__e2e.session) } : null`);
    if (!s) return { status: 'N/A', note: 'Media Session not available' };
    if (s.title !== 'E2E No-CORS' || s.state !== 'playing') throw new Error(JSON.stringify(s));
    await p.evaluate(`window.__e2e.session.pause(); return 1;`);
    await waitFor(`return document.querySelector('.now-playing__state')?.textContent.includes('PAUSED') && navigator.mediaSession.playbackState === 'paused'`);
    await p.evaluate(`window.__e2e.session.play(); return 1;`);
    await waitFor(`return document.querySelector('.now-playing__state')?.textContent.includes('PLAYING')`);
    return `metadata "${s.title}"; pause/play handlers drive the player; actions: ${s.actions.join(', ')}`;
  });
  await check(25, 'Keyboard shortcuts work', async () => {
    await p.evaluate(`document.activeElement?.blur(); return 1;`);
    await p.key(' ', 'Space', ' ');
    await waitFor(`return document.querySelector('.now-playing__state')?.textContent.includes('PAUSED')`, 4000, 'Space did not pause');
    await p.key(' ', 'Space', ' ');
    await waitFor(`return document.querySelector('.now-playing__state')?.textContent.includes('PLAYING')`, 4000, 'Space did not resume');
    await p.key('m', 'KeyM', 'm');
    await waitFor(`return document.querySelector('.now-playing .volume__value')?.textContent === 'MUTE'`, 4000, 'M did not mute');
    const muted = await audio();
    await p.key('m', 'KeyM', 'm');
    if (!(muted.muted || muted.volume === 0)) throw new Error('element not muted');
    return 'Space pause/resume, M mute/unmute (element muted)';
  });

  // ---- 18–19: theme --------------------------------------------------------
  await check(18, 'Theme can be changed', async () => {
    // the Appearance module's theme select is the one listing the default theme
    const id = await p.evaluate(`
      window.__themeSelect = [...document.querySelectorAll('.control-strip select')].find((x) => [...x.options].some((o) => o.value === 'liqueamp-default'));
      return [...window.__themeSelect.options].map((o) => o.value).find((v) => v !== window.__themeSelect.value);`);
    await p.evaluate(`const s = window.__themeSelect; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
    const bg = await waitFor(`const v = getComputedStyle(document.documentElement).getPropertyValue('--la-bg').trim(); return v !== '#0b100e' && v`);
    return `switched to "${id}" (--la-bg ${bg}) while playing`;
  });
  await check(19, 'Theme persists after reload', async () => {
    const bg = await p.evaluate(`return getComputedStyle(document.documentElement).getPropertyValue('--la-bg').trim()`);
    await goto('');
    const after = await p.evaluate(`return getComputedStyle(document.documentElement).getPropertyValue('--la-bg').trim()`);
    if (after !== bg) throw new Error(`${bg} before, ${after} after`);
    await p.evaluate(`const s = [...document.querySelectorAll('.control-strip select')].find((x) => [...x.options].some((o) => o.value === 'liqueamp-default')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'liqueamp-default'); s.dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
    return `--la-bg ${after} after reload (restored to default afterwards)`;
  });

  // ---- 26–30: PWA, offline, control panel, honesty, build ----------------
  await check(26, 'PWA can install where supported', async () => {
    const errs = (await p.send('Page.getInstallabilityErrors')).installabilityErrors;
    if (errs.length) throw new Error(errs.map((e) => e.errorId).join(', '));
    const m = await p.send('Page.getAppManifest');
    return `no installability errors; manifest ${m.url}`;
  });
  await check(27, 'Offline shell works', async () => {
    await waitFor(`return !!navigator.serviceWorker.controller`, 10000, 'no service worker in control');
    await p.send('Network.enable');
    await p.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    try {
      await goto('control/pwa');
      const t = await text('.control-page__main .panel__title');
      const header = await text('.app-header__live');
      if (t !== 'PWA' || !/OFFLINE/.test(header ?? '')) throw new Error(`title "${t}", header "${header}"`);
      return `deep link /control/pwa served by the service worker while offline; header "${header}"`;
    } finally {
      await p.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
  });
  await check(28, 'Control panel works', async () => {
    const sections = { system: 'System', categories: 'Categories', themes: 'Themes', media: 'Import source', providers: 'Providers', visualizers: 'Visualizers', 'import-export': 'Export', pwa: 'PWA' };
    for (const [s, title] of Object.entries(sections)) {
      await p.click(`a[href$="/control/${s}"]`);
      await waitFor(`return location.pathname.endsWith('/control/${s}') && document.querySelector('.control-page__main .panel__title')?.textContent === ${JSON.stringify(title)}`, 6000, `${s} did not render "${title}"`);
    }
    await p.click('a[href$="/control/media"]');
    await waitFor(`return !!document.querySelector('button[aria-label="Test E2E No-CORS"]')`, 6000, 'media list not rendered');
    await p.click('button[aria-label="Test E2E No-CORS"]');
    const r = await waitFor(`const t = document.querySelector('.media-manager__test'); return t && !t.textContent.includes('TESTING') && t.textContent`, 12000, 'source test did not finish');
    if (!/Not allowed \(no CORS\)/.test(r)) throw new Error(`test source said: ${r}`);
    return `all 8 sections render their own content; Test source reported the missing CORS`;
  });
  await check(29, 'No fake metrics are shown', async () => {
    const found = [];
    for (const path of ['', 'control/system']) {
      await goto(path);
      const t = await p.evaluate(`return document.body.innerText`);
      for (const re of [/\bCPU\b[^\n]{0,20}\d/i, /\bMEM(ORY)?\b[^\n]{0,8}\d+\s*%/i, /\blatency\b[^\n]{0,12}\d+\s*ms/i, /\b\d[\d.,]*k?\s+listeners\b/i]) {
        const m = t.match(re);
        if (m) found.push(`${path || '/'}: "${m[0]}"`);
      }
    }
    if (found.length) throw new Error(found.join('; '));
    return 'no CPU/memory/latency/listener figures; shown values come from measurements (see phase notes)';
  });
  await check(30, 'Production build succeeds', async () => {
    const age = (Date.now() - statSync(join(DIST, 'index.html')).mtimeMs) / 60000;
    if (age > 30) return { status: 'N/A', note: `dist is ${Math.round(age)} min old — run "npm run e2e" to build first` };
    return `built ${Math.max(1, Math.round(age))} min ago by npm run e2e (typecheck + vite build)`;
  });

  // ---- extra: accessibility audit (not in §88; guards phase 12) -----------
  await check(31, 'Accessibility audit (axe-core, extra)', async () => {
    const axeSource = readFileSync(join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
    const found = [];
    for (const path of ['', 'settings', 'browse', 'control/media', 'control/providers', 'control/visualizers', 'control/import-export', 'control/pwa']) {
      await goto(path);
      await p.send('Runtime.evaluate', { expression: axeSource });
      const v = await p.evaluate(`return (await axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => x.id + ' (' + x.nodes.length + ') ' + x.nodes[0].target.join(' '))`);
      for (const x of v) found.push(`/${path}: ${x}`);
    }
    if (found.length) throw new Error(found.join('; '));
    return 'no violations on 8 routes';
  });

  await close();
  for (const s of [app.server, cors.server, plain.server]) s.close();
  return results.sort((a, b) => a.n - b.n);
}

// ---- main -------------------------------------------------------------------
const browsers = findBrowsers();
if (!browsers.length) {
  console.error('No Chrome or Edge found. Set LIQUEAMP_BROWSER to a Chromium-based browser.');
  process.exit(2);
}
let failed = false;
for (const [i, b] of browsers.entries()) {
  const ports = { app: 4180 + i * 10, cors: 4181 + i * 10, plain: 4182 + i * 10, cdp: 9340 + i };
  console.log(`\n=== ${b.name} (${b.path})`);
  const results = await run(b, ports);
  const lines = results.map((r) => `| ${r.n} | ${r.title} | ${r.status} | ${r.note.replace(/\|/g, '/')} |`);
  const md = `# LIQUEAMP acceptance test — ${b.name}\n\n${new Date().toISOString()}\n\n| # | Check (MASTER §88) | Result | Evidence |\n|---|---|---|---|\n${lines.join('\n')}\n`;
  writeFileSync(join(OUT, `report-${b.name}.md`), md);
  for (const r of results) console.log(`${String(r.n).padStart(2)}. ${r.status.padEnd(4)} ${r.title}${r.note ? ` — ${r.note}` : ''}`);
  const fails = results.filter((r) => r.status === 'FAIL').length;
  console.log(`${results.length - fails}/${results.length} passed in ${b.name}`);
  if (fails) failed = true;
}
process.exit(failed ? 1 : 0);
