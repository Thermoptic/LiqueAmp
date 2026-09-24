// Performance measurements of the production build (phase 15). Reports
// measured numbers only; nothing is tuned here.
//
//   npm run build && node e2e/perf.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowsers, launch, sleep } from './browser.mjs';
import { serveAudio, serveDist } from './servers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = findBrowsers()[0];
const app = await serveDist(join(ROOT, 'dist'), 4200);
const audio = await serveAudio(4201, { cors: true });
const { page: p, close } = await launch(browser.path, 9360);
await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await p.send('Performance.enable');
await p.send('Network.enable');
let bytes = 0;
p.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));

const metrics = async () => Object.fromEntries((await p.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

// ---- 1. load (cold, no service worker yet) ----------------------------------
await p.send('Page.navigate', { url: app.url });
await sleep(4000);
const load = await p.evaluate(`
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]));
  const lcp = await new Promise((res) => { let v = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => res(v), 300); });
  return { domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, fcp: paint['first-contentful-paint'], lcp, domNodes: document.getElementsByTagName('*').length };`);
const m0 = await metrics();
console.log('LOAD (cold, localhost, no throttling)');
console.log(`  DOMContentLoaded ${round(load.domContentLoaded)} ms · load ${round(load.load)} ms · FCP ${round(load.fcp)} ms · LCP ${round(load.lcp)} ms`);
console.log(`  transferred ${round(bytes / 1024)} kB (compression depends on the host) · ${load.domNodes} DOM elements`);
console.log(`  script ${round(m0.ScriptDuration * 1000)} ms · layout ${round(m0.LayoutDuration * 1000)} ms · style ${round(m0.RecalcStyleDuration * 1000)} ms · JS heap ${round(m0.JSHeapUsedSize / 1048576)} MB`);

// ---- 2. steady state while playing with the visualizer ----------------------
// play a CORS source straight through the import panel's "Play without saving"
await p.send('Page.navigate', { url: `${app.url}control/media` });
await sleep(2500);
await p.evaluate(`document.querySelector('input[placeholder="https://example.com/stream.mp3"]').focus(); return 1;`);
await p.send('Input.insertText', { text: `${audio.url}/noise.wav` });
await p.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Resolve').click(); return 1;`);
await sleep(1500);
await p.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Play without saving').click(); return 1;`);
await sleep(1000);
await p.evaluate(`[...document.querySelectorAll('a')].find((a) => a.textContent.includes('Back to player')).click(); return 1;`);
await sleep(3000);
const playing = await p.evaluate(`return document.querySelector('.now-playing__state')?.textContent`);

async function window10s(label) {
  await p.evaluate(`
    window.__mut = new Map();
    window.__obs?.disconnect();
    window.__obs = new MutationObserver((list) => { for (const m of list) { const el = m.target.nodeType === 1 ? m.target : m.target.parentElement; const panel = el?.closest('section, footer, header')?.getAttribute('aria-label') ?? el?.closest('section, footer, header')?.className ?? '(other)'; window.__mut.set(panel, (window.__mut.get(panel) ?? 0) + 1); } });
    window.__obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    return 1;`);
  const a = await metrics();
  await sleep(10000);
  const b = await metrics();
  const mutations = await p.evaluate(`window.__obs.disconnect(); return [...window.__mut].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => k + ': ' + (v / 10).toFixed(1) + '/s');`);
  const per = (k, scale = 1000) => round(((b[k] - a[k]) * scale) / 10, 1);
  console.log(label);
  console.log(`  per second: script ${per('ScriptDuration')} ms · layout ${per('LayoutDuration')} ms (${per('LayoutCount', 1)} layouts) · style ${per('RecalcStyleDuration')} ms (${per('RecalcStyleCount', 1)} recalcs) · task ${per('TaskDuration')} ms`);
  console.log(`  DOM mutations by region: ${mutations.join(' · ') || 'none'}`);
  return b;
}
console.log(`\nPLAYBACK (${playing})`);
const heapStart = (await metrics()).JSHeapUsedSize;
await window10s('  with spectrum visualizer');
await p.evaluate(`[...document.querySelectorAll('button[aria-label="Visualizer on"]')][0]?.click(); return 1;`);
await sleep(1500);
await window10s('  visualizer off');
await p.evaluate(`[...document.querySelectorAll('button[aria-label="Visualizer on"]')][0]?.click(); return 1;`);

// ---- 3. memory over a longer run -------------------------------------------
await sleep(40000);
await p.send('HeapProfiler.enable');
await p.send('HeapProfiler.collectGarbage');
const heapEnd = (await metrics()).JSHeapUsedSize;
const nodesEnd = (await metrics()).Nodes;
console.log(`\nMEMORY after ~65 s of playback with visualizer: JS heap ${round(heapStart / 1048576)} → ${round(heapEnd / 1048576)} MB (after GC) · DOM nodes ${nodesEnd}`);

await close();
app.server.close();
audio.server.close();
process.exit(0);
