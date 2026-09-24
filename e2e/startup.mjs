// First-paint timing: cold start, warm start (service worker + caches) and a
// throttled mid-range phone profile. Measurement only (phase 15).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowsers, launch, sleep } from './browser.mjs';
import { serveDist } from './servers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = await serveDist(join(ROOT, 'dist'), 4230);
const paint = (p) =>
  p.evaluate(`
    await new Promise((r) => setTimeout(r, 300));
    const fcp = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime;
    const nav = performance.getEntriesByType('navigation')[0];
    return { fcp: Math.round(fcp), dcl: Math.round(nav.domContentLoadedEventEnd), transfer: Math.round(performance.getEntriesByType('resource').reduce((s, r) => s + r.transferSize, nav.transferSize) / 1024) };`);

async function profile(name, { cpu = 1, network = null, mobile = false } = {}) {
  const { page: p, close } = await launch(findBrowsers()[0].path, 9390 + Math.floor(Math.random() * 50));
  await p.send('Emulation.setDeviceMetricsOverride', mobile ? { width: 390, height: 844, deviceScaleFactor: 3, mobile: true } : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await p.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await p.send('Network.enable');
  if (network) await p.send('Network.emulateNetworkConditions', { offline: false, ...network });
  await p.send('Page.navigate', { url: app.url });
  await sleep(6000 * cpu);
  const cold = await paint(p);
  await p.send('Page.navigate', { url: app.url });
  await sleep(4000 * cpu);
  const warm = await paint(p);
  console.log(`${name.padEnd(34)} cold FCP ${String(cold.fcp).padStart(5)} ms (${cold.transfer} kB)   warm FCP ${String(warm.fcp).padStart(5)} ms (${warm.transfer} kB over network)`);
  await close();
}
await profile('desktop, no throttling');
await profile('phone: 4× CPU, 4G (9 Mbit/s, 170 ms)', { cpu: 4, mobile: true, network: { latency: 170, downloadThroughput: (9e6 / 8), uploadThroughput: (9e6 / 8) } });
app.server.close();
process.exit(0);
