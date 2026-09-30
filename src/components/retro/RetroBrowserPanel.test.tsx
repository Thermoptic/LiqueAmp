// RETRO replaces HISTORY in the main menu and swaps the Browse panel for the
// Retro panel. No source is connected yet; a test source drives the rows.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { IDBFactory } from 'fake-indexeddb';

const engine = { enqueue: vi.fn(), playEntry: vi.fn(), playItem: vi.fn(), playList: vi.fn(), toggle: vi.fn(), next: vi.fn(), previous: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), subscribe: () => () => undefined };
vi.mock('../../services/playback/engine', () => ({ getEngine: () => engine }));

import { Dashboard } from '../../app/Dashboard';
import { sectionFromPath } from '../../app/sections';
import { createLocalAccountProvider } from '../../services/account/account';
import { resetDbForTests } from '../../services/storage/db';
import { MY_LIQUE, setActiveScope } from '../../services/storage/scope';
import { RETRO_SYSTEMS } from '../../services/retro/systems';
import { registerRetroSource, retroSourceFor, type RetroSource, type RetroTrack } from '../../services/retro/sources';
import { useAccount } from '../../stores/accountStore';
import { useFavorites } from '../../stores/favoritesStore';
import { useFriends } from '../../stores/friendsStore';
import { useLibrary } from '../../stores/libraryStore';
import { useRetro } from '../../stores/retroStore';
import { useUi } from '../../stores/uiStore';
import type { MediaItem } from '../../types/media';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

let unregister: (() => void)[] = [];

beforeEach(async () => {
  await resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  setActiveScope(MY_LIQUE);
  useFriends.getState().setDirectory(null);
  await useAccount.getState().init(createLocalAccountProvider());
  useLibrary.setState({ categories: [], media: [] });
  useFavorites.setState({ favorites: [], stations: {} });
  useRetro.setState({ systemId: null, query: '', openFile: null });
  useUi.setState({ libraryTab: 'collection', libraryView: 'all', openPlaylistId: null });
  Object.values(engine).forEach((f) => typeof f === 'function' && 'mockClear' in f && f.mockClear());
});
afterEach(() => {
  cleanup();
  unregister.forEach((u) => u());
  unregister = [];
});

function renderApp(at = '/retro') {
  const router = createMemoryRouter([{ path: '*', element: <Dashboard /> }], { initialEntries: [at] });
  render(<RouterProvider router={router} />);
  return router;
}

const retroPanel = () => screen.getByRole('region', { name: 'Retro browser' });
const systemTab = (name: string) => within(screen.getByRole('tablist', { name: 'Retro systems' })).getByRole('tab', { name });

// ---- a test source (the real sources come later) ----
const NES_TRACKS: RetroTrack[] = [
  { id: 'mm2-1', systemId: 'nes', title: 'Dr. Wily Stage 1', game: 'Mega Man 2', composer: 'Takashi Tateishi', format: 'NSF', subtune: 1 },
  { id: 'mm2-2', systemId: 'nes', title: 'Dr. Wily Stage 2', game: 'Mega Man 2', format: 'NSF', subtune: 2 },
];
const C64_FILE: RetroTrack = { id: 'commando', systemId: 'c64', title: 'Commando', game: 'Commando', composer: 'Rob Hubbard', format: 'SID', subtuneCount: 3 };
const C64_TUNES: RetroTrack[] = ['Commando Theme', 'High Score', 'Game Over'].map((title, i) => ({ id: `commando-${i + 1}`, systemId: 'c64', title, game: 'Commando', composer: 'Rob Hubbard', format: 'SID', subtune: i + 1 }));

function testSource(systemId: string, tracks: RetroTrack[], tunes: RetroTrack[] = []): RetroSource & { search: ReturnType<typeof vi.fn> } {
  const toMediaItem = (t: RetroTrack): MediaItem => ({
    id: `retro:${t.id}`,
    provider: 'direct',
    title: t.title,
    artist: t.composer,
    sourceUrl: `https://retro.example/${t.id}`,
    playbackType: 'direct',
    createdAt: '',
    updatedAt: '',
  });
  const source = {
    id: `test-${systemId}`,
    name: 'Test archive',
    search: vi.fn(async (q: string) => tracks.filter((t) => `${t.title} ${t.game ?? ''}`.toLowerCase().includes(q.toLowerCase()))),
    getTracks: async () => tunes,
    getTrack: async (id: string) => tracks.find((t) => t.id === id) ?? null,
    toMediaItem,
  };
  unregister.push(registerRetroSource(systemId, source));
  return source;
}

async function typeSearch(text: string) {
  fireEvent.change(within(retroPanel()).getByRole('searchbox'), { target: { value: text } });
  // the search is debounced
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });
}

describe('main menu — Retro replaces History', () => {
  it('lists RETRO where HISTORY was, in the sidebar and the mobile bar; /history still works', async () => {
    const router = renderApp('/');
    const [sidebar, bottom] = screen.getAllByRole('navigation', { name: 'Main' });
    expect(within(sidebar!).getAllByRole('link').map((a) => a.textContent)).toEqual(['Now Playing', 'Browse', 'Playlists', 'Favourites', 'Retro', 'Settings', 'Control Panel']);
    expect(within(bottom!).getAllByRole('link').map((a) => a.getAttribute('aria-label'))).toEqual(['Now Playing', 'Browse', 'Playlists', 'Favourites', 'Retro', 'Settings']);
    // same link styling as the others, active on /retro
    const retro = within(sidebar!).getByRole('link', { name: 'Retro' });
    expect(retro.className).toBe(within(sidebar!).getByRole('link', { name: 'Browse' }).className);
    await act(async () => fireEvent.click(retro));
    expect(router.state.location.pathname).toBe('/retro');
    expect(within(sidebar!).getByRole('link', { name: 'Retro' }).getAttribute('aria-current')).toBe('page');
    // History is still a section and the Library panel's tab
    expect(sectionFromPath('/history')).toBe('history');
    expect(sectionFromPath('/retro')).toBe('retro');
    await act(() => router.navigate('/history'));
    expect(within(screen.getByRole('tablist', { name: 'Library views' })).getByRole('tab', { name: 'History' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('Retro panel', () => {
  it('takes the Browse panel’s place in the Retro section only', () => {
    const router = renderApp('/retro');
    expect(retroPanel().classList.contains('area-radio')).toBe(true);
    expect(screen.queryByRole('region', { name: 'Radio browser' })).toBeNull();
    // the player and the other regions are unchanged
    expect(document.querySelector('.area-main')).toBeTruthy();
    expect(document.querySelector('.area-lower')).toBeTruthy();
    act(() => void router.navigate('/browse'));
    expect(screen.getByRole('region', { name: 'Radio browser' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Retro browser' })).toBeNull();
  });

  it('builds its tabs from the systems list and starts with no system chosen', () => {
    renderApp();
    const tabs = within(screen.getByRole('tablist', { name: 'Retro systems' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(RETRO_SYSTEMS.map((s) => s.name));
    expect(tabs.map((t) => t.textContent)).toEqual(['NES', 'C64', 'MEGADRIVE']);
    expect(tabs.every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
    expect(new Set(tabs.map((t) => t.className)).size).toBe(1);
    expect(within(retroPanel()).getByText('RETRO MUSIC')).toBeTruthy();
    expect(within(retroPanel()).getByText('Select a system to browse.')).toBeTruthy();
    expect(within(retroPanel()).queryByRole('searchbox')).toBeNull();
  });

  it('a chosen system is marked and names the search field; without a source it says so honestly', () => {
    renderApp();
    fireEvent.click(systemTab('C64'));
    expect(systemTab('C64').getAttribute('aria-selected')).toBe('true');
    expect(systemTab('NES').getAttribute('aria-selected')).toBe('false');
    const search = within(retroPanel()).getByRole('searchbox', { name: 'Search C64 music' }) as HTMLInputElement;
    expect(search.placeholder).toBe('Search C64 music…');
    expect(search.disabled).toBe(true);
    expect(within(retroPanel()).getByText('SOURCE NOT CONNECTED')).toBeTruthy();
    expect(within(retroPanel()).getByText(/Commodore 64 · SID · no source connected/)).toBeTruthy();
    // C64 and Mega Drive have no source yet (NES is connected at start-up, see defaultSources)
    for (const id of ['c64', 'megadrive']) expect(retroSourceFor(id)).toBeUndefined();
  });

  it('searches only the chosen system’s source and shows compact results', async () => {
    const nes = testSource('nes', NES_TRACKS);
    const c64 = testSource('c64', [C64_FILE], C64_TUNES);
    renderApp();
    fireEvent.click(systemTab('NES'));
    await typeSearch('wily');
    expect(nes.search).toHaveBeenLastCalledWith('wily', expect.anything());
    expect(c64.search).not.toHaveBeenCalled();
    const results = within(retroPanel()).getByRole('list', { name: 'NES results' });
    const rows = within(results).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('.row__index')!.textContent)).toEqual(['01', '02']);
    expect(rows[0]!.querySelector('.station-row__name')!.textContent).toBe('Dr. Wily Stage 1');
    expect(rows[0]!.querySelector('.station-row__meta')!.textContent).toBe('Mega Man 2 · Takashi Tateishi · NES · NSF');
    // the same query, searched in the next system
    fireEvent.click(systemTab('C64'));
    await typeSearch('commando');
    expect(c64.search).toHaveBeenLastCalledWith('commando', expect.anything());
  });

  it('▶ plays and ＋ queues through LIQUEAMP’s normal player; ♥ uses the normal favourites', async () => {
    testSource('nes', NES_TRACKS);
    renderApp();
    fireEvent.click(systemTab('NES'));
    await typeSearch('wily');
    const row = within(retroPanel()).getAllByRole('listitem')[0]!;
    fireEvent.click(within(row).getByRole('button', { name: 'Play Dr. Wily Stage 1' }));
    expect(engine.playList).toHaveBeenCalledWith([expect.objectContaining({ id: 'retro:mm2-1', title: 'Dr. Wily Stage 1' })]);
    fireEvent.click(within(row).getByRole('button', { name: 'Add Dr. Wily Stage 1 to queue' }));
    expect(engine.enqueue).toHaveBeenCalledWith([expect.objectContaining({ id: 'retro:mm2-1' })]);
    await act(async () => fireEvent.click(within(row).getByRole('button', { name: 'Add Dr. Wily Stage 1 to favourites' })));
    await waitFor(() => expect(useFavorites.getState().favorites.map((f) => f.id)).toEqual(['media:retro:mm2-1']));
    expect(within(row).getByRole('button', { name: 'Remove Dr. Wily Stage 1 from favourites' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('⋯ opens the same item menu as other media, with Add to playlist', async () => {
    testSource('nes', NES_TRACKS);
    renderApp();
    fireEvent.click(systemTab('NES'));
    await typeSearch('wily');
    const row = within(retroPanel()).getAllByRole('listitem')[0]!;
    fireEvent.click(within(row).getByRole('button', { name: 'More actions for Dr. Wily Stage 1' }));
    expect(screen.getByRole('menuitem', { name: /Add to playlist/ })).toBeTruthy();
  });

  it('a file with several subtunes opens its tunes, each playable on its own', async () => {
    testSource('c64', [C64_FILE], C64_TUNES);
    renderApp();
    fireEvent.click(systemTab('C64'));
    await typeSearch('commando');
    const file = within(retroPanel()).getAllByRole('listitem')[0]!;
    expect(file.textContent).toContain('3 TUNES');
    expect(within(file).queryByRole('button', { name: /^Play/ })).toBeNull();
    await act(async () => fireEvent.click(within(file).getByRole('button', { name: 'Commando: show its 3 tunes' })));
    const tunes = await within(retroPanel()).findByRole('list', { name: 'Commando tunes' });
    expect(within(tunes).getAllByRole('listitem').map((li) => li.querySelector('.station-row__name')!.textContent)).toEqual(['Commando Theme', 'High Score', 'Game Over']);
    fireEvent.click(within(tunes).getByRole('button', { name: 'Play High Score' }));
    expect(engine.playList).toHaveBeenCalledWith([expect.objectContaining({ id: 'retro:commando-2' })]);
    fireEvent.click(within(retroPanel()).getByRole('button', { name: /Results/ }));
    expect(within(retroPanel()).getByRole('list', { name: 'C64 results' })).toBeTruthy();
  });

  it('empty and failed searches have their own states', async () => {
    const nes = testSource('nes', NES_TRACKS);
    renderApp();
    fireEvent.click(systemTab('NES'));
    expect(within(retroPanel()).getByText('SEARCH NES MUSIC')).toBeTruthy();
    await typeSearch('zelda');
    expect(within(retroPanel()).getByText('NO MATCHES')).toBeTruthy();
    nes.search.mockRejectedValueOnce(new Error('The archive could not be reached.'));
    await typeSearch('wily');
    expect(within(retroPanel()).getByText('SEARCH FAILED')).toBeTruthy();
    expect(within(retroPanel()).getByText('The archive could not be reached.')).toBeTruthy();
  });
});
