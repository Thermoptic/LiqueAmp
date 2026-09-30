// Modland (ftp.modland.com), the chip and game music archive, as a retro
// source: its file index (allmods.zip, ~6 MB, CORS-enabled) is read in the
// browser once, filtered to one format folder and kept in the Cache Storage;
// music files are fetched one at a time when played. Nothing is proxied.

export const MODLAND_INDEX_URL = 'https://ftp.modland.com/allmods.zip';
export const MODLAND_FILES = 'https://ftp.modland.com/pub/modules/';

/** Kept this long before the index is fetched again. */
const INDEX_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const CACHE_NAME = 'liqueamp-retro-v1';

export interface ModlandFile {
  /** Path inside pub/modules, e.g. "Nintendo Sound Format/C. Manami/mega man 2.nsf". */
  path: string;
  size: number;
}

export class ModlandError extends Error {}

/** The public URL of a file (each path segment encoded). */
export function modlandUrl(path: string): string {
  return MODLAND_FILES + path.split('/').map(encodeURIComponent).join('/');
}

/**
 * The decompressed contents of the first file in a zip archive, as a stream.
 * allmods.zip holds one deflated text file; this reads its local header
 * (PKWARE APPNOTE §4.3.7) and inflates it with the browser's own decoder.
 */
export function unzipFirst(zip: Uint8Array): ReadableStream<Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  if (zip.length < 30 || view.getUint32(0, true) !== 0x04034b50) throw new ModlandError('The Modland index is not a zip archive.');
  const method = view.getUint16(8, true);
  const flags = view.getUint16(6, true);
  let compressedSize = view.getUint32(18, true);
  const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  if (flags & 0x08 || compressedSize === 0) {
    // sizes in a data descriptor: take them from the central directory
    const cd = view.getUint32(findEocd(view) + 16, true);
    compressedSize = view.getUint32(cd + 20, true);
  }
  const data = zip.subarray(start, start + compressedSize);
  const source = new Response(data.slice()).body!;
  if (method === 0) return source;
  if (method !== 8) throw new ModlandError(`Unsupported zip compression (${method}).`);
  return source.pipeThrough(new DecompressionStream('deflate-raw'));
}

function findEocd(view: DataView): number {
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  throw new ModlandError('The Modland index archive is incomplete.');
}

/** Lines "size<TAB>path" under `prefix`, read line by line from the index stream. */
export async function filterIndex(stream: ReadableStream<Uint8Array>, prefix: string): Promise<ModlandFile[]> {
  const files: ModlandFile[] = [];
  const reader = (stream as ReadableStream<BufferSource>).pipeThrough(new TextDecoderStream('windows-1252')).getReader();
  let rest = '';
  const take = (line: string) => {
    const tab = line.indexOf('\t');
    if (tab < 0) return;
    const path = line.slice(tab + 1).trim();
    if (path.startsWith(prefix)) files.push({ path, size: Number(line.slice(0, tab)) || 0 });
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = (rest + value).split('\n');
    rest = lines.pop() ?? '';
    for (const line of lines) take(line);
  }
  if (rest) take(rest);
  return files;
}

export interface IndexOptions {
  fetchImpl?: typeof fetch;
  /** Cache Storage; undefined where it is not available (the index is then kept for the session only). */
  cache?: CacheStorage;
  now?: () => number;
}

const session = new Map<string, Promise<ModlandFile[]>>();

/** The index entries of one Modland folder, e.g. "Nintendo Sound Format/". */
export function modlandIndex(prefix: string, options: IndexOptions = {}): Promise<ModlandFile[]> {
  let pending = session.get(prefix);
  if (!pending) {
    pending = loadIndex(prefix, options);
    session.set(prefix, pending);
    pending.catch(() => session.delete(prefix)); // a failed load is retried next time
  }
  return pending;
}

/** Forgets the session copy (tests). */
export function resetModlandSession() {
  session.clear();
}

async function loadIndex(prefix: string, { fetchImpl = fetch, cache = globalThis.caches, now = Date.now }: IndexOptions): Promise<ModlandFile[]> {
  const key = `https://liqueamp.invalid/retro-index/${encodeURIComponent(prefix)}`;
  const store = cache ? await cache.open(CACHE_NAME).catch(() => undefined) : undefined;
  const cached = await store?.match(key).catch(() => undefined);
  const saved = cached ? ((await cached.json().catch(() => null)) as { at: number; files: ModlandFile[] } | null) : null;
  if (saved && Array.isArray(saved.files) && now() - saved.at < INDEX_MAX_AGE_MS) return saved.files;

  let res: Response;
  try {
    res = await fetchImpl(MODLAND_INDEX_URL, { referrerPolicy: 'no-referrer' });
  } catch {
    if (saved?.files) return saved.files; // offline: an old index is better than none
    throw new ModlandError(navigator.onLine ? 'The Modland archive could not be reached.' : 'You are offline. The retro index needs a network the first time.');
  }
  if (!res.ok) {
    if (saved?.files) return saved.files;
    throw new ModlandError(`The Modland archive answered HTTP ${res.status}.`);
  }
  const files = await filterIndex(unzipFirst(new Uint8Array(await res.arrayBuffer())), prefix);
  if (files.length === 0) throw new ModlandError('The Modland index lists no files for this system.');
  await store?.put(key, new Response(JSON.stringify({ at: now(), files }), { headers: { 'content-type': 'application/json' } })).catch(() => undefined);
  return files;
}

/** Fetches a music file from the archive. */
export async function fetchModlandFile(path: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetchImpl(modlandUrl(path), { referrerPolicy: 'no-referrer', signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ModlandError(navigator.onLine ? 'The file could not be fetched from Modland.' : 'You are offline.');
  }
  if (!res.ok) throw new ModlandError(res.status === 404 ? 'Modland no longer has this file.' : `Modland answered HTTP ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
}
