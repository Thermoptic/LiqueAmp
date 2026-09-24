import { probeCors, type CorsProbe } from '../playback/nativeAudio';
import type { MediaItem } from '../../types/media';
import { detectSource } from './detect';
import { planDirectPlayback, type PlaybackCandidate } from './direct';
import { ProviderError } from './errors';
import { resolveProvider } from './oembed';
import { isInsecureForPage } from '../radio/stations';

export type TestTone = 'ok' | 'warn' | 'error' | 'idle';

export interface SourceTestLine {
  label: string;
  value: string;
  tone: TestTone;
}

export interface SourceTestResult {
  /** The source looks playable in this browser. */
  ok: boolean;
  lines: SourceTestLine[];
}

export interface SourceTestDeps {
  plan(item: MediaItem): Promise<PlaybackCandidate[]>;
  probe(url: string): Promise<CorsProbe>;
  /** Whether a plain audio element can load the URL (no CORS needed). */
  loadable(url: string): Promise<boolean>;
  resolve(item: MediaItem): Promise<MediaItem>;
}

const LOAD_TIMEOUT_MS = 8000;

/** Loads metadata in a detached audio element, then releases it (live streams are cut off at once). */
export function canLoadInAudioElement(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const el = new Audio();
    el.preload = 'metadata';
    const finish = (ok: boolean) => {
      window.clearTimeout(timer);
      el.removeAttribute('src');
      el.load();
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
    el.addEventListener('loadedmetadata', () => finish(true), { once: true });
    el.addEventListener('error', () => finish(false), { once: true });
    el.src = url;
  });
}

const DEFAULT_DEPS: SourceTestDeps = {
  plan: (item) => planDirectPlayback(item),
  probe: (url) => probeCors(url),
  loadable: canLoadInAudioElement,
  resolve: (item) => resolveProvider(detectSource(item.sourceUrl)),
};

/**
 * "Test source" in /control › Media (SPEC §35): checks the same things the
 * engine and importer rely on, without starting playback.
 */
export async function testSource(item: MediaItem, deps: SourceTestDeps = DEFAULT_DEPS): Promise<SourceTestResult> {
  const lines: SourceTestLine[] = [];
  const add = (label: string, value: string, tone: TestTone) => lines.push({ label, value, tone });

  if (item.playbackType === 'embed' || item.playbackType === 'external') {
    try {
      const resolved = await deps.resolve(item);
      add('Provider', `Confirms the item exists: “${resolved.title}”`, 'ok');
      add(
        'Playback',
        item.playbackType === 'embed' ? 'Official embedded player — whether the owner allows embedding is only known when it plays' : 'Opens on the provider itself',
        'idle',
      );
      return { ok: true, lines };
    } catch (err) {
      add('Provider', err instanceof ProviderError ? `${err.title} — ${err.message}` : String(err), 'error');
      return { ok: false, lines };
    }
  }

  let candidates: PlaybackCandidate[];
  try {
    candidates = await deps.plan(item);
  } catch (err) {
    add('Source', err instanceof ProviderError ? `${err.title} — ${err.message}` : String(err), 'error');
    return { ok: false, lines };
  }
  const first = candidates[0];
  if (!first) {
    add('Source', 'The playlist contains no playable entries', 'error');
    return { ok: false, lines };
  }
  if (isInsecureForPage(first.url)) {
    add('Security', 'http:// stream — browsers block it on an https page', 'error');
    return { ok: false, lines };
  }
  if (candidates.length > 1) add('Playlist', `${candidates.length} mirrors; testing the first`, 'idle');
  add('Format', first.format === 'hls' ? 'HLS (played with hls.js)' : 'Audio stream / file', 'idle');

  const probe = await deps.probe(first.url);
  if (probe.status === 404 || probe.status === 410) {
    add('Server', `Not found (HTTP ${probe.status})`, 'error');
    return { ok: false, lines };
  }
  add(
    'Browser access',
    probe.readable ? 'Allowed (CORS) — visualizer and EQ can work' : 'Not allowed (no CORS) — no visualizer or EQ for this source',
    probe.readable ? 'ok' : 'warn',
  );
  if (probe.info?.codec || probe.info?.bitrateKbps) {
    add('Declared', [probe.info.codec, probe.info.bitrateKbps ? `${probe.info.bitrateKbps} kbps` : null].filter(Boolean).join(' · '), 'idle');
  }

  if (first.format === 'hls') {
    // hls.js reads the manifest with fetch, so it needs CORS.
    const ok = probe.readable;
    add('Playable', ok ? 'Manifest readable by the browser' : 'hls.js cannot read the manifest without CORS', ok ? 'ok' : 'error');
    return { ok, lines };
  }
  const loadable = await deps.loadable(first.url);
  add('Playable', loadable ? 'The browser can load it' : 'The browser could not load it (offline, unsupported format, or blocked)', loadable ? 'ok' : 'error');
  return { ok: loadable, lines };
}
