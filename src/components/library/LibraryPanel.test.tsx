// COLLECTION | PLAYLISTS | FAVOURITES | HISTORY: Collection is the Library,
// filtered by the category selected in the LIBRARY panel.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { IDBFactory } from 'fake-indexeddb';

vi.mock('../../services/playback/engine', () => ({
  getEngine: () => ({ enqueue: vi.fn(), playEntry: vi.fn(), playItem: vi.fn(), playList: vi.fn(), toggle: vi.fn(), next: vi.fn(), previous: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), subscribe: () => () => undefined }),
}));

import { Dashboard } from '../../app/Dashboard';
import { createLocalAccountProvider } from '../../services/account/account';
import { resetDbForTests } from '../../services/storage/db';
import { MY_LIQUE, setActiveScope } from '../../services/storage/scope';
import { useAccount } from '../../stores/accountStore';
import { useFriends } from '../../stores/friendsStore';
import { useLibrary } from '../../stores/libraryStore';
import { useUi } from '../../stores/uiStore';
import type { Category, MediaItem } from '../../types/media';

const cat = (id: string, name: string, sortOrder: number): Category => ({ id, name, sortOrder, enabled: true });
const item = (id: string, title: string, categoryId: string | null): MediaItem => ({
  id,
  title,
  provider: 'direct',
  sourceUrl: `https://files.example/${id}.mp3`,
  playbackType: 'direct',
  categoryId,
  createdAt: '',
  updatedAt: '',
});

const CATEGORIES = [cat('jazz', 'Jazz YT', 0), cat('yt', 'YouTube', 1), cat('empty', 'Empty Cat', 2)];
const MEDIA = [item('m1', 'Blue Train', 'jazz'), item('m2', 'So What', 'jazz'), item('m3', 'Video Song', 'yt'), item('m4', 'Loose Track', null)];

beforeAll(() => {
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
  useFriends.getState().setDirectory(null);
  await useAccount.getState().init(createLocalAccountProvider());
  useLibrary.setState({ categories: CATEGORIES, media: MEDIA });
  // the store's page-load state
  useUi.setState({ libraryTab: 'collection', libraryView: 'all', openPlaylistId: null });
});
afterEach(cleanup);

function renderApp(at = '/') {
  const router = createMemoryRouter([{ path: '*', element: <Dashboard /> }], { initialEntries: [at] });
  render(<RouterProvider router={router} />);
  return router;
}

const tabs = () => within(screen.getByRole('tablist', { name: 'Library views' })).getAllByRole('tab');
const tab = (name: string) => within(screen.getByRole('tablist', { name: 'Library views' })).getByRole('tab', { name });
const selectedTab = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;
const panel = () => document.getElementById('lib-tabpanel')!;
const rows = () => Array.from(panel().querySelectorAll('.media-row__main')).map((b) => b.getAttribute('aria-label')!.replace(/^Play /, ''));
// the LIBRARY panel's buttons are named "<category><count> items"
const category = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\d+ items?$`) });

describe('Library panel — Collection', () => {
  it('orders the tabs COLLECTION | PLAYLISTS | FAVOURITES | HISTORY', () => {
    renderApp();
    expect(tabs().map((t) => t.textContent)).toEqual(['Collection', 'Playlists', 'Favourites', 'History']);
    // the same tab styling as the others
    expect(new Set(tabs().map((t) => t.className)).size).toBe(1);
  });

  it('1–3. starts on COLLECTION with All media selected, showing all media', () => {
    renderApp();
    expect(selectedTab()).toBe('Collection');
    expect(category('All media').getAttribute('aria-pressed')).toBe('true');
    expect(category('Jazz YT').getAttribute('aria-pressed')).toBe('false');
    expect(within(panel()).getByRole('heading', { name: 'All media' })).toBeTruthy();
    expect(rows()).toEqual(['Blue Train', 'So What', 'Video Song', 'Loose Track']);
  });

  it('4–5. a category filters Collection at once and COLLECTION stays active', () => {
    renderApp();
    fireEvent.click(category('Jazz YT'));
    expect(selectedTab()).toBe('Collection');
    expect(rows()).toEqual(['Blue Train', 'So What']);
    expect(category('Jazz YT').getAttribute('aria-pressed')).toBe('true');
    expect(category('All media').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(category('YouTube'));
    expect(selectedTab()).toBe('Collection');
    expect(rows()).toEqual(['Video Song']);

    fireEvent.click(category('All media'));
    expect(rows()).toHaveLength(4);
  });

  it('keeps the existing row actions (category selector, queue, remove, ⋯ menu)', () => {
    renderApp();
    fireEvent.click(category('Jazz YT'));
    const row = within(panel()).getByRole('button', { name: 'Play Blue Train' }).closest('li')!;
    expect(within(row).getByLabelText('Category for Blue Train')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Add Blue Train to queue' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Remove Blue Train from library' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'More actions for Blue Train' })).toBeTruthy();
    expect(within(row).getByText('01')).toBeTruthy();
  });

  it('6–8. PLAYLISTS, FAVOURITES and HISTORY still open their own views and routes', async () => {
    const router = renderApp();
    for (const [name, path, empty] of [
      ['Playlists', '/playlists', 'NO PLAYLISTS'],
      ['Favourites', '/favourites', 'NO FAVOURITES'],
      ['History', '/history', 'NO HISTORY'],
    ] as const) {
      await act(async () => fireEvent.click(tab(name)));
      expect(selectedTab()).toBe(name);
      expect(router.state.location.pathname).toBe(path);
      expect(within(panel()).getByText(empty)).toBeTruthy(); // that tab's own view
      expect(rows()).toEqual([]); // no Collection rows under the other tabs
    }

    await act(async () => fireEvent.click(tab('Collection')));
    expect(selectedTab()).toBe('Collection');
    expect(rows()).toHaveLength(4);
  });

  it('the main menu still opens those tabs; a category from another tab returns to COLLECTION', async () => {
    const router = renderApp();
    const menu = screen.getAllByRole('navigation', { name: 'Main' })[0]!;
    await act(async () => fireEvent.click(within(menu).getByRole('link', { name: 'Favourites' })));
    expect(router.state.location.pathname).toBe('/favourites');
    expect(selectedTab()).toBe('Favourites');

    fireEvent.click(category('YouTube'));
    expect(selectedTab()).toBe('Collection');
    expect(rows()).toEqual(['Video Song']);
    expect(router.state.location.pathname).toBe('/favourites'); // no navigation
  });

  it('9. a page load always starts on COLLECTION + All media, even on a library route', async () => {
    // a fresh store module, as after a reload
    vi.resetModules();
    const fresh = await import('../../stores/uiStore');
    expect(fresh.useUi.getState().libraryTab).toBe('collection');
    expect(fresh.useUi.getState().libraryView).toBe('all');

    // the route the page was loaded with does not pick the tab…
    const router = renderApp('/playlists');
    expect(selectedTab()).toBe('Collection');
    expect(rows()).toHaveLength(4);
    // …navigating does
    await act(() => router.navigate('/history'));
    expect(selectedTab()).toBe('History');
    // re-navigating to the same path counts too (e.g. the mobile LISTS button while Collection is open)
    await act(async () => fireEvent.click(tab('Collection')));
    await act(() => router.navigate('/history'));
    expect(selectedTab()).toBe('History');
  });

  it('10. empty category and empty library have their own empty states', () => {
    renderApp();
    fireEvent.click(category('Empty Cat'));
    expect(within(panel()).getByText('NO MEDIA IN THIS CATEGORY')).toBeTruthy();
    expect(rows()).toEqual([]);
    cleanup();

    useLibrary.setState({ media: [] });
    useUi.setState({ libraryView: 'all' });
    renderApp();
    expect(within(panel()).getByText('LIBRARY EMPTY')).toBeTruthy();
  });

  it('a selected category that no longer exists falls back to All media', () => {
    renderApp();
    fireEvent.click(category('Jazz YT'));
    act(() => useLibrary.setState({ categories: CATEGORIES.filter((c) => c.id !== 'jazz') }));
    expect(within(panel()).getByRole('heading', { name: 'All media' })).toBeTruthy();
    expect(rows()).toHaveLength(4);
    expect(category('All media').getAttribute('aria-pressed')).toBe('true');
  });
});
