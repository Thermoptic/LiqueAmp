// NES music: NSF files from Modland's "Nintendo Sound Format" folder, played
// by LIQUEAMP's own NES emulator (./nes). One search result is one game's
// NSF file; its songs are listed as separate tracks from the file's header.

import type { MediaItem } from '../../types/media';
import { fetchModlandFile, modlandIndex, modlandUrl, type IndexOptions, type ModlandFile } from './modland';
import { NSF_TRACK_SECONDS, parseNsf, type NsfFile } from './nes/nsf';
import type { RetroSearchOptions, RetroSource, RetroTrack } from './sources';

export const NSF_FOLDER = 'Nintendo Sound Format/';

const ROMAN = /^(ii|iii|iv|vi|vii|viii|ix|xi|xii)$/i;

/** Modland file names are lower case: "mega man 2" → "Mega Man 2". */
export function displayName(name: string): string {
  return name.replace(/[^\s()[\]-]+/g, (w) => (ROMAN.test(w) ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)));
}

/** Game and composer from "Nintendo Sound Format/<composer>[/coop-<composer>]/<game>.nsf". */
export function describeNsfPath(path: string): { game: string; composer?: string } {
  const parts = path.slice(NSF_FOLDER.length).split('/');
  const file = parts.pop() ?? '';
  const composers = parts.map((p) => p.replace(/^coop-/, '')).filter((p) => p && p !== '- unknown');
  return { game: displayName(file.replace(/\.nsf$/i, '')), composer: composers.length ? composers.join(', ') : undefined };
}

const fileTrack = (f: ModlandFile): RetroTrack => {
  const { game, composer } = describeNsfPath(f.path);
  return { id: f.path, systemId: 'nes', title: game, game, composer, format: 'NSF', hasTunes: true };
};

export interface NesSourceOptions extends IndexOptions {
  /** Results per search. */
  limit?: number;
}

/** Search ranking: game title matches before composer-only matches, then by how early the match is. */
function rank(file: RetroTrack, words: string[]): number {
  const game = file.game!.toLowerCase();
  const all = `${game} ${file.composer?.toLowerCase() ?? ''}`;
  if (!words.every((w) => all.includes(w))) return -1;
  const phrase = words.join(' ');
  if (game === phrase) return 0;
  if (game.startsWith(phrase)) return 1;
  if (words.every((w) => game.includes(w))) return 2;
  return 3;
}

export function createNesSource(options: NesSourceOptions = {}): RetroSource {
  const fetchImpl = options.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const files = new Map<string, Promise<NsfFile>>();

  /**
   * The parsed file, fetched once and shared. The fetch is not tied to one
   * caller's AbortSignal (another caller may still want it; NSF files are a
   * few KB); an aborted caller just stops waiting.
   */
  function nsfFor(path: string, signal?: AbortSignal): Promise<NsfFile> {
    let pending = files.get(path);
    if (!pending) {
      pending = fetchModlandFile(path, fetchImpl).then(parseNsf);
      files.set(path, pending);
      pending.catch(() => files.delete(path));
      if (files.size > 32) files.delete(files.keys().next().value!); // a small recent-files cache
    }
    if (!signal) return pending;
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      pending.then(resolve, reject);
    });
  }

  function tunesOf(path: string, nsf: NsfFile): RetroTrack[] {
    const fromPath = describeNsfPath(path);
    const game = nsf.name || fromPath.game;
    const composer = nsf.artist || fromPath.composer;
    const note = nsf.expansion.length ? `${nsf.expansion.join(' + ')} audio not emulated` : undefined;
    return Array.from({ length: nsf.songs }, (_, i) => ({
      id: `${path}#${i + 1}`,
      systemId: 'nes',
      title: `Track ${String(i + 1).padStart(2, '0')}`,
      game,
      composer,
      format: 'NSF',
      subtune: i + 1,
      duration: NSF_TRACK_SECONDS,
      ...(note ? { note } : {}),
    }));
  }

  return {
    id: 'modland-nsf',
    name: 'Modland · Nintendo Sound Format',

    async search(query: string, { limit = options.limit ?? 100 }: RetroSearchOptions = {}) {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      const index = await modlandIndex(NSF_FOLDER, options);
      return index
        .map(fileTrack)
        .map((t) => [rank(t, words), t] as const)
        .filter(([r]) => r >= 0)
        .sort((a, b) => a[0] - b[0] || a[1].game!.localeCompare(b[1].game!))
        .slice(0, limit)
        .map(([, t]) => t);
    },

    async getTracks(file, { signal } = {}) {
      const path = file.id.split('#')[0]!;
      return tunesOf(path, await nsfFor(path, signal));
    },

    async getTrack(id, { signal } = {}) {
      const [path, n] = id.split('#');
      const tunes = tunesOf(path!, await nsfFor(path!, signal));
      return tunes[Number(n) - 1] ?? null;
    },

    toMediaItem(track): MediaItem {
      const [path, n = '1'] = track.id.split('#');
      return {
        id: `retro:nes:${track.id}`,
        provider: 'retro',
        // "Track 03" alone says little in Now Playing: name the game too
        title: track.subtune ? `${track.game} · ${track.title}` : track.title,
        artist: track.composer,
        album: track.game,
        sourceUrl: `${modlandUrl(path!)}#song=${n}`,
        playbackType: 'direct',
        duration: track.duration ?? NSF_TRACK_SECONDS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: { providerItemId: `retro:nes:${track.id}`, retroSystem: 'nes', format: 'nsf', subtune: Number(n) },
      };
    },
  };
}
