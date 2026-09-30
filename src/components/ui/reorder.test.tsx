// Only the grip drags a row: a draggable row turned clicks with a little mouse
// movement into drags, so tapping a track in a playlist did not start it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IDBFactory } from 'fake-indexeddb';

const engine = { playList: vi.fn(), playEntry: vi.fn(), enqueue: vi.fn(), subscribe: () => () => undefined };
vi.mock('../../services/playback/engine', () => ({ getEngine: () => engine }));

import { PlaylistsView } from '../library/PlaylistsView';
import { QueuePanel } from '../queue/QueuePanel';
import { resetDbForTests } from '../../services/storage/db';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useQueue, toEntries } from '../../stores/queueStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem } from '../../types/media';

const yt = (id: string, title: string): MediaItem => ({
  id,
  provider: 'youtube',
  title,
  sourceUrl: `https://www.youtube.com/watch?v=${id}`,
  playbackType: 'embed',
  createdAt: '',
  updatedAt: '',
});
const A = yt('aaaaaaaaaaa', 'First video');
const B = yt('bbbbbbbbbbb', 'Second video');

/** A DataTransfer good enough for React's drag events in jsdom. */
const dataTransfer = () => ({ effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn(), getData: vi.fn() });

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  useLibrary.setState({ categories: [], media: [A, B] });
  usePlaylists.setState({ playlists: [{ id: 'pl', name: 'YT test', items: [A, B].map((m) => ({ mediaId: m.id, addedAt: '' })), createdAt: '', updatedAt: '' }] });
  useUi.setState({ openPlaylistId: 'pl' });
  engine.playList.mockClear();
  engine.playEntry.mockClear();
});
afterEach(cleanup);

describe('playlist rows', () => {
  it('are not draggable themselves; only the grip is', () => {
    render(<PlaylistsView />, { wrapper: MemoryRouter });
    const rows = within(screen.getByRole('list', { name: 'Items in YT test' })).getAllByRole('listitem');
    for (const row of rows) {
      expect(row.getAttribute('draggable')).toBeNull();
      expect(row.querySelector('.drag-handle')!.getAttribute('draggable')).toBe('true');
    }
  });

  it('a click on a YouTube track starts it (from its place in the playlist)', () => {
    render(<PlaylistsView />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'Play Second video' }));
    expect(engine.playList).toHaveBeenCalledWith([A, B], 1);
  });

  it('dragging by the grip still reorders', async () => {
    render(<PlaylistsView />, { wrapper: MemoryRouter });
    const [first, second] = within(screen.getByRole('list', { name: 'Items in YT test' })).getAllByRole('listitem');
    const dt = dataTransfer();
    fireEvent.dragStart(first!.querySelector('.drag-handle')!, { dataTransfer: dt });
    expect(dt.setDragImage).toHaveBeenCalledWith(first, expect.any(Number), expect.any(Number)); // the whole row is shown
    fireEvent.dragOver(second!, { dataTransfer: dt });
    fireEvent.drop(second!, { dataTransfer: dt });
    await vi.waitFor(() => expect(usePlaylists.getState().playlists[0]!.items.map((i) => i.mediaId)).toEqual([B.id, A.id]));
  });
});

describe('queue rows', () => {
  it('are not draggable themselves either, and a click plays the entry', () => {
    useQueue.setState({ entries: toEntries([A, B]), currentId: null });
    render(<QueuePanel />, { wrapper: MemoryRouter });
    const rows = within(screen.getByRole('list', { name: 'Queue' })).getAllByRole('listitem');
    expect(rows.every((r) => r.getAttribute('draggable') === null)).toBe(true);
    expect(rows.every((r) => r.querySelector('.drag-handle')!.getAttribute('draggable') === 'true')).toBe(true);
    fireEvent.click(within(rows[1]!).getByRole('button', { name: /^Play Second video/ }));
    expect(engine.playEntry).toHaveBeenCalledWith(useQueue.getState().entries[1]!.entryId);
  });
});
