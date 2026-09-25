// Checkpoint 7: the FRIEND LIQUES panel on Home, end to end against the
// in-memory Supabase stand-in (its RLS rules match the friends migration).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createFakeSupabase } from '../../test/fakeSupabase';
import { createSupabaseAccountProvider } from '../../services/cloud/supabaseAccount';
import { createSupabaseFriendDirectory } from '../../services/cloud/supabaseFriends';
import { createSupabaseProfileStore } from '../../services/cloud/supabaseProfiles';
import { ACCOUNT_MESSAGES, accountError, createLocalAccountProvider } from '../../services/account/account';
import type { ProfileSummary } from '../../services/profile/summary';
import { friendError, type FriendDirectory } from '../../services/friends/friends';
import { useAccount } from '../../stores/accountStore';
import { useFriends } from '../../stores/friendsStore';
import { useUi } from '../../stores/uiStore';
import { FriendLiquesPanel } from './FriendLiquesPanel';

const ME = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const CALLBACK = 'https://thermoptic.github.io/LiqueAmp/auth/callback';
type Fake = ReturnType<typeof createFakeSupabase>;

const bobSummary: ProfileSummary = {
  username: 'Bob',
  revision: 4,
  updatedAt: '2026-09-25T10:00:00.000Z',
  theme: { id: 'base16-nord', name: 'Nord', builtIn: true },
  visualizer: { type: 'waveform', enabled: true },
  counts: { playlists: 3, categories: 2, streams: 17, stations: 5 },
};

/** A full profile with private parts that must never show up in a preview. */
const bobProfile = (owner: string) => ({
  format: 'liqueamp-profile',
  meta: { schemaVersion: 1, ownerUserId: owner },
  data: { who: 'bob', history: [{ id: 'h1', title: 'SECRET-HISTORY' }], queue: ['SECRET-QUEUE'] },
});

async function signUp(fake: Fake, id: string, username: string, summary?: ProfileSummary, text?: string) {
  fake.signInAs(id, 'github');
  await createSupabaseAccountProvider(fake.client, { redirectTo: () => CALLBACK }).claimUsername(username);
  if (summary) await createSupabaseProfileStore(fake.client).upload(id, { text: text ?? JSON.stringify(bobProfile(id)), summary, expectedRevision: 0 });
}

/** Bob (with a Lique) and Carol (without) exist; I am signed in as @johan. */
async function signedInWorld(options: { directory?: (d: FriendDirectory) => FriendDirectory } = {}) {
  const fake = createFakeSupabase();
  await signUp(fake, BOB, 'Bob', bobSummary);
  await signUp(fake, CAROL, 'Carol');
  await signUp(fake, ME, 'johan');
  const directory = createSupabaseFriendDirectory(fake.client);
  useFriends.getState().setDirectory(options.directory ? options.directory(directory) : directory);
  await act(() => useAccount.getState().init(createSupabaseAccountProvider(fake.client, { redirectTo: () => CALLBACK })));
  return { fake, directory };
}

const renderPanel = () =>
  render(
    <MemoryRouter>
      <FriendLiquesPanel />
    </MemoryRouter>,
  );

const panel = () => screen.getByRole('region', { name: 'Friend Liques' });
const list = () => screen.findByRole('list', { name: 'Friend Liques' });

async function addFriend(username: string) {
  fireEvent.click(within(panel()).getAllByRole('button', { name: 'Add Friend' })[0]!);
  const dialog = screen.getByRole('dialog', { name: 'Add Friend', hidden: true });
  fireEvent.change(within(dialog).getByLabelText('Username'), { target: { value: username } });
  await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Add Friend', hidden: true })));
  return dialog;
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

beforeEach(() => {
  localStorage.clear();
  useUi.setState({ toasts: [] });
  useFriends.getState().setDirectory(null);
});
afterEach(async () => {
  cleanup();
  // the account provider reports auth changes on a timer; let them land in this test, not the next
  await act(() => new Promise((r) => setTimeout(r, 5)));
});

describe('FRIEND LIQUES panel (checkpoint 7)', () => {
  it('is the Home section named FRIEND LIQUES, in the .area-actions slot', async () => {
    await signedInWorld();
    renderPanel();
    expect(screen.getByRole('heading', { level: 2, name: 'Friend Liques' })).toBeTruthy(); // shown uppercase by .panel__title
    expect(panel().classList.contains('area-actions')).toBe(true);
    expect(screen.queryByText(/quick actions/i)).toBeNull();
  });

  it('1. signed out: explains that friends need an account; no Add Friend', async () => {
    const fake = createFakeSupabase();
    useFriends.getState().setDirectory(createSupabaseFriendDirectory(fake.client));
    await act(() => useAccount.getState().init(createSupabaseAccountProvider(fake.client, { redirectTo: () => CALLBACK })));
    renderPanel();
    expect(within(panel()).getByText('ACCOUNT REQUIRED')).toBeTruthy();
    expect(within(panel()).getByRole('link', { name: /Settings › Account/ }).getAttribute('href')).toBe('/settings');
    expect(within(panel()).queryByRole('button', { name: 'Add Friend' })).toBeNull();
  });

  it('1b. a build without accounts: the panel says so and the rest of LiqueAmp is unaffected', async () => {
    await act(() => useAccount.getState().init(createLocalAccountProvider()));
    renderPanel();
    expect(within(panel()).getByText('ACCOUNT REQUIRED')).toBeTruthy();
    expect(within(panel()).getByText(/works fully without one/)).toBeTruthy();
    expect(within(panel()).queryByRole('link')).toBeNull();
  });

  it('2. empty friend list: NO FRIEND LIQUES YET with an Add Friend button', async () => {
    await signedInWorld();
    renderPanel();
    expect(await within(panel()).findByText('NO FRIEND LIQUES YET')).toBeTruthy();
    expect(within(panel()).getAllByRole('button', { name: /Add Friend/ })).toHaveLength(2); // header icon + empty state
  });

  it('3. friend list: @username rows, sorted, without online/offline (no presence source yet)', async () => {
    const { directory } = await signedInWorld();
    await directory.add('carol');
    await directory.add('bob');
    renderPanel();
    const rows = within(await list()).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getAllByRole('button')[0]!.textContent)).toEqual(['@Bob', '@Carol']);
    expect(within(panel()).queryByText(/online|offline/i)).toBeNull();
  });

  it('4. add friend: exact username, case-insensitive; the row appears at once and a toast confirms', async () => {
    const { fake } = await signedInWorld();
    renderPanel();
    await within(panel()).findByText('NO FRIEND LIQUES YET');
    const dialog = await addFriend('@BOB');
    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(false));
    expect(within(await list()).getByRole('button', { name: '@Bob' })).toBeTruthy();
    expect(useUi.getState().toasts.map((t) => t.message)).toEqual(['Added @Bob to your Friend Liques.']);
    expect(fake.tables.friendships).toEqual([expect.objectContaining({ user_id: ME, friend_id: BOB })]);
  });

  it.each([
    ['bo b', 'That is not a valid username.'],
    ['Nobody', 'No one has that username.'],
    ['Johan', 'That is your own username.'],
  ])('5. add friend errors: "%s" → %s', async (input, message) => {
    await signedInWorld();
    renderPanel();
    await within(panel()).findByText('NO FRIEND LIQUES YET');
    const dialog = await addFriend(input);
    expect(within(dialog).getByRole('alert').textContent).toBe(message);
    expect((dialog as HTMLDialogElement).open).toBe(true); // stays open to correct the name
  });

  it('5b. add friend errors: already added, network failure, session ended', async () => {
    const { fake, directory } = await signedInWorld();
    await directory.add('Bob');
    renderPanel();
    await list();
    let dialog = await addFriend('bob');
    expect(within(dialog).getByRole('alert').textContent).toBe('You have already added them.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel', hidden: true }));

    fake.setOffline(true);
    dialog = await addFriend('Carol');
    expect(within(dialog).getByRole('alert').textContent).toMatch(/offline|connection|reach/i);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel', hidden: true }));

    fake.setOffline(false);
    fake.expireSession(); // the session ends: the panel falls back to the signed-out state
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(within(panel()).getByText('ACCOUNT REQUIRED')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Add Friend', hidden: true })).toBeNull();
  });

  it.each([
    [friendError('not-signed-in'), 'Sign in to add friends.'],
    [accountError('session-expired'), ACCOUNT_MESSAGES['session-expired']],
  ])('5c. add friend errors from the backend: %s', async (failure, message) => {
    await signedInWorld({ directory: (d) => ({ ...d, add: () => Promise.reject(failure) }) });
    renderPanel();
    await within(panel()).findByText('NO FRIEND LIQUES YET');
    const dialog = await addFriend('Carol');
    expect(within(dialog).getByRole('alert').textContent).toBe(message);
  });

  it('6. remove friend: asks first; Cancel keeps them, Remove removes them', async () => {
    const { fake, directory } = await signedInWorld();
    await directory.add('Bob');
    renderPanel();
    fireEvent.click(within(await list()).getByRole('button', { name: 'Remove @Bob' }));
    let dialog = screen.getByRole('dialog', { name: 'Remove Friend', hidden: true });
    expect(dialog.textContent).toContain('@Bob');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel', hidden: true }));
    expect(fake.tables.friendships).toHaveLength(1);

    fireEvent.click(within(await list()).getByRole('button', { name: 'Remove @Bob' }));
    dialog = screen.getByRole('dialog', { name: 'Remove Friend', hidden: true });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Remove', hidden: true })));
    expect(fake.tables.friendships).toEqual([]);
    expect(await within(panel()).findByText('NO FRIEND LIQUES YET')).toBeTruthy();
  });

  it('7–8. selecting a friend opens the preview with data from their Lique', async () => {
    const { directory } = await signedInWorld();
    await directory.add('Bob');
    renderPanel();
    await act(async () => fireEvent.click(within(await list()).getByRole('button', { name: '@Bob' })));
    // the preview takes the list's place in the small panel
    expect(screen.queryByRole('list', { name: 'Friend Liques' })).toBeNull();
    const preview = screen.getByRole('region', { name: '@Bob’s Lique' });
    await within(preview).findByText('Theme');
    const facts = Object.fromEntries(within(preview).getAllByRole('term').map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]));
    expect(facts).toEqual({ Theme: 'Nord', Visualizer: 'Waveform', Playlists: '3', Categories: '2', Streams: '17', Stations: '5' });
    // nothing personal from the profile
    expect(preview.textContent).not.toMatch(/SECRET|history|queue/i);
    // back to the list
    fireEvent.click(within(preview).getByRole('button', { name: 'Back to Friend Liques' }));
    expect(screen.queryByRole('region', { name: '@Bob’s Lique' })).toBeNull();
    expect(within(await list()).getByRole('button', { name: '@Bob' })).toBeTruthy();
  });

  it('9. the preview is read-only: labelled READ ONLY, no editing controls', async () => {
    const { directory } = await signedInWorld();
    await directory.add('Bob');
    renderPanel();
    await act(async () => fireEvent.click(within(await list()).getByRole('button', { name: '@Bob' })));
    const preview = screen.getByRole('region', { name: '@Bob’s Lique' });
    await within(preview).findByText('Theme');
    expect(within(preview).getByText('READ ONLY')).toBeTruthy();
    expect(within(preview).queryAllByRole('textbox')).toEqual([]);
    expect(within(preview).queryAllByRole('checkbox')).toEqual([]);
    const enabled = within(preview)
      .getAllByRole('button')
      .filter((b) => !(b as HTMLButtonElement).disabled)
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(enabled).toEqual(['Back to Friend Liques']);
  });

  it('10. ACTIVATE LIQUE exists but is disabled and changes nothing', async () => {
    const { fake, directory } = await signedInWorld();
    await directory.add('Bob');
    renderPanel();
    await act(async () => fireEvent.click(within(await list()).getByRole('button', { name: '@Bob' })));
    const preview = screen.getByRole('region', { name: '@Bob’s Lique' });
    await within(preview).findByText('Theme');
    const activate = within(preview).getByRole('button', { name: 'Activate Lique' }) as HTMLButtonElement;
    expect(activate.disabled).toBe(true);
    expect(within(preview).getByText('Coming later')).toBeTruthy();
    expect(activate.getAttribute('aria-describedby')).toBeTruthy();
    const before = JSON.stringify(fake.tables);
    fireEvent.click(activate);
    expect(JSON.stringify(fake.tables)).toBe(before);
    expect(useFriends.getState().selectedId).toBe(BOB);
  });

  it('preview states: no cloud Lique yet, and a Lique that cannot be read', async () => {
    const { fake, directory } = await signedInWorld();
    await directory.add('Carol');
    await directory.add('Bob');
    // Bob's stored summary and profile are unusable
    const bob = fake.tables.profiles.find((p) => p.user_id === BOB)!;
    bob.summary = { theme: 'nonsense' };
    renderPanel();
    await act(async () => fireEvent.click(within(await list()).getByRole('button', { name: '@Carol' })));
    expect(await screen.findByText('@Carol has no Lique in the cloud yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Friend Liques' }));
    await act(async () => fireEvent.click(within(await list()).getByRole('button', { name: '@Bob' })));
    const preview = screen.getByRole('region', { name: '@Bob’s Lique' });
    expect((await within(preview).findByRole('alert')).textContent).toBe('Preview unavailable: Their Lique could not be read.');
    expect(within(preview).getByRole('button', { name: /Try again/ })).toBeTruthy();
  });

  it('list error: a message and Try again, which recovers', async () => {
    const { fake } = await signedInWorld();
    fake.setOffline(true);
    renderPanel();
    const alert = await within(panel()).findByRole('alert');
    expect(alert.textContent).toMatch(/offline|connection|reach/i);
    fake.setOffline(false);
    await act(async () => fireEvent.click(within(panel()).getByRole('button', { name: /Try again/ })));
    expect(await within(panel()).findByText('NO FRIEND LIQUES YET')).toBeTruthy();
  });

  it('signing out clears the list; the next account never sees the previous one’s friends', async () => {
    const { directory } = await signedInWorld();
    await directory.add('Bob');
    renderPanel();
    await list();
    await act(() => useAccount.getState().signOut());
    expect(within(panel()).getByText('ACCOUNT REQUIRED')).toBeTruthy();
    expect(useFriends.getState().friends).toEqual([]);
    expect(screen.queryByText('@Bob')).toBeNull();
  });

  it('keyboard: rows are native buttons; opening moves focus to the preview, Back returns it to the row', async () => {
    const { directory } = await signedInWorld();
    await directory.add('Bob');
    await directory.add('Carol');
    renderPanel();
    let row = within(await list()).getByRole('button', { name: '@Carol' });
    row.focus();
    expect(row.tagName).toBe('BUTTON'); // Enter/Space activate it
    await act(async () => fireEvent.click(row));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3, name: '@Carol’s Lique' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Back to Friend Liques' })));
    row = within(await list()).getByRole('button', { name: '@Carol' });
    expect(document.activeElement).toBe(row);
  });
});
