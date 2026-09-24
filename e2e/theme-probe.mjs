// Renders the dashboard and /control/themes in every built-in theme and runs
// axe-core on each (analysis aid for the Base16 theme model, 2026-09-24).
//   node e2e/theme-probe.mjs [outDir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowsers, launch, sleep } from './browser.mjs';
import { serveDist } from './servers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ?? join(ROOT, 'e2e', 'out', 'themes');
mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync(join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const app = await serveDist(join(ROOT, 'dist'), 4230);
const { page: p, close } = await launch(findBrowsers()[0].path, 9390);
await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await p.send('Page.navigate', { url: app.url });
await sleep(4000);
await p.send('Runtime.evaluate', { expression: axeSource });

const ids = await p.evaluate(`return [...document.querySelectorAll('.area-appearance select option')].map((o) => o.value)`);
const shots = new Set(process.env.SHOTS ? process.env.SHOTS.split(',') : ['liqueamp-default', 'base16-nord', 'base16-catppuccin-latte', 'base16-solarized-light']);
let bad = 0;
for (const id of ids) {
  await p.evaluate(`const s = document.querySelector('.area-appearance select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
  await sleep(300);
  const v = await p.evaluate(`return (await axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => x.id + ' (' + x.nodes.length + ') ' + x.nodes[0].target.join(' ') + ' ' + (x.nodes[0].any[0]?.message ?? ''))`);
  if (v.length) bad++;
  console.log(`${id.padEnd(32)} ${v.length ? 'VIOLATIONS\n    ' + v.join('\n    ') : 'ok'}`);
  if (shots.has(id)) {
    const { data } = await p.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${id}.png`), Buffer.from(data, 'base64'));
  }
}
await p.send('Page.navigate', { url: app.url + 'control/themes' });
await sleep(1500);
const { data } = await p.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(join(OUT, 'control-themes.png'), Buffer.from(data, 'base64'));
console.log(`${ids.length} themes, ${bad} with violations`);
await close();
app.server.close();
process.exit(0);
