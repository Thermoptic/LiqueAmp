import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { AccountUnavailableError, createLocalAccountProvider, type AccountProvider, type AccountState } from './account';
import { authCallbackUrl, CloudConfigError, readCloudConfig } from './config';
import { useAccount } from '../../stores/accountStore';
import { AccountSection } from '../../components/settings/AccountSection';

afterEach(cleanup);

describe('the local (no-account) provider', () => {
  it('is always signed out; sign-up and sign-in explain that accounts are unavailable; sign-out is harmless', async () => {
    const p = createLocalAccountProvider();
    expect(p.available).toBe(false);
    expect(await p.getSession()).toBeNull();
    expect(await p.getCurrentUser()).toBeNull();
    await expect(p.signIn({ method: 'anything' })).rejects.toBeInstanceOf(AccountUnavailableError);
    await expect(p.signUp({ username: 'johan', credentials: { method: 'anything' } })).rejects.toBeInstanceOf(AccountUnavailableError);
    await expect(p.deleteAccount()).rejects.toBeInstanceOf(AccountUnavailableError);
    await expect(p.signOut()).resolves.toBeUndefined();
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

  it('the auth callback includes the base path the app is served from', () => {
    expect(authCallbackUrl('https://thermoptic.github.io', '/LiqueAmp/')).toBe('https://thermoptic.github.io/LiqueAmp/auth/callback');
    expect(authCallbackUrl('http://localhost:5173', '/LiqueAmp')).toBe('http://localhost:5173/LiqueAmp/auth/callback');
    expect(authCallbackUrl('https://liqueamp.example', '/')).toBe('https://liqueamp.example/auth/callback');
  });
});

describe('account store and Settings › Account', () => {
  let emit: (s: AccountState) => void = () => undefined;
  const signedIn = (): AccountProvider => ({
    ...createLocalAccountProvider(),
    id: 'fake',
    available: true,
    getSession: async () => ({ user: { userId: 'u-1', username: 'johan' } }),
    signOut: async () => emit({ status: 'signed-out' }),
    onChange: (l) => {
      emit = l;
      return () => undefined;
    },
  });

  beforeEach(async () => {
    await useAccount.getState().init(createLocalAccountProvider());
  });

  it('without accounts: "Not logged in", and the buttons say accounts are not available yet', () => {
    render(<AccountSection />);
    expect(screen.getByText('Not logged in')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Log in' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/not available in this version/)).toBeTruthy();
  });

  it('logged in: shows @username and Log out; logging out returns to "Not logged in"', async () => {
    await act(() => useAccount.getState().init(signedIn()));
    render(<AccountSection />);
    expect(screen.getByText('Logged in')).toBeTruthy();
    expect(screen.getByText('@johan')).toBeTruthy();
    await act(async () => {
      screen.getByRole('button', { name: 'Log out' }).click();
    });
    expect(screen.getByText('Not logged in')).toBeTruthy();
    expect(useAccount.getState().state).toEqual({ status: 'signed-out' });
  });
});
