import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../types/media';
import { ProviderError } from './errors';
import { testSource, type SourceTestDeps } from './testSource';

const item = (extra: Partial<MediaItem> = {}): MediaItem => ({
  id: 'a',
  provider: 'direct',
  title: 'A',
  sourceUrl: 'https://x/a.mp3',
  playbackType: 'direct',
  createdAt: '',
  updatedAt: '',
  ...extra,
});

function deps(over: Partial<SourceTestDeps> = {}): SourceTestDeps {
  return {
    plan: async (i) => [{ url: i.sourceUrl, format: 'audio' }],
    probe: async () => ({ readable: true, status: 200, info: { codec: 'MP3', bitrateKbps: 128, source: 'http-headers' } }),
    loadable: async () => true,
    resolve: async (i) => ({ ...i, title: 'Resolved title' }),
    ...over,
  };
}

const line = (r: { lines: Array<{ label: string; value: string; tone: string }> }, label: string) => r.lines.find((l) => l.label === label);

describe('testSource', () => {
  it('a readable, loadable stream passes and reports what was declared', async () => {
    const r = await testSource(item(), deps());
    expect(r.ok).toBe(true);
    expect(line(r, 'Browser access')).toMatchObject({ tone: 'ok' });
    expect(line(r, 'Declared')?.value).toBe('MP3 · 128 kbps');
    expect(line(r, 'Playable')).toMatchObject({ tone: 'ok' });
  });

  it('no CORS is a warning, not a failure — the plain element can still play it', async () => {
    const r = await testSource(item(), deps({ probe: async () => ({ readable: false }) }));
    expect(r.ok).toBe(true);
    expect(line(r, 'Browser access')).toMatchObject({ tone: 'warn', value: expect.stringMatching(/no visualizer or EQ/) });
  });

  it('404 is conclusive; an unloadable source fails', async () => {
    expect((await testSource(item(), deps({ probe: async () => ({ readable: true, status: 404 }) }))).ok).toBe(false);
    const r = await testSource(item(), deps({ loadable: async () => false }));
    expect(r.ok).toBe(false);
    expect(line(r, 'Playable')).toMatchObject({ tone: 'error' });
  });

  it('HLS needs CORS for the manifest', async () => {
    const hls = deps({ plan: async () => [{ url: 'https://x/live.m3u8', format: 'hls' }], probe: async () => ({ readable: false }) });
    const r = await testSource(item(), hls);
    expect(r.ok).toBe(false);
    expect(line(r, 'Playable')?.value).toMatch(/cannot read the manifest/);
  });

  it('reports playlist problems from the same planner the engine uses', async () => {
    const r = await testSource(item(), deps({ plan: async () => Promise.reject(new ProviderError('UNSUPPORTED', 'Not a playlist')) }));
    expect(r.ok).toBe(false);
    expect(line(r, 'Source')?.value).toMatch(/Not a playlist/);
  });

  it('provider items are checked with the provider, without claiming embeddability', async () => {
    const r = await testSource(item({ provider: 'youtube', playbackType: 'embed', sourceUrl: 'https://youtu.be/x' }), deps());
    expect(r.ok).toBe(true);
    expect(line(r, 'Provider')?.value).toContain('Resolved title');
    expect(line(r, 'Playback')?.value).toMatch(/only known when it plays/);
    const gone = await testSource(item({ provider: 'youtube', playbackType: 'embed' }), deps({ resolve: async () => Promise.reject(new ProviderError('NOT_FOUND', 'Removed')) }));
    expect(gone.ok).toBe(false);
  });
});
