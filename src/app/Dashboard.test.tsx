// Checkpoint 7: FRIEND LIQUES fills the fourth lower slot of Home; every
// other Home region is still there and still works without an account.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IDBFactory } from 'fake-indexeddb';

vi.mock('../services/playback/engine', () => ({
  getEngine: () => ({ enqueue: vi.fn(), playEntry: vi.fn(), playItem: vi.fn(), toggle: vi.fn(), next: vi.fn(), previous: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), subscribe: () => () => undefined }),
}));

import { Dashboard } from './Dashboard';
import { createLocalAccountProvider } from '../services/account/account';
import { resetDbForTests } from '../services/storage/db';
import { MY_LIQUE, setActiveScope } from '../services/storage/scope';
import { useAccount } from '../stores/accountStore';
import { useFriends } from '../stores/friendsStore';
import { useQueue } from '../stores/queueStore';
import type { MediaItem } from '../types/media';

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
});
afterEach(cleanup);

describe('Home with FRIEND LIQUES (checkpoint 7)', () => {
  it('11. keeps every Home region; FRIEND LIQUES sits in .area-actions next to Station Info', () => {
    const { container } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    const lower = container.querySelector('.area-lower')!;
    const slots = Array.from(lower.children).map((el) => Array.from(el.classList).find((c) => c.startsWith('area-') && c !== 'area-controls'));
    expect(slots).toEqual(['area-library', 'area-queue', 'area-station', 'area-actions', 'area-player', 'area-appearance', 'area-visualizer']);
    expect(within(lower.querySelector('.area-actions') as HTMLElement).getByRole('heading', { name: 'Friend Liques' })).toBeTruthy();
    for (const name of ['Station Info', /^Queue/]) expect(screen.getByRole('heading', { name })).toBeTruthy();
    expect(container.querySelector('.area-main')).toBeTruthy(); // Now Playing
    expect(container.querySelector('.area-radio')).toBeTruthy(); // Browse
    expect(screen.queryByText(/quick actions/i)).toBeNull();
  });

  it('11b. without an account the rest of Home keeps working (the queue panel adds and removes)', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('ACCOUNT REQUIRED')).toBeTruthy();
    const queue = screen.getByRole('heading', { name: /^Queue/ }).closest('section')!;
    expect(within(queue).getByText('QUEUE EMPTY')).toBeTruthy();
    const item: MediaItem = { id: 'm1', provider: 'direct', title: 'Night Drive', sourceUrl: 'https://files.example/n.mp3', playbackType: 'direct', createdAt: '', updatedAt: '' };
    act(() => useQueue.getState().add([item]));
    fireEvent.click(within(queue).getByRole('button', { name: 'Remove Night Drive from queue' }));
    expect(within(queue).getByText('QUEUE EMPTY')).toBeTruthy();
  });
});
