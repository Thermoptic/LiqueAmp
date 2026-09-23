import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

export interface BuiltFile {
  /** URL path, e.g. /assets/index-abc.js */
  path: string;
  content: Buffer | string;
}

/**
 * Not precached: the worker itself, source maps, and the HLS library, which
 * is only needed for HLS streams — those need the network anyway, so it is
 * cached on first use instead of costing every install ~575 kB.
 */
export function shouldPrecache(path: string): boolean {
  if (path === '/sw.js' || path.endsWith('.map')) return false;
  if (/^\/assets\/hls-[\w-]+\.js$/.test(path)) return false;
  return true;
}

/** The exact precache list and a version that changes whenever any shell file changes. */
export function precacheManifest(files: BuiltFile[]): { urls: string[]; version: string } {
  const included = files.filter((f) => shouldPrecache(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash('sha256');
  for (const f of included) hash.update(f.path).update('\0').update(f.content).update('\0');
  return { urls: included.map((f) => f.path), version: hash.digest('hex').slice(0, 12) };
}

const VERSION_DECL = "const VERSION = '__VERSION__';";
const PRECACHE_DECL = 'const PRECACHE = __PRECACHE__;';

export function renderServiceWorker(template: string, manifest: { urls: string[]; version: string }): string {
  // Fail the build rather than ship a worker without a version or precache list.
  if (!template.includes(VERSION_DECL) || !template.includes(PRECACHE_DECL)) throw new Error('service-worker.js: VERSION/PRECACHE declarations not found');
  const out = template
    .replace(VERSION_DECL, `const VERSION = '${manifest.version}';`)
    .replace(PRECACHE_DECL, `const PRECACHE = ${JSON.stringify(manifest.urls)};`);
  if (out.includes('__VERSION__') || out.includes('__PRECACHE__')) throw new Error('service-worker.js: placeholders not filled');
  return out;
}

function listFiles(dir: string, root = dir): BuiltFile[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listFiles(full, root);
    return [{ path: '/' + relative(root, full).split('\\').join('/'), content: readFileSync(full) }];
  });
}

/**
 * Writes dist/sw.js after the build, from pwa/service-worker.js plus the
 * list of files actually produced (bundle + public/). Build-only.
 */
export function serviceWorkerPlugin(): Plugin {
  let outDir = '';
  let root = '';
  return {
    name: 'liqueamp-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const manifest = precacheManifest(listFiles(outDir));
      const template = readFileSync(resolve(root, 'pwa/service-worker.js'), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), renderServiceWorker(template, manifest));
      this.info?.(`sw.js: ${manifest.urls.length} files precached, version ${manifest.version}`);
    },
  };
}
