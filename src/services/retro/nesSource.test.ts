// The NES source: Modland's index (a zip read in the browser), search, an
// NSF's tunes, and the media items that play through the normal player.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filterIndex, modlandIndex, modlandUrl, resetModlandSession, unzipFirst } from './modland';
import { createNesSource, describeNsfPath, displayName } from './nesSource';
import { planDirectPlayback } from '../providers/direct';
import { NSF_TRACK_SECONDS } from './nes/nsf';
import { validMedia } from '../backup/validate';

const INDEX = [
  '24576\tNintendo Sound Format/3-108/new rally-x.nsf',
  '16512\tNintendo Sound Format/C. Manami/mega man 2.nsf',
  '16384\tNintendo Sound Format/C. Manami/mega man.nsf',
  '9000\tNintendo Sound Format/Bunbun/mega man 3.nsf',
  '8000\tNintendo Sound Format/Alex Mauer/coop-Lapine/mead.nsf',
  '7000\tNintendo Sound Format/- unknown/zelda ii - the adventure of link.nsf',
  '4156\tHVSC/GAMES/A-F/Bionic_Commando_USA_Version.sid',
  '614\tVideo Game Music/BBC Micro/Christopher Hyde/Zany Kong Junior/zany kong junior - gamestart.vgz',
].join('\n');

/** A zip with one deflated file, as allmods.zip is. */
async function zipOf(name: string, text: string): Promise<Uint8Array> {
  const raw = new TextEncoder().encode(text);
  const deflated = new Uint8Array(await new Response(new Response(raw).body!.pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const nameBytes = new TextEncoder().encode(name);
  const header = new Uint8Array(30 + nameBytes.length);
  const v = new DataView(header.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(8, 8, true); // deflate
  v.setUint32(18, deflated.length, true);
  v.setUint32(22, raw.length, true);
  v.setUint16(26, nameBytes.length, true);
  header.set(nameBytes, 30);
  const zip = new Uint8Array(header.length + deflated.length);
  zip.set(header);
  zip.set(deflated, header.length);
  return zip;
}

/** A minimal NSF with `songs` songs. */
function nsfBytes(songs: number, name = 'Mega Man 2', artist = 'Takashi Tateishi', expansion = 0): Uint8Array {
  const b = new Uint8Array(0x80 + 16);
  b.set([0x4e, 0x45, 0x53, 0x4d, 0x1a, 1, songs, 1, 0x00, 0x80, 0x00, 0x80, 0x01, 0x80]);
  b.set([...name].map((c) => c.charCodeAt(0)), 0x0e);
  b.set([...artist].map((c) => c.charCodeAt(0)), 0x2e);
  b[0x7b] = expansion;
  b[0x80] = 0x60; // RTS
  b[0x81] = 0x60;
  return b;
}

/** A tiny in-memory Cache Storage. */
function memoryCaches(): CacheStorage & { stored: Map<string, string> } {
  const stored = new Map<string, string>();
  const cache = {
    match: async (key: string) => (stored.has(key) ? new Response(stored.get(key)) : undefined),
    put: async (key: string, res: Response) => void stored.set(key, await res.text()),
  };
  return { stored, open: async () => cache } as unknown as CacheStorage & { stored: Map<string, string> };
}

beforeEach(() => resetModlandSession());

describe('Modland index', () => {
  it('reads the deflated index from the zip in the browser and keeps one folder', async () => {
    const files = await filterIndex(unzipFirst(await zipOf('allmods.txt', INDEX)), 'Nintendo Sound Format/');
    expect(files.map((f) => f.path)).toHaveLength(6);
    expect(files[1]).toEqual({ path: 'Nintendo Sound Format/C. Manami/mega man 2.nsf', size: 16512 });
  });

  it('downloads once per session, caches on the device, and uses an old copy when offline', async () => {
    const zip = await zipOf('allmods.txt', INDEX);
    const fetchImpl = vi.fn(async () => new Response(zip.slice()));
    const caches = memoryCaches();
    let now = 1_000;
    const opts = { fetchImpl, cache: caches, now: () => now };
    expect(await modlandIndex('Nintendo Sound Format/', opts)).toHaveLength(6);
    expect(await modlandIndex('Nintendo Sound Format/', opts)).toHaveLength(6);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // the session keeps it
    resetModlandSession();
    expect(await modlandIndex('Nintendo Sound Format/', opts)).toHaveLength(6);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // the device cache keeps it
    // after 30 days it is fetched again; offline, the old copy still works
    resetModlandSession();
    now += 31 * 24 * 3600 * 1000;
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await modlandIndex('Nintendo Sound Format/', { ...opts, fetchImpl: offline })).toHaveLength(6);
    expect(offline).toHaveBeenCalledTimes(1);
  });

  it('a failed first download is an error, and is retried next time', async () => {
    const opts = { fetchImpl: vi.fn(async () => new Response('', { status: 503 })), cache: undefined };
    await expect(modlandIndex('Nintendo Sound Format/', opts)).rejects.toThrow('HTTP 503');
    const zip = await zipOf('allmods.txt', INDEX);
    await expect(modlandIndex('Nintendo Sound Format/', { fetchImpl: async () => new Response(zip.slice()), cache: undefined })).resolves.toHaveLength(6);
  });

  it('builds file URLs with each path segment encoded', () => {
    expect(modlandUrl('Nintendo Sound Format/C. Manami/mega man 2.nsf')).toBe('https://ftp.modland.com/pub/modules/Nintendo%20Sound%20Format/C.%20Manami/mega%20man%202.nsf');
  });
});

describe('NES source', () => {
  async function source(nsf = nsfBytes(3)) {
    const zip = await zipOf('allmods.txt', INDEX);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('allmods.zip') ? new Response(zip.slice()) : String(url).includes('mega%20man%202.nsf') ? new Response(nsf.slice()) : new Response('', { status: 404 }),
    );
    return { src: createNesSource({ fetchImpl: fetchImpl as unknown as typeof fetch, cache: undefined }), fetchImpl };
  }

  it('names games and composers from Modland paths', () => {
    expect(displayName('zelda ii - the adventure of link')).toBe('Zelda II - The Adventure Of Link');
    expect(describeNsfPath('Nintendo Sound Format/Alex Mauer/coop-Lapine/mead.nsf')).toEqual({ game: 'Mead', composer: 'Alex Mauer, Lapine' });
    expect(describeNsfPath('Nintendo Sound Format/- unknown/zelda ii - the adventure of link.nsf').composer).toBeUndefined();
  });

  it('searches games and composers, best matches first, only NES files', async () => {
    const { src } = await source();
    const hits = await src.search('mega man');
    expect(hits.map((h) => h.title)).toEqual(['Mega Man', 'Mega Man 2', 'Mega Man 3']);
    expect(hits[1]).toMatchObject({ systemId: 'nes', format: 'NSF', composer: 'C. Manami', hasTunes: true });
    expect((await src.search('manami')).map((h) => h.title)).toEqual(['Mega Man', 'Mega Man 2']);
    expect(await src.search('commando')).toEqual([]); // SID files are not NES files
    expect(await src.search('   ')).toEqual([]);
  });

  it('lists a file’s songs from its header, each a track of its own', async () => {
    const { src } = await source(nsfBytes(3));
    const [file] = await src.search('mega man 2');
    const tunes = await src.getTracks(file!);
    expect(tunes.map((t) => [t.title, t.subtune, t.game, t.composer, t.duration])).toEqual([
      ['Track 01', 1, 'Mega Man 2', 'Takashi Tateishi', NSF_TRACK_SECONDS],
      ['Track 02', 2, 'Mega Man 2', 'Takashi Tateishi', NSF_TRACK_SECONDS],
      ['Track 03', 3, 'Mega Man 2', 'Takashi Tateishi', NSF_TRACK_SECONDS],
    ]);
    expect((await src.getTrack(tunes[1]!.id))!.subtune).toBe(2);
  });

  it('says when expansion audio is not emulated', async () => {
    const { src } = await source(nsfBytes(1, 'Castlevania III', 'Konami', 0x01)); // VRC6
    const [file] = await src.search('mega man 2');
    expect((await src.getTracks(file!))[0]!.note).toBe('VRC6 audio not emulated');
  });

  it('turns a tune into a media item the normal player, queue, favourites and playlists accept', async () => {
    const { src } = await source(nsfBytes(3));
    const [file] = await src.search('mega man 2');
    const tune = (await src.getTracks(file!))[1]!;
    const item = src.toMediaItem(tune);
    expect(item).toMatchObject({
      id: 'retro:nes:Nintendo Sound Format/C. Manami/mega man 2.nsf#2',
      provider: 'retro',
      title: 'Mega Man 2 · Track 02',
      artist: 'Takashi Tateishi',
      album: 'Mega Man 2',
      playbackType: 'direct',
      sourceUrl: 'https://ftp.modland.com/pub/modules/Nintendo%20Sound%20Format/C.%20Manami/mega%20man%202.nsf#song=2',
      metadata: { providerItemId: 'retro:nes:Nintendo Sound Format/C. Manami/mega man 2.nsf#2', format: 'nsf', subtune: 2 },
    });
    // stable: the same tune is the same item (library/favourite/playlist identity)
    expect(src.toMediaItem(tune).id).toBe(item.id);
    // kept by backups and profiles
    expect(validMedia(item)).toMatchObject({ provider: 'retro', sourceUrl: item.sourceUrl });
    // played by the emulator, not by <audio>
    expect(await planDirectPlayback(item)).toEqual([{ url: item.sourceUrl, format: 'nsf' }]);
  });

  it('fetches each file once, however many ask', async () => {
    const { src, fetchImpl } = await source();
    const [file] = await src.search('mega man 2');
    await Promise.all([src.getTracks(file!), src.getTracks(file!), src.getTrack(`${file!.id}#1`)]);
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).endsWith('.nsf'))).toHaveLength(1);
  });

  it('a caller that gives up does not break the shared download for others', async () => {
    const { src } = await source();
    const [file] = await src.search('mega man 2');
    const abort = new AbortController();
    const first = src.getTracks(file!, { signal: abort.signal });
    abort.abort();
    await expect(first).rejects.toThrow('Aborted');
    await expect(src.getTracks(file!)).resolves.toHaveLength(3);
  });
});
