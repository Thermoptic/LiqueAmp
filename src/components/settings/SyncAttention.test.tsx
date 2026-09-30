// When saving the Lique to the account stops and needs the user, it shows
// everywhere: the status bar (linking to Settings › Account), a marker on
// Settings in both menus, and a one-time message.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { StatusBar } from '../layout/StatusBar';
import { Sidebar } from '../navigation/Sidebar';
import { BottomNav } from '../navigation/BottomNav';
import { syncAttention, useAccount, type SyncView } from '../../stores/accountStore';
import { useUi } from '../../stores/uiStore';
import { SyncAttentionNotice } from './SyncAttentionNotice';

const signedIn = { status: 'signed-in' as const, session: { user: { userId: 'u1', username: 'Thermoptic' }, authMethod: 'email' as const } };

function renderApp() {
  const ui = (
    <>
      <Sidebar />
      <BottomNav />
      <StatusBar />
      <SyncAttentionNotice />
    </>
  );
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
  return router;
}

const accountItem = () => screen.getByText(/^ACCOUNT:/);
const [sidebar, bottom] = [() => screen.getAllByRole('navigation', { name: 'Main' })[0]!, () => screen.getAllByRole('navigation', { name: 'Main' })[1]!];
const setSync = (sync: SyncView) => act(() => useAccount.setState({ sync }));

beforeEach(() => {
  useAccount.setState({ state: signedIn, sync: { state: 'synced', at: '' } });
  useUi.setState({ toasts: [] });
});
afterEach(cleanup);

describe('sync attention', () => {
  it('while syncing normally: no marker, no message, the status bar names the account', () => {
    renderApp();
    expect(accountItem().textContent).toBe('ACCOUNT: @Thermoptic');
    expect(within(sidebar()).getByRole('link', { name: 'Settings' })).toBeTruthy();
    expect(document.querySelector('.sync-marker')).toBeNull();
    expect(useUi.getState().toasts).toEqual([]);
    setSync({ state: 'syncing' });
    expect(accountItem().textContent).toBe('ACCOUNT: @Thermoptic · SYNCING…');
  });

  it('this device has its own Lique: CHOOSE PROFILE everywhere, linking to Settings', async () => {
    const router = renderApp();
    setSync({ state: 'resolve-local' });
    const item = accountItem();
    expect(item.textContent).toBe('ACCOUNT: @Thermoptic · CHOOSE PROFILE');
    expect(item.closest('.status')!.classList.contains('status--warn')).toBe(true);
    expect(item.tagName).toBe('A');
    expect(item.getAttribute('title')).toContain('Choose which one to keep in Settings › Account');
    // both menus mark Settings, and say so to screen readers
    expect(within(sidebar()).getByRole('link', { name: 'Settings, sync needs you' })).toBeTruthy();
    expect(within(bottom()).getByRole('link', { name: 'Settings, sync needs you' })).toBeTruthy();
    expect(document.querySelectorAll('.sync-marker')).toHaveLength(2);
    // said once, wherever the user is
    expect(useUi.getState().toasts.map((t) => [t.kind, t.message])).toEqual([['error', syncAttention({ state: 'resolve-local' })!.message]]);
    await act(async () => fireEvent.click(item));
    expect(router.state.location.pathname).toBe('/settings');
  });

  it('each stop has its own words; an error is shown in the error colour', () => {
    renderApp();
    const cases: Array<[SyncView, string]> = [
      [{ state: 'conflict' }, 'CHOOSE PROFILE'],
      [{ state: 'needs-review', findings: [] }, 'SYNC PAUSED'],
      [{ state: 'blocked-other-account' }, 'NOT SYNCED'],
      [{ state: 'error', message: 'The server did not answer.' }, 'SYNC ERROR'],
    ];
    for (const [sync, label] of cases) {
      setSync(sync);
      expect(accountItem().textContent).toBe(`ACCOUNT: @Thermoptic · ${label}`);
    }
    expect(accountItem().closest('.status')!.classList.contains('status--error')).toBe(true);
    expect(useUi.getState().toasts.at(-1)!.message).toContain('The server did not answer.');
  });

  it('the message is not repeated while the same stop lasts, and the marker goes when it is resolved', () => {
    renderApp();
    setSync({ state: 'resolve-local' });
    setSync({ state: 'resolve-local' });
    expect(useUi.getState().toasts).toHaveLength(1);
    setSync({ state: 'synced', at: '' });
    expect(document.querySelector('.sync-marker')).toBeNull();
    expect(accountItem().textContent).toBe('ACCOUNT: @Thermoptic');
  });

  it('logged out: nothing about sync (the account item says NOT LOGGED IN, as before)', () => {
    useAccount.setState({ state: { status: 'signed-out' }, sync: { state: 'error', message: 'x' } });
    renderApp();
    expect(accountItem().textContent).toBe('ACCOUNT: NOT LOGGED IN');
    expect(document.querySelector('.sync-marker')).toBeNull();
    expect(useUi.getState().toasts).toEqual([]);
  });
});
