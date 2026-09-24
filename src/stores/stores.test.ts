import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests, getStorageStatus } from '../services/storage/db';
import { kv, repositories } from '../services/storage/repository';
import { DEFAULT_SETTINGS } from '../types/settings';
import { useSettings } from './settingsStore';
import { useLibrary, countByCategory } from './libraryStore';
import { useThemes } from './themeStore';
import { LIQUEAMP_DEFAULT } from '../services/themes/builtin';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false });
  useLibrary.setState({ categories: [], media: [] });
  await useThemes.getState().hydrate();
});

describe('settings persistence', () => {
  it('persists updates and restores them on hydrate', async () => {
    useSettings.getState().update({ activeThemeId: 'amber-night', volume: 0.35, repeat: 'one' });
    await flush();
    await flush();

    useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false });
    await useSettings.getState().hydrate();
    const s = useSettings.getState();
    expect(s.activeThemeId).toBe('amber-night');
    expect(s.volume).toBe(0.35);
    expect(s.repeat).toBe('one');
    expect(s.hydrated).toBe(true);
    expect(getStorageStatus().status).toBe('ready');
  });

  it('ignores corrupted stored values', async () => {
    await kv.set('settings', { volume: 'loud', repeat: 'sometimes', motion: 'reduced', glowLevel: 99 });
    await useSettings.getState().hydrate();
    const s = useSettings.getState();
    expect(s.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(s.repeat).toBe(DEFAULT_SETTINGS.repeat);
    expect(s.motion).toBe('reduced');
    expect(s.glowLevel).toBe(1.5);
  });

  it('artwork is on by default, persists when switched off, and ignores invalid values', async () => {
    expect(DEFAULT_SETTINGS.artwork).toBe(true);
    useSettings.getState().update({ artwork: false });
    await flush();
    await flush();
    useSettings.setState({ ...DEFAULT_SETTINGS, hydrated: false });
    await useSettings.getState().hydrate();
    expect(useSettings.getState().artwork).toBe(false);

    await kv.set('settings', { artwork: 'no' });
    await useSettings.getState().hydrate();
    expect(useSettings.getState().artwork).toBe(true);
  });
});

describe('categories', () => {
  it('creates, renames, reorders and persists categories', async () => {
    const lib = useLibrary.getState();
    const a = await lib.addCategory('  Synthwave ');
    const b = await lib.addCategory('Ambient');
    expect(a.name).toBe('Synthwave');
    await useLibrary.getState().renameCategory(b.id, 'Ambient Moods');
    await useLibrary.getState().moveCategory(b.id, -1);

    expect(useLibrary.getState().categories.map((c) => c.name)).toEqual(['Ambient Moods', 'Synthwave']);

    useLibrary.setState({ categories: [], media: [] });
    await useLibrary.getState().hydrate();
    expect(useLibrary.getState().categories.map((c) => c.name)).toEqual(['Ambient Moods', 'Synthwave']);
  });

  it('rejects empty names', async () => {
    await expect(useLibrary.getState().addCategory('   ')).rejects.toThrow();
  });

  it('deleting a category keeps its media and clears the reference', async () => {
    const cat = await useLibrary.getState().addCategory('Lofi');
    const now = new Date().toISOString();
    const item = {
      id: 'm1',
      provider: 'direct' as const,
      title: 'Test',
      sourceUrl: 'https://example.com/a.mp3',
      playbackType: 'direct' as const,
      categoryId: cat.id,
      createdAt: now,
      updatedAt: now,
    };
    await repositories.media.put(item);
    await useLibrary.getState().hydrate();
    expect(countByCategory(useLibrary.getState().media).get(cat.id)).toBe(1);

    await useLibrary.getState().deleteCategory(cat.id);
    const stored = await repositories.media.get('m1');
    expect(stored?.categoryId).toBeNull();
    expect(useLibrary.getState().categories).toHaveLength(0);
  });
});

describe('themes store', () => {
  it('falls back to the default theme for unknown ids', () => {
    expect(useThemes.getState().getTheme('does-not-exist').id).toBe(LIQUEAMP_DEFAULT.id);
  });

  it('protects built-in themes and persists user themes', async () => {
    await expect(useThemes.getState().deleteTheme(LIQUEAMP_DEFAULT.id)).rejects.toThrow();
    await useThemes.getState().saveTheme({ ...LIQUEAMP_DEFAULT, id: 'custom-1', name: 'Custom', source: 'user' });
    await useThemes.getState().hydrate();
    expect(useThemes.getState().themes.some((t) => t.id === 'custom-1')).toBe(true);
    await useThemes.getState().deleteTheme('custom-1');
    await useThemes.getState().hydrate();
    expect(useThemes.getState().themes.some((t) => t.id === 'custom-1')).toBe(false);
  });
});
