import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../types/media';
import { applyEdits, previewImport, type ImportStep } from './importer';

function libItem(url: string, id = 'lib-1'): MediaItem {
  return { id, provider: 'direct', title: 'Saved', sourceUrl: url, streamUrl: url, playbackType: 'direct', createdAt: '', updatedAt: '' };
}

const M3U = '#EXTM3U\n#EXTINF:180,Artist - One\nhttps://a.example.com/1.mp3\n#EXTINF:200,Artist - Two\nhttps://a.example.com/2.mp3\n';

function fetchText(body: string | 'fail'): typeof fetch {
  return (async () => {
    if (body === 'fail') throw new TypeError('Failed to fetch');
    return new Response(body, { headers: { 'content-type': 'audio/x-mpegurl' } });
  }) as typeof fetch;
}

describe('previewImport', () => {
  it('reports the pipeline steps in order and previews a single stream', async () => {
    const steps: ImportStep[] = [];
    const p = await previewImport('example.com/radio/live.mp3', { library: [], onStep: (s) => steps.push(s) });
    expect(steps).toEqual(['detecting', 'resolving']);
    expect(p.status).toBe('ready');
    if (p.status !== 'ready') return;
    expect(p.detection.normalizedUrl).toBe('https://example.com/radio/live.mp3');
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]!.item.title).toBe('live');
  });

  it('marks entries that are already in the library', async () => {
    const p = await previewImport('https://example.com/mix.m3u', {
      library: [libItem('https://a.example.com/2.mp3')],
      fetchImpl: fetchText(M3U),
    });
    if (p.status !== 'ready') throw new Error(p.status);
    expect(p.entries.map((e) => e.duplicateOf?.id ?? null)).toEqual([null, 'lib-1']);
  });

  it('recognises provider links without inventing metadata', async () => {
    const p = await previewImport('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', { library: [] });
    expect(p.status).toBe('provider-pending');
  });

  it('returns readable errors instead of throwing', async () => {
    expect(await previewImport('   ', { library: [] })).toMatchObject({ status: 'error', title: 'INVALID URL' });
    expect(await previewImport('ftp://x.example.com/a.mp3', { library: [] })).toMatchObject({ status: 'error', title: 'UNSUPPORTED SOURCE' });
    expect(await previewImport('https://example.com/list.pls', { library: [], fetchImpl: fetchText('fail') })).toMatchObject({
      status: 'error',
      title: 'CORS BLOCKED',
    });
  });
});

describe('applyEdits', () => {
  const a = libItem('https://x/a.mp3', 'a');
  const b = libItem('https://x/b.mp3', 'b');

  it('applies title/artist only to a single item, and the category to all', () => {
    expect(applyEdits([a], { title: ' New title ', artist: 'Someone', categoryId: 'cat' })[0]).toMatchObject({
      title: 'New title',
      artist: 'Someone',
      categoryId: 'cat',
    });
    const multi = applyEdits([a, b], { title: 'Ignored', categoryId: 'cat' });
    expect(multi.map((m) => [m.title, m.categoryId])).toEqual([
      ['Saved', 'cat'],
      ['Saved', 'cat'],
    ]);
  });

  it('without title/artist edits, one selected playlist entry keeps its own title', () => {
    expect(applyEdits([b], { categoryId: 'cat' })[0]!.title).toBe('Saved');
  });

  it('keeps the original title when the edit is blank', () => {
    expect(applyEdits([a], { title: '   ' })[0]!.title).toBe('Saved');
  });
});
