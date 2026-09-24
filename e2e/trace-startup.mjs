// Records a DevTools trace of a cold start and summarises layout work:
// how many layouts, how long, and what forced them (analysis aid, phase 15).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowsers, launch, sleep } from './browser.mjs';
import { serveDist } from './servers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = await serveDist(join(ROOT, 'dist'), 4210);
const { page: p, close } = await launch(findBrowsers()[0].path, 9370);
await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const events = [];
p.on('Tracing.dataCollected', (e) => events.push(...e.value));
const done = new Promise((res) => p.on('Tracing.tracingComplete', res));
await p.send('Tracing.start', {
  transferMode: 'ReportEvents',
  traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'blink.user_timing', 'loading'] },
});
await p.send('Page.navigate', { url: app.url });
await sleep(5000);
await p.send('Tracing.end');
await done;

const start = events.find((e) => e.name === 'navigationStart' || e.name === 'TracingStartedInBrowser')?.ts ?? events[0].ts;
const ms = (us) => Math.round(us / 100) / 10;
const layouts = events.filter((e) => e.name === 'Layout' && e.ph === 'X');
const styles = events.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
const fonts = events.filter((e) => /Font/.test(e.name));
console.log(`layouts: ${layouts.length}, total ${ms(layouts.reduce((s, e) => s + e.dur, 0))} ms; style recalcs: ${styles.length}, total ${ms(styles.reduce((s, e) => s + e.dur, 0))} ms`);
for (const e of layouts.sort((a, b) => b.dur - a.dur).slice(0, 8)) {
  const d = e.args?.beginData ?? {};
  const stack = (d.stackTrace ?? e.args?.data?.stackTrace ?? []).slice(0, 3).map((f) => `${f.functionName || '(anon)'}@${(f.url || '').split('/').pop()}:${f.lineNumber}`).join(' < ');
  console.log(`  +${ms(e.ts - start)} ms  ${ms(e.dur)} ms  dirty ${d.dirtyObjects ?? '?'}/${d.totalObjects ?? '?'} objects  ${d.partialLayout ? 'partial' : 'full'}  ${stack || '(render pipeline)'}`);
}
const fcp = events.find((e) => e.name === 'firstContentfulPaint');
console.log(`first contentful paint at +${fcp ? ms(fcp.ts - start) : '?'} ms`);
const marks = events.filter((e) => ['EvaluateScript', 'v8.compile', 'FunctionCall', 'TimerFire', 'EventDispatch'].includes(e.name) && e.dur > 20000);
for (const e of marks.slice(0, 10)) console.log(`  long ${e.name} +${ms(e.ts - start)} ms for ${ms(e.dur)} ms ${e.args?.data?.url?.split('/').pop() ?? e.args?.data?.functionName ?? ''}`);
console.log(`font events: ${fonts.length}`);
await close();
app.server.close();
process.exit(0);
