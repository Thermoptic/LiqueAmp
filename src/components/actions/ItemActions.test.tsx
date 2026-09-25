// Checkpoint 3: the actions that lived only in Quick Actions, in their new places.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';

const enqueue = vi.fn();
vi.mock('../../services/playback/engine', () => ({ getEngine: () => ({ enqueue }) }));

import { ItemActionsMenu, StationActions } from './ItemActions';
import { resetDbForTests } from '../../services/storage/db';
import { setActiveScope, MY_LIQUE } from '../../services/storage/scope';
import { stationToMediaItem } from '../../services/radio/stations';
import { useFavorites } from '../../stores/favoritesStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useLibrary } from '../../stores/libraryStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem, RadioStation } from '../../types/media';

const now = '2026-09-25T12:00:00.000Z';
const station: RadioStation = {
  id: 'rb-1',
  name: 'Jazz FM',
  streamUrl: 'https://streams.example/jazz.mp3',
  sourceUrl: 'https://streams.example/jazz.pls',
  homepage: 'https://jazz.example/',
  genre: ['jazz'],
  tags: [],
};
const track: MediaItem = {
  id: 'm-1',
  provider: 'direct',
  title: 'Night Drive',
  sourceUrl: 'https://files.example/night.mp3',
  streamUrl: 'https://cdn.example/night.mp3',
  playbackType: 'direct',
  createdAt: now,
  updatedAt: now,
};
const youtube: MediaItem = { ...track, id: 'yt-1', provider: 'youtube', title: 'Video', sourceUrl: 'https://www.youtube.com/watch?v=abc', streamUrl: null, playbackType: 'embed' };

const writeText = vi.fn(() => Promise.resolve());
const toasts = () => useUi.getState().toasts.map((t) => t.message);

beforeAll(() => {
  // jsdom has no modal dialogs
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  setActiveScope(MY_LIQUE);
  enqueue.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  useUi.setState({ toasts: [] });
  useFavorites.setState({ scope: MY_LIQUE, favorites: [], stations: {} });
  usePlaylists.setState({ scope: MY_LIQUE, playlists: [] });
  useLibrary.setState({ scope: MY_LIQUE, categories: [], media: [] });
});

afterEach(cleanup);

const openMenu = (title: string) => {
  fireEvent.click(screen.getByRole('button', { name: `More actions for ${title}` }));
  return screen.getByRole('menu');
};
const menuItems = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((el) => el.textContent?.trim());

describe('Station Info actions (stations)', () => {
  it('Add to Queue queues the station in the personal queue', () => {
    render(<StationActions station={station} />);
    fireEvent.click(screen.getByRole('button', { name: /Add to Queue/ }));
    const { createdAt: _c, updatedAt: _u, ...expected } = stationToMediaItem(station);
    expect(enqueue).toHaveBeenCalledWith([expect.objectContaining(expected)]);
    expect(toasts()).toContain('Added to queue');
  });

  it('Copy Stream URL copies the station’s playable stream', async () => {
    render(<StationActions station={station} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy Stream URL/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://streams.example/jazz.mp3'));
    await waitFor(() => expect(toasts()).toContain('Stream URL copied'));
  });

  it('Share Station shares the homepage with the Web Share API, and copies it where sharing is unavailable', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    const { unmount } = render(<StationActions station={station} />);
    fireEvent.click(screen.getByRole('button', { name: /Share Station/ }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Jazz FM', url: 'https://jazz.example/' }));
    unmount();

    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    render(<StationActions station={station} />);
    fireEvent.click(screen.getByRole('button', { name: /Share Station/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://jazz.example/'));
    await waitFor(() => expect(toasts()).toContain('Link copied'));
  });

  it('a failing clipboard reports an error instead of claiming success', async () => {
    writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    render(<StationActions station={station} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy Stream URL/ }));
    await waitFor(() => expect(toasts()).toContain('Could not copy to the clipboard'));
  });

  it('Add to Playlist creates a playlist with the station', async () => {
    render(<StationActions station={station} />);
    fireEvent.click(screen.getByRole('button', { name: /Add to Playlist/ }));
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Radio mix' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    });
    await waitFor(() => expect(usePlaylists.getState().playlists.map((p) => p.name)).toEqual(['Radio mix']));
    const [playlist] = usePlaylists.getState().playlists;
    expect(useLibrary.getState().media.find((m) => m.id === playlist!.items[0]!.mediaId)?.title).toBe('Jazz FM');
  });
});

describe('the ⋯ menu (media rows and Now Playing)', () => {
  it('offers queue, playlist, favourite, share and copy stream URL for a media item', () => {
    render(<ItemActionsMenu target={{ kind: 'media', item: track }} />);
    expect(menuItems(openMenu('Night Drive'))).toEqual(['Add to queue', 'Add to playlist', 'Add to favourites', 'Share', 'Copy stream URL']);
  });

  it('for a station it also opens the website', () => {
    render(<ItemActionsMenu target={{ kind: 'station', station }} />);
    const menu = openMenu('Jazz FM');
    const website = within(menu).getByRole('menuitem', { name: /Open website/ });
    expect(website.getAttribute('href')).toBe('https://jazz.example/');
    expect(website.getAttribute('target')).toBe('_blank');
    expect(website.getAttribute('rel')).toContain('noopener');
  });

  it('Now Playing leaves out favourite (it has its own button)', () => {
    render(<ItemActionsMenu target={{ kind: 'media', item: track }} favourite={false} />);
    expect(menuItems(openMenu('Night Drive'))).not.toContain('Add to favourites');
  });

  it('Add to queue queues the item and closes the menu', () => {
    render(<ItemActionsMenu target={{ kind: 'media', item: track }} />);
    fireEvent.click(within(openMenu('Night Drive')).getByRole('menuitem', { name: /Add to queue/ }));
    expect(enqueue).toHaveBeenCalledWith([track]);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Copy stream URL copies the stream, or the source for items without one (embeds)', async () => {
    render(<ItemActionsMenu target={{ kind: 'media', item: track }} />);
    fireEvent.click(within(openMenu('Night Drive')).getByRole('menuitem', { name: /Copy stream URL/ }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('https://cdn.example/night.mp3'));
    cleanup();
    render(<ItemActionsMenu target={{ kind: 'media', item: youtube }} />);
    fireEvent.click(within(openMenu('Video')).getByRole('menuitem', { name: /Copy stream URL/ }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('https://www.youtube.com/watch?v=abc'));
  });

  it('Add to favourites favourites a media item', async () => {
    render(<ItemActionsMenu target={{ kind: 'media', item: track }} />);
    const favourite = within(openMenu('Night Drive')).getByRole('menuitem', { name: /Add to favourites/ });
    await act(async () => {
      fireEvent.click(favourite);
    });
    await waitFor(() => expect(useFavorites.getState().favorites.map((f) => f.id)).toEqual(['media:m-1']));
    expect(menuItems(openMenu('Night Drive'))).toContain('Remove from favourites');
  });

  it('keyboard: Escape closes and returns focus to the button; arrows move between items', () => {
    render(<ItemActionsMenu target={{ kind: 'media', item: track }} />);
    const menu = openMenu('Night Drive');
    const items = within(menu).getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions for Night Drive' }));
  });
});
