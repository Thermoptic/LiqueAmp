import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountError, accountError, createLocalAccountProvider, type AccountProvider, type AccountState } from './account';
import { authCallbackUrl, CloudConfigError, readCloudConfig } from './config';
import { checkUsername, cleanUsername, usernameKey } from './username';
import { useAccount } from '../../stores/accountStore';
import { AccountSection } from '../../components/settings/AccountSection';
import { UsernameSetupDialog } from '../../components/settings/UsernameSetupDialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(cleanup);

describe('the local (no-account) provider', () => {
  it('is always signed out; signing in explains that accounts are unavailable; signing out is harmless', async () => {
    const p = createLocalAccountProvider();
    expect(p.available).toBe(false);
    expect(await p.getState()).toEqual({ status: 'signed-out' });
    expect(await p.getSession()).toBeNull();
    for (const call of [() => p.signIn({ method: 'google' }), () => p.signUp({ method: 'github' }), () => p.claimUsername('johan'), () => p.deleteAccount()]) {
      await expect(call()).rejects.toMatchObject({ code: 'unavailable' });
    }
    await expect(p.signOut()).resolves.toBeUndefined();
  });
});

describe('usernames (D6)', () => {
  it.each([
    ['johan', true],
    ['Johan', true],
    ['musicfan', true],
    ['DJ2000', true],
    ['@alice', true], // a typed @ is not part of the name
    ['  bob  ', true],
    ['', false],
    ['ab', false],
    ['a'.repeat(21), false],
    ['johan b', false],
    ['johan_b', false],
    ['jöhan', false],
    ['jo.han', false],
    ['admin', false],
    ['LiqueAmp', false],
  ])('%j → %s', (input, ok) => {
    expect(checkUsername(input).ok).toBe(ok);
  });

  it('explains each problem in plain words', () => {
    const problem = (s: string) => {
      const c = checkUsername(s);
      return c.ok ? null : c.problem;
    };
    expect(problem('')).toBe('empty');
    expect(problem('ab')).toBe('too-short');
    expect(problem('a'.repeat(21))).toBe('too-long');
    expect(problem('a b')).toBe('invalid-characters');
    expect(problem('Admin')).toBe('reserved');
  });

  it('compares case-insensitively and keeps the typed case', () => {
    expect(usernameKey('Johan')).toBe(usernameKey('johan'));
    expect(usernameKey('@JOHAN ')).toBe('johan');
    expect(cleanUsername('@Johan')).toBe('Johan');
    expect(checkUsername('Johan')).toEqual({ ok: true, username: 'Johan' });
  });
});

describe('cloud configuration (public values only)', () => {
  it('no values → no cloud: LiqueAmp runs without accounts', () => {
    expect(readCloudConfig({})).toBeNull();
  });

  it('accepts the project URL and the publishable key', () => {
    expect(readCloudConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xyz' })).toEqual({ url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_xyz' });
  });

  it('refuses a secret key, half a configuration and plain http', () => {
    const serviceRole = `x.${btoa(JSON.stringify({ role: 'service_role' }))}.y`;
    expect(() => readCloudConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_123' })).toThrow(CloudConfigError);
    expect(() => readCloudConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: serviceRole })).toThrow(/secret/);
    expect(() => readCloudConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toThrow(/Both/);
    expect(() => readCloudConfig({ VITE_SUPABASE_URL: 'http://abc.example', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toThrow(/https/);
  });

  it('the OAuth callback includes the base path the app is served from', () => {
    expect(authCallbackUrl('https://thermoptic.github.io', '/LiqueAmp/')).toBe('https://thermoptic.github.io/LiqueAmp/auth/callback');
    expect(authCallbackUrl('http://localhost:5173', '/LiqueAmp')).toBe('http://localhost:5173/LiqueAmp/auth/callback');
  });
});

describe('Settings › Account and the username dialog', () => {
  let emit: (s: AccountState) => void = () => undefined;
  const signIns: string[] = [];
  function fake(initial: AccountState, claim?: (name: string) => Promise<void>): AccountProvider {
    let state = initial;
    return {
      ...createLocalAccountProvider(),
      id: 'fake',
      available: true,
      getState: async () => state,
      signIn: async ({ method }) => {
        signIns.push(method);
      },
      claimUsername: async (name) => {
        await claim?.(name);
        state = { status: 'signed-in', session: { user: { userId: 'u-1', username: name }, authMethod: 'google' } };
        return state.session;
      },
      signOut: async () => emit({ status: 'signed-out' }),
      onChange: (l) => {
        emit = l;
        return () => undefined;
      },
    };
  }

  beforeEach(async () => {
    signIns.length = 0;
    await useAccount.getState().init(createLocalAccountProvider());
  });

  it('without accounts: "Not logged in", Google/GitHub buttons disabled, and an explanation', () => {
    render(<AccountSection />);
    expect(screen.getByText('Not logged in')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Continue with GitHub' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/not available in this version/)).toBeTruthy();
  });

  it('logged out with accounts: the buttons start Google or GitHub sign-in', async () => {
    await act(() => useAccount.getState().init(fake({ status: 'signed-out' })));
    render(<AccountSection />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' })));
    expect(signIns).toEqual(['github', 'google']);
  });

  it('logged in: @username, "Logged in with Google", Log out; logging out shows "Not logged in"', async () => {
    await act(() => useAccount.getState().init(fake({ status: 'signed-in', session: { user: { userId: 'u-1', username: 'johan' }, authMethod: 'google' } })));
    const { container } = render(<AccountSection />);
    expect(container.querySelector('.account__username')?.textContent).toBe('@johan');
    expect(screen.getByText('Logged in with Google')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Log out' })));
    expect(screen.getByText('Not logged in')).toBeTruthy();
    expect(useAccount.getState().error).toBeNull(); // a deliberate log out is not an "expired session"
  });

  it('an OAuth error in the callback URL is shown in plain words', async () => {
    window.history.replaceState(null, '', '/LiqueAmp/auth/callback?error=access_denied&error_description=The+user+denied');
    await act(() => useAccount.getState().init(fake({ status: 'signed-out' })));
    window.history.replaceState(null, '', '/');
    render(<AccountSection />);
    expect(screen.getByText('Sign-in was cancelled.')).toBeTruthy();
  });

  it('first login: the dialog checks while typing, reports a taken username, and signs in with the chosen one', async () => {
    let attempts = 0;
    await act(() =>
      useAccount.getState().init(
        fake({ status: 'needs-username', userId: 'u-1', authMethod: 'github' }, async () => {
          if (attempts++ === 0) throw accountError('username-taken');
        }),
      ),
    );
    render(<UsernameSetupDialog />);
    expect(screen.getByText('Welcome to LiqueAmp')).toBeTruthy();
    const input = screen.getByLabelText('Choose your username');
    fireEvent.change(input, { target: { value: 'jo han' } });
    expect(screen.getByRole('alert').textContent).toMatch(/letters.*digits/i);

    fireEvent.change(input, { target: { value: 'Johan' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/already taken/));

    fireEvent.change(input, { target: { value: 'Johan2' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    await waitFor(() => expect(useAccount.getState().state).toMatchObject({ status: 'signed-in', session: { user: { username: 'Johan2' } } }));
  });

  it('account errors are LiqueAmp messages, never raw backend text', () => {
    const e = accountError('offline', new Error('FetchError: ECONNREFUSED 127.0.0.1:54321'));
    expect(e).toBeInstanceOf(AccountError);
    expect(e.message).not.toMatch(/ECONNREFUSED|Fetch/);
  });
});
