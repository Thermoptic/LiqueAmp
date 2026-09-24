// Isolates what makes a full layout of the dashboard expensive: times a
// forced full relayout, then repeats it with one CSS suspect neutralised at a
// time. Analysis aid only (phase 15).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowsers, launch, sleep } from './browser.mjs';
import { serveDist } from './servers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = await serveDist(join(ROOT, 'dist'), 4220);
const { page: p, close } = await launch(findBrowsers()[0].path, 9380);
await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await p.send('Page.navigate', { url: app.url });
await sleep(5000);

const VARIANTS = {
  baseline: '',
  'system font': '* { font-family: monospace !important; }',
  'rows auto': '.dashboard { grid-template-rows: auto !important; } .dashboard { height: auto !important; }',
  'no contain': '* { contain: none !important; }',
  'no shadows': '* { box-shadow: none !important; text-shadow: none !important; }',
  'no radio list': '.radio-browser__list { display: none !important; }',
  'no station icons': '.station-row img, .station-icon img { display: none !important; }',
  'no settings modules': '.control-module { display: none !important; }',
  'no lower panels': '.lower { display: none !important; }',
};

const results = {};
for (const [name, css] of Object.entries(VARIANTS)) {
  results[name] = await p.evaluate(`
    let s = document.getElementById('__probe'); if (!s) { s = document.createElement('style'); s.id = '__probe'; document.head.appendChild(s); }
    s.textContent = ${JSON.stringify(css)};
    document.body.offsetHeight;
    const times = [];
    for (let i = 0; i < 9; i++) {
      // invalidate layout for the whole tree without changing its geometry much
      document.documentElement.style.setProperty('width', i % 2 ? '100%' : 'calc(100% - 0.5px)');
      const t = performance.now();
      document.body.offsetHeight;
      times.push(performance.now() - t);
    }
    document.documentElement.style.removeProperty('width');
    times.sort((a, b) => a - b);
    return { median: Math.round(times[4] * 10) / 10, objects: document.getElementsByTagName('*').length };`);
}
for (const [name, r] of Object.entries(results)) console.log(`${name.padEnd(18)} ${String(r.median).padStart(6)} ms   (${r.objects} elements)`);
await close();
app.server.close();
process.exit(0);
