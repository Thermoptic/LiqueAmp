// The ACCOUNT item of the status bar: same form as ANALYSIS / NETWORK / STORAGE.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useAccount } from '../../stores/accountStore';
import { StatusBar } from './StatusBar';

afterEach(cleanup);

const signedIn = (username: string) => ({ status: 'signed-in' as const, session: { user: { userId: `id-${username}`, username }, authMethod: 'google' as const } });

function renderBar() {
  return render(
    <MemoryRouter>
      <StatusBar />
    </MemoryRouter>,
  );
}

/** The status item holding `text`, with its tone and whether a separator comes right before it. */
function item(text: RegExp) {
  const label = screen.getByText(text);
  const status = label.closest('.status')!;
  return { text: label.textContent, tone: [...status.classList].find((c) => c.startsWith('status--')), separated: status.previousElementSibling?.classList.contains('status-bar__sep') ?? false };
}

describe('status bar — ACCOUNT', () => {
  it('logged out: ● ACCOUNT: NOT LOGGED IN with the off colour, after STORAGE with a separator', () => {
    act(() => useAccount.setState({ state: { status: 'signed-out' } }));
    const { container } = renderBar();
    expect(item(/^ACCOUNT:/)).toEqual({ text: 'ACCOUNT: NOT LOGGED IN', tone: 'status--idle', separated: true });
    expect(item(/^ANALYSIS:/).tone).toBe('status--idle'); // the same off colour as ANALYSIS: OFF
    const labels = [...container.querySelectorAll('.status')].map((s) => s.textContent!.split(':')[0]);
    expect(labels.slice(-3)).toEqual(['NETWORK', 'STORAGE', 'ACCOUNT']);
  });

  it('logged in: ● ACCOUNT: @username with the on colour; nothing else about the account', () => {
    act(() => useAccount.setState({ state: signedIn('Thermoptic') }));
    renderBar();
    expect(item(/^ACCOUNT:/)).toEqual({ text: 'ACCOUNT: @Thermoptic', tone: 'status--ok', separated: true });
    expect(screen.getByText(/^ACCOUNT:/).textContent).not.toMatch(/id-|google|@.*@/i);
  });

  it('follows logout, login and account switches at once', () => {
    act(() => useAccount.setState({ state: signedIn('Thermoptic') }));
    renderBar();
    act(() => useAccount.setState({ state: { status: 'signed-out' } }));
    expect(item(/^ACCOUNT:/)).toMatchObject({ text: 'ACCOUNT: NOT LOGGED IN', tone: 'status--idle' });
    act(() => useAccount.setState({ state: signedIn('Johan') }));
    expect(item(/^ACCOUNT:/)).toMatchObject({ text: 'ACCOUNT: @Johan', tone: 'status--ok' });
    act(() => useAccount.setState({ state: signedIn('Alice') }));
    expect(item(/^ACCOUNT:/)).toMatchObject({ text: 'ACCOUNT: @Alice', tone: 'status--ok' });
  });

  it('choosing a username (not finished yet) still counts as not logged in', () => {
    act(() => useAccount.setState({ state: { status: 'needs-username', userId: 'x', authMethod: 'github' } }));
    renderBar();
    expect(item(/^ACCOUNT:/)).toMatchObject({ text: 'ACCOUNT: NOT LOGGED IN', tone: 'status--idle' });
  });
});
