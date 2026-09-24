import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from '../storage/db';
import { repositories } from '../storage/repository';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { MediaItem, Playlist } from '../../types/media';
import { LIQUEAMP_DEFAULT } from '../themes/builtin';
import { applyImport, BACKUP_FORMAT, createBackup, parseBackup, planImport, type ExistingData, type ParsedBackup } from './backup';

const now = '2026-09-24T10:00:00.000Z';
const media = (id: string, url = `https://x/${id}.mp3`, extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  provider: 'direct',
  title: id,
  sourceUrl: url,
  playbackType: 'direct',
  createdAt: now,
  updatedAt: now,
  ...extra,
});
const playlist = (id: string, mediaIds: string[]): Playlist => ({ id, name: id, items: mediaIds.map((mediaId) => ({ mediaId, addedAt: now })), createdAt: now, updatedAt: now });
const customTheme = { ...LIQUEAMP_DEFAULT, id: 'mine', name: 'Mine', source: 'user' as const };

async function existing(): Promise<ExistingData> {
  const [themes, categories, m, playlists, favorites, stations, history] = await Promise.all([
    repositories.themes.getAll(),
    repositories.categories.getAll(),
    repositories.media.getAll(),
    repositories.playlists.getAll(),
    repositories.favorites.getAll(),
    repositories.stations.getAll(),
    repositories.history.getAll(),
  ]);
  return { themes, categories, media: m, playlists, favorites, stations, history };
}

function parsed(data: object): ParsedBackup {
  const r = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: now, data }));
  if (!r.ok) throw new Error(r.error);
  return r.backup;
}

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
});

describe('backup export', () => {
  it('contains local data, custom themes only, persisted settings only, and history on request', async () => {
    await repositories.media.put(media('a'));
    await repositories.themes.put(customTheme);
    await repositories.history.put({ id: 'h1', mediaId: 'a', startedAt: now, durationPlayed: 30, item: media('a') });
    const store = { ...DEFAULT_SETTINGS, hydrated: true, update() {} };

    const withHistory = await createBackup(store, { includeHistory: true });
    expect(withHistory.format).toBe(BACKUP_FORMAT);
    expect(withHistory.data.media.map((m) => m.id)).toEqual(['a']);
    expect(withHistory.data.themes.map((t) => t.id)).toEqual(['mine']);
    expect(withHistory.data.history).toHaveLength(1);
    expect(Object.keys(withHistory.data.settings!)).not.toContain('hydrated');
    expect(Object.keys(withHistory.data.settings!)).not.toContain('update');

    expect((await createBackup(store, { includeHistory: false })).data.history).toBeUndefined();
  });
});

describe('backup parsing', () => {
  it('refuses files that are not a usable backup, without guessing', () => {
    expect(parseBackup('{nope')).toMatchObject({ ok: false, error: expect.stringMatching(/not valid JSON/) });
    expect(parseBackup('{"format":"something-else"}')).toMatchObject({ ok: false, error: expect.stringMatching(/not a LIQUEAMP backup/) });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, data: {} }))).toMatchObject({ ok: false, error: expect.stringMatching(/newer LIQUEAMP/) });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, data: { media: {} } }))).toMatchObject({ ok: false, error: expect.stringMatching(/not a list/) });
  });

  it('skips invalid records, duplicate ids and non-http(s) addresses', () => {
    const b = parsed({
      media: [
        media('ok'),
        media('js', 'javascript:alert(1)'),
        { id: 'broken' },
        media('ok'), // duplicate id
        media('art', 'https://x/a.mp3', { artwork: 'data:image/png;base64,AAAA' }),
      ],
      themes: [customTheme, { ...LIQUEAMP_DEFAULT }], // built-in themes are never imported
      favorites: [{ type: 'media', refId: 'ok', addedAt: now, id: 'forged' }],
    });
    expect(b.media.items.map((m) => m.id)).toEqual(['ok', 'art']);
    expect(b.media.invalid).toBe(3);
    expect(b.media.items[1]!.artwork).toBeUndefined(); // data: URL dropped, item kept
    expect(b.themes.items.map((t) => t.id)).toEqual(['mine']);
    expect(b.favorites.items[0]!.id).toBe('media:ok'); // ids are derived, never trusted
  });

  it('validates settings with the same rules as stored settings', () => {
    const b = parsed({ settings: { volume: 7, repeat: 'sideways', shuffle: true, providers: { spotify: { enabled: false } } } });
    expect(b.settings).toMatchObject({ volume: 1, shuffle: true });
    expect(b.settings).not.toHaveProperty('repeat');
    expect(b.settings!.providers!.spotify.enabled).toBe(false);
  });
});

describe('backup import', () => {
  it('merge: same source under another id is merged, and references follow it', async () => {
    await repositories.media.put(media('local-a', 'https://x/song.mp3'));
    const b = parsed({
      media: [media('backup-a', 'https://x/song.mp3'), media('b')],
      playlists: [playlist('p', ['backup-a', 'b'])],
      favorites: [{ type: 'media', refId: 'backup-a', addedAt: now }],
    });
    const plan = planImport(b, await existing(), { mode: 'merge', settings: false, history: false });
    expect(plan.counts.media).toEqual({ added: 1, updated: 0, merged: 1 });
    await applyImport(plan, 'merge');

    expect((await repositories.media.getAll()).map((m) => m.id).sort()).toEqual(['b', 'local-a']);
    expect((await repositories.playlists.get('p'))!.items.map((i) => i.mediaId)).toEqual(['local-a', 'b']);
    expect((await repositories.favorites.getAll())[0]).toMatchObject({ id: 'media:local-a', refId: 'local-a' });
  });

  it('importing the same backup twice changes nothing the second time', async () => {
    const b = parsed({ media: [media('a'), media('b')], playlists: [playlist('p', ['a'])] });
    await applyImport(planImport(b, await existing(), { mode: 'merge', settings: false, history: false }), 'merge');
    const again = planImport(b, await existing(), { mode: 'merge', settings: false, history: false });
    expect(again.counts.media).toEqual({ added: 0, updated: 2, merged: 0 });
    await applyImport(again, 'merge');
    expect(await repositories.media.getAll()).toHaveLength(2);
  });

  it('replace: removes current data first, but keeps history unless history is imported', async () => {
    await repositories.media.put(media('old'));
    await repositories.history.put({ id: 'h-old', mediaId: 'old', startedAt: now, durationPlayed: 5, item: media('old') });
    const b = parsed({ media: [media('new')] });
    const plan = planImport(b, await existing(), { mode: 'replace', settings: false, history: false });
    expect(plan.removed.media).toBe(1);
    await applyImport(plan, 'replace');
    expect((await repositories.media.getAll()).map((m) => m.id)).toEqual(['new']);
    expect(await repositories.history.getAll()).toHaveLength(1);
  });

  it('a failing write rolls back everything — including a replace-mode clear', async () => {
    await repositories.media.put(media('keep'));
    const b = parsed({ media: [media('new')] });
    const plan = planImport(b, await existing(), { mode: 'replace', settings: false, history: false });
    // corrupt the plan after validation: a record without its key makes IndexedDB throw
    plan.write.playlists = [{ name: 'no id' } as unknown as Playlist];
    await expect(applyImport(plan, 'replace')).rejects.toThrow();
    expect((await repositories.media.getAll()).map((m) => m.id)).toEqual(['keep']);
  });

  it('round trip: export → wipe → import restores the same data', async () => {
    await repositories.media.putMany([media('a'), media('b', 'https://x/b.m3u', { tags: ['x'], enabled: false })]);
    await repositories.playlists.put(playlist('p', ['a', 'b']));
    await repositories.themes.put(customTheme);
    const file = await createBackup({ ...DEFAULT_SETTINGS, volume: 0.3 }, { includeHistory: true });

    await resetDbForTests();
    globalThis.indexedDB = new IDBFactory();
    await getDb();

    const b = parsed(file.data);
    await applyImport(planImport(b, await existing(), { mode: 'merge', settings: true, history: true }), 'merge');
    expect((await repositories.media.getAll()).sort((x, y) => x.id.localeCompare(y.id))).toEqual(file.data.media.sort((x, y) => x.id.localeCompare(y.id)));
    expect(await repositories.playlists.get('p')).toEqual(file.data.playlists[0]);
    expect((await repositories.themes.get('mine'))!.colors).toEqual(customTheme.colors);
    const db = await getDb();
    expect(((await db!.get('kv', 'settings')) as { volume: number }).volume).toBe(0.3);
  });
});
