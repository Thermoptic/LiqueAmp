// The main menu: CONTROL PANEL directly under SETTINGS.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useFriends } from '../../stores/friendsStore';

afterEach(cleanup);

function renderMenu(at: string) {
  const menu = (
    <>
      <Sidebar />
      <BottomNav />
    </>
  );
  // the menu on every path, so the active state can be checked wherever it is shown
  const router = createMemoryRouter([{ path: '*', element: menu }], { initialEntries: [at] });
  render(<RouterProvider router={router} />);
  return router;
}

const mainMenu = () => screen.getAllByRole('navigation', { name: 'Main' })[0]!;

describe('main menu — Control Panel', () => {
  it('lists CONTROL PANEL directly below SETTINGS; the other items are unchanged', () => {
    renderMenu('/');
    const items = within(mainMenu()).getAllByRole('link').map((a) => a.textContent);
    expect(items).toEqual(['Now Playing', 'Browse', 'Playlists', 'Favourites', 'History', 'Settings', 'Control Panel']);
    const control = within(mainMenu()).getByRole('link', { name: 'Control Panel' });
    expect(control.className).toBe(within(mainMenu()).getByRole('link', { name: 'Settings' }).className.replace(' active', ''));
    expect(control.getAttribute('href')).toBe('/control');
  });

  it('opens /control; Settings still opens /settings', async () => {
    const router = renderMenu('/');
    await act(async () => fireEvent.click(within(mainMenu()).getByRole('link', { name: 'Control Panel' })));
    expect(router.state.location.pathname).toBe('/control');
    await act(async () => fireEvent.click(within(mainMenu()).getByRole('link', { name: 'Settings' })));
    expect(router.state.location.pathname).toBe('/settings');
  });

  it('is marked active on /control (and its sections) from the route, and only there', () => {
    renderMenu('/control/themes');
    const control = within(mainMenu()).getByRole('link', { name: 'Control Panel' });
    expect(control.getAttribute('aria-current')).toBe('page');
    expect(control.classList.contains('active')).toBe(true);
    expect(within(mainMenu()).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBeNull();
    cleanup();
    renderMenu('/settings');
    expect(within(mainMenu()).getByRole('link', { name: 'Control Panel' }).getAttribute('aria-current')).toBeNull();
    expect(within(mainMenu()).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
  });

  it('is a keyboard-focusable link', () => {
    renderMenu('/');
    const control = within(mainMenu()).getByRole('link', { name: 'Control Panel' });
    control.focus();
    expect(document.activeElement).toBe(control);
  });

  it('the six-slot mobile bar is unchanged (mobile reaches /control from Settings)', () => {
    renderMenu('/');
    const bottom = screen.getAllByRole('navigation', { name: 'Main' })[1]!;
    expect(within(bottom).getAllByRole('link')).toHaveLength(6);
  });

  it('navigating to /control keeps an active Friend Lique as it is', async () => {
    const active = { userId: 'bob', username: 'Bob', source: 'cloud' as const };
    useFriends.setState({ active });
    const router = renderMenu('/');
    await act(async () => fireEvent.click(within(mainMenu()).getByRole('link', { name: 'Control Panel' })));
    expect(router.state.location.pathname).toBe('/control');
    expect(useFriends.getState().active).toEqual(active);
    useFriends.setState({ active: null });
  });
});
