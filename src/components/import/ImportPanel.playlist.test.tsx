// The Resolve dialog with a YouTube playlist, and the imported playlist as
// one entry in the LIBRARY panel.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { IDBFactory } from 'fake-indexeddb';

const IDS = ['-I1cEBVwkZw', 'FqIWsFBRcxw', 'WYuI8V3BCK4'];
const readYouTubePlaylist = vi.fn(async (_listId: string, _container: HTMLElement) => IDS);

vi.mock('../../services/playback/embedded/youtube', () => ({ readYouTubePlaylist: (id: string, el: HTMLElement) => readYouTubePlaylist(id, el) }));
vi.mock('../../services/playback/engine', () => ({
  getEngine: () => ({ enqueue: vi.fn(), playEntry: vi.fn(), playItem: vi.fn(), playList: vi.fn(), toggle: vi.fn(), next: vi.fn(), previous: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), subscribe: () => () => undefined }),
}));

import { ImportPanel } from './ImportPanel';
import { Dashboard } from '../../app/Dashboard';
import { createLocalAccountProvider } from '../../services/account/account';
import { resetDbForTests } from '../../services/storage/db';
import { MY_LIQUE, setActiveScope } from '../../services/storage/scope';
import { useAccount } from '../../stores/accountStore';
import { useFriends } from '../../stores/friendsStore';
import { useLibrary } from '../../stores/libraryStore';
import { usePlaylists } from '../../stores/playlistStore';
import { useUi } from '../../stores/uiStore';

const LIST = 'PLSrfzLXjOv32OCUA1vpSs0atSkso6Klcy';
const URL_WITH_LIST = `https://www.youtube.com/watch?v=-I1cEBVwkZw&list=${LIST}`;

/** YouTube's oEmbed, faked. */
function oembed(refused: string[] = []) {
  return vi.fn(async (input: string | URL | Request) => {
    const u = new URL(new URL(String(input)).searchParams.get('url')!);
    if (u.pathname === '/playlist') return Response.json({ title: 'Jazz Classics', author_name: 'Curator' });
    const v = u.searchParams.get('v')!;
    if (refused.includes(v)) return new Response('', { status: 404 });
    return Response.json({ title: `Artist - Song ${v}`, author_name: 'Artist' });
  });
}

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
  useLibrary.setState({ categories: [], media: [] });
  usePlaylists.setState({ playlists: [] });
  useUi.setState({ libraryTab: 'collection', libraryView: 'all', openPlaylistId: null });
  readYouTubePlaylist.mockClear();
  vi.stubGlobal('fetch', oembed());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let done = vi.fn();

async function resolve(url: string, onDone = vi.fn()) {
  done = onDone;
  render(
    <MemoryRouter>
      <ImportPanel onDone={onDone} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText(/provider URL/), { target: { value: url } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resolve' })));
  return onDone;
}

/** Clicks a save button and waits until the save has finished. */
async function clickSave(name: string | RegExp) {
  const button = await screen.findByRole('button', { name });
  await act(async () => fireEvent.click(button));
  await waitFor(() => expect(done).toHaveBeenCalled());
}

const createSwitch = () => screen.getByRole('switch', { name: 'Create playlist' });
const nameField = () => screen.queryByLabelText('Playlist name') as HTMLInputElement | null;

describe('Resolve dialog — YouTube playlist', () => {
  it('shows it as a playlist: kind, YouTube title, count and every video', async () => {
    await resolve(URL_WITH_LIST);
    expect(await screen.findByText('YouTube playlist', { selector: '.import__playlist-kind' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Jazz Classics' })).toBeTruthy();
    expect(screen.getByText('3 videos')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Playlist videos' });
    expect(within(list).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, true]);
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(IDS.map((id) => `Artist - Song ${id}`));
    // YouTube's player was given this list and a container in the dialog
    expect(readYouTubePlaylist).toHaveBeenCalledWith(LIST, expect.any(HTMLElement));
  });

  it('6–8. CREATE PLAYLIST is on, the name is the YouTube title, and it can be edited', async () => {
    await resolve(URL_WITH_LIST);
    await screen.findByRole('heading', { name: 'Jazz Classics' });
    expect(createSwitch().getAttribute('aria-checked')).toBe('true');
    expect(nameField()!.value).toBe('Jazz Classics');
    fireEvent.change(nameField()!, { target: { value: 'Late night jazz' } });
    expect(nameField()!.value).toBe('Late night jazz');
    // an empty name cannot be saved
    fireEvent.change(nameField()!, { target: { value: '  ' } });
    expect((screen.getByRole('button', { name: 'Save playlist' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('9–11. saving makes ONE playlist with every video in order, under the edited name', async () => {
    const onDone = await resolve(URL_WITH_LIST);
    await screen.findByRole('heading', { name: 'Jazz Classics' });
    fireEvent.change(nameField()!, { target: { value: 'Late night jazz' } });
    await clickSave('Save playlist');
    const playlists = usePlaylists.getState().playlists;
    expect(playlists).toHaveLength(1);
    expect(playlists[0]).toMatchObject({ name: 'Late night jazz', source: { provider: 'youtube', listId: LIST } });
    expect(usePlaylists.getState().resolve(playlists[0]!.id).items.map((m) => m.title)).toEqual(IDS.map((id) => `Artist - Song ${id}`));
    expect(useLibrary.getState().media.every((m) => m.playlistOnly)).toBe(true);
    // shown in the Playlists tab
    expect(useUi.getState()).toMatchObject({ libraryTab: 'playlists', openPlaylistId: playlists[0]!.id });
    expect(onDone).toHaveBeenCalled();
  });

  it('CREATE PLAYLIST off: the name field goes, and the videos are saved as separate library items', async () => {
    await resolve(URL_WITH_LIST);
    await screen.findByRole('heading', { name: 'Jazz Classics' });
    fireEvent.click(createSwitch());
    expect(nameField()).toBeNull();
    expect(screen.getByLabelText('Category')).toBeTruthy();
    await clickSave('Save to library');
    expect(usePlaylists.getState().playlists).toEqual([]);
    expect(useLibrary.getState().media.map((m) => [m.title, m.playlistOnly])).toEqual(IDS.map((id) => [`Artist - Song ${id}`, undefined]));
  });

  it('saving a playlist-only video to the library on its own lists it in Collection again', async () => {
    await resolve(URL_WITH_LIST);
    await screen.findByRole('heading', { name: 'Jazz Classics' });
    await clickSave('Save playlist');
    cleanup();
    await resolve(`https://www.youtube.com/watch?v=${IDS[1]}`);
    await clickSave('Save to library');
    expect(useLibrary.getState().media.filter((m) => !m.playlistOnly).map((m) => m.title)).toEqual([`Artist - Song ${IDS[1]}`]);
    expect(useLibrary.getState().media).toHaveLength(3); // reused, not duplicated
  });

  it('shows unavailable videos as such, and imports only the available ones', async () => {
    vi.stubGlobal('fetch', oembed([IDS[1]!]));
    await resolve(URL_WITH_LIST);
    await screen.findByRole('heading', { name: 'Jazz Classics' });
    expect(screen.getByText('3 videos · 2 available · 1 unavailable')).toBeTruthy();
    expect(screen.getByText('UNAVAILABLE')).toBeTruthy();
    await clickSave('Save playlist');
    expect(usePlaylists.getState().playlists[0]!.items).toHaveLength(2);
  });

  it('an empty playlist shows an error and saves nothing', async () => {
    readYouTubePlaylist.mockResolvedValueOnce([]);
    await resolve(URL_WITH_LIST);
    expect(await screen.findByText('EMPTY PLAYLIST')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
  });

  it('17. leaving without saving changes nothing', async () => {
    await resolve(URL_WITH_LIST);
    await screen.findByRole('heading', { name: 'Jazz Classics' });
    cleanup(); // the dialog closed
    expect(useLibrary.getState().media).toEqual([]);
    expect(usePlaylists.getState().playlists).toEqual([]);
  });

  it('16. a normal video link keeps the single-item editor (no playlist option)', async () => {
    await resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(await screen.findByLabelText('Title')).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Create playlist' })).toBeNull();
    expect(readYouTubePlaylist).not.toHaveBeenCalled();
    await clickSave('Save to library');
    expect(useLibrary.getState().media.map((m) => [m.title, m.playlistOnly])).toEqual([['Artist - Song dQw4w9WgXcQ', undefined]]);
  });
});

describe('LIBRARY panel — an imported playlist is one entry', () => {
  async function importPlaylist() {
    await resolve(URL_WITH_LIST);
    await screen.findByRole('heading', { name: 'Jazz Classics' });
    await clickSave('Save playlist');
    cleanup();
    useUi.setState({ libraryTab: 'collection', libraryView: 'all', openPlaylistId: null });
  }

  function renderApp() {
    const router = createMemoryRouter([{ path: '*', element: <Dashboard /> }], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    return router;
  }
  const libraryPanel = () => screen.getByRole('region', { name: 'Library categories' });
  const tabPanel = () => document.getElementById('lib-tabpanel')!;

  it('13–14. one Library entry for the playlist; its videos are not in Collection', async () => {
    await importPlaylist();
    renderApp();
    const entry = within(libraryPanel()).getByRole('button', { name: /^Jazz Classics/ });
    expect(entry.textContent).toContain('Playlist · 3 videos');
    expect(within(libraryPanel()).getAllByRole('button', { name: /Jazz Classics/ })).toHaveLength(1);
    expect(within(libraryPanel()).getByRole('button', { name: /^All media/ }).textContent).toContain('0');
    expect(within(tabPanel()).getByText('LIBRARY EMPTY')).toBeTruthy();
  });

  it('15. clicking it opens the playlist in PLAYLISTS (without playing) and marks it', async () => {
    await importPlaylist();
    const router = renderApp();
    await act(async () => fireEvent.click(within(libraryPanel()).getByRole('button', { name: /^Jazz Classics/ })));
    expect(router.state.location.pathname).toBe('/playlists');
    const selected = within(screen.getByRole('tablist', { name: 'Library views' })).getByRole('tab', { selected: true });
    expect(selected.textContent).toBe('Playlists');
    expect(within(tabPanel()).getAllByRole('button', { name: /^Play Artist - Song/ })).toHaveLength(3);
    expect(within(libraryPanel()).getByRole('button', { name: /^Jazz Classics/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(libraryPanel()).getByRole('button', { name: /^All media/ }).getAttribute('aria-pressed')).toBe('false');
  });
});
