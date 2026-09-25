// Email + password as the third sign-in method, end to end: the Account UI,
// the account store, the Supabase provider and a stand-in for Supabase Auth
// that behaves like the real project (email confirmation required).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createFakeSupabase } from '../../test/fakeSupabase';
import { createSupabaseAccountProvider } from '../cloud/supabaseAccount';
import { createSupabaseFriendDirectory } from '../cloud/supabaseFriends';
import { useAccount } from '../../stores/accountStore';
import { useFriends } from '../../stores/friendsStore';
import { AccountSection } from '../../components/settings/AccountSection';
import { UsernameSetupDialog } from '../../components/settings/UsernameSetupDialog';
import { SetNewPasswordDialog } from '../../components/settings/EmailAuthDialog';
import { FriendLiquesPanel } from '../../components/friends/FriendLiquesPanel';

const CALLBACK = 'https://thermoptic.github.io/LiqueAmp/auth/callback';
const EMAIL = 'johan@example.com';
const PASSWORD = 'correct-horse-battery';
type Fake = ReturnType<typeof createFakeSupabase>;

const settle = () => act(() => new Promise((r) => setTimeout(r, 5)));
const providerFor = (fake: Fake) => createSupabaseAccountProvider(fake.client, { redirectTo: () => CALLBACK });

async function start(fake: Fake) {
  await act(() => useAccount.getState().init(providerFor(fake)));
  return render(
    <MemoryRouter>
      <AccountSection />
      <UsernameSetupDialog />
      <SetNewPasswordDialog />
    </MemoryRouter>,
  );
}

const dialog = (name: string | RegExp) => screen.getByRole('dialog', { name, hidden: true });
const field = (d: HTMLElement, label: string) => within(d).getByLabelText(label) as HTMLInputElement;
const type = (d: HTMLElement, label: string, value: string) => fireEvent.change(field(d, label), { target: { value } });
const click = (d: HTMLElement, name: string | RegExp) => act(async () => fireEvent.click(within(d).getByRole('button', { name, hidden: true })));
const alertIn = (d: HTMLElement) => within(d).getByRole('alert').textContent;

async function fillSignUp(email: string, password: string, confirm = password) {
  fireEvent.click(screen.getByRole('button', { name: 'Create account with Email' }));
  const d = dialog('Create account with Email');
  type(d, 'Email', email);
  type(d, 'Password', password);
  type(d, 'Confirm password', confirm);
  await click(d, 'Create account');
  return d;
}

async function fillSignIn(email: string, password: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Log in with Email' }));
  const d = dialog('Log in with Email');
  type(d, 'Email', email);
  type(d, 'Password', password);
  await click(d, 'Log in');
  return d;
}

/** Everything the browser keeps for LiqueAmp: a password must never be in it. */
function browserStorage(): string {
  const dump = (s: Storage) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`).join('\n');
  return `${dump(localStorage)}\n${dump(sessionStorage)}`;
}

/** An email account with a username, signed out again. */
async function existingEmailAccount(fake: Fake, username = 'Johan') {
  const p = providerFor(fake);
  await p.signUp({ method: 'email', email: EMAIL, password: PASSWORD });
  fake.openConfirmationLink(EMAIL);
  await p.claimUsername(username);
  await p.signOut();
  await new Promise((r) => setTimeout(r, 5));
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
  sessionStorage.clear();
  useFriends.getState().setDirectory(null);
});
afterEach(async () => {
  cleanup();
  await settle(); // auth changes are reported on a timer; let them land in this test
});

describe('email sign-up', () => {
  it('1. validation: email format and a password are checked before anything is sent; password rules are Supabase’s', async () => {
    const fake = createFakeSupabase();
    await start(fake);
    let d = await fillSignUp('not-an-email', PASSWORD);
    expect(alertIn(d)).toBe('Enter a valid email address.');
    type(d, 'Email', EMAIL);
    type(d, 'Password', '');
    type(d, 'Confirm password', '');
    await click(d, 'Create account');
    expect(alertIn(d)).toBe('Choose a password.');
    expect(fake.emailsSent).toEqual([]);
    // Supabase's own rule and message (minimum length here)
    type(d, 'Password', 'abc');
    type(d, 'Confirm password', 'abc');
    await click(d, 'Create account');
    expect(alertIn(d)).toBe('Password should be at least 6 characters.');
    d = dialog('Create account with Email');
    expect(fake.emailAccount(EMAIL)).toBeUndefined();
  });

  it('2. the passwords must match', async () => {
    const fake = createFakeSupabase();
    await start(fake);
    const d = await fillSignUp(EMAIL, PASSWORD, `${PASSWORD}x`);
    expect(alertIn(d)).toBe('The passwords don’t match.');
    expect(fake.emailAccount(EMAIL)).toBeUndefined();
  });

  it('3–4. success with confirmation required: "Check your email", not logged in, link returns to the callback URL', async () => {
    const fake = createFakeSupabase();
    await start(fake);
    const d = await fillSignUp(`  ${EMAIL} `, PASSWORD);
    expect(dialog('Check your email').textContent).toContain(EMAIL);
    expect(d.textContent).toContain('You are not logged in yet');
    expect(useAccount.getState().state).toEqual({ status: 'signed-out' });
    expect(screen.getByText('Not logged in')).toBeTruthy();
    expect(fake.emailsSent).toEqual([{ kind: 'confirm', email: EMAIL, redirectTo: CALLBACK }]);
    expect(browserStorage()).not.toContain(PASSWORD);
    expect(browserStorage()).not.toContain(EMAIL);
    await click(d, 'Done');
    expect((d as HTMLDialogElement).open).toBe(false);
  });

  it('5. opening the confirmation link → the same username onboarding as Google/GitHub → "Logged in with Email"', async () => {
    const fake = createFakeSupabase();
    const { container } = await start(fake);
    await fillSignUp(EMAIL, PASSWORD);
    await click(dialog('Check your email'), 'Done');
    // an hour later, in this browser: the link comes back through the callback URL
    const pending = JSON.parse(localStorage.getItem('liqueamp.authMethod.pending')!) as { startedAt: number };
    localStorage.setItem('liqueamp.authMethod.pending', JSON.stringify({ ...pending, startedAt: pending.startedAt - 60 * 60 * 1000 }));
    act(() => fake.openConfirmationLink(EMAIL));
    await settle();
    expect(useAccount.getState().state).toMatchObject({ status: 'needs-username', authMethod: 'email' });
    const welcome = dialog('Welcome to LiqueAmp');
    type(welcome, 'Choose your username', 'Johan');
    await click(welcome, 'Continue');
    await waitFor(() => expect(container.querySelector('.account__username')?.textContent).toBe('@Johan'));
    expect(screen.getByText('Logged in with Email')).toBeTruthy();
    // a normal LiqueAmp account: public.users, same as OAuth users
    expect(fake.tables.users).toEqual([expect.objectContaining({ id: fake.emailAccount(EMAIL)!.userId, username: 'Johan' })]);
  });

  it('5b. with confirmation off, the session comes at once and onboarding starts right away', async () => {
    const fake = createFakeSupabase({ confirmEmail: false });
    await start(fake);
    const d = await fillSignUp(EMAIL, PASSWORD);
    expect((d as HTMLDialogElement).open).toBe(false);
    expect(useAccount.getState().state).toMatchObject({ status: 'needs-username', authMethod: 'email' });
    expect(dialog('Welcome to LiqueAmp')).toBeTruthy();
  });

  it('an address that is already registered: a clear message (Supabase sends no email)', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    await start(fake);
    const d = await fillSignUp(EMAIL.toUpperCase(), 'another-password');
    expect(alertIn(d)).toBe('This email is already registered. Log in, or use “Forgot password?”.');
    expect(fake.emailsSent.filter((m) => m.kind === 'confirm')).toHaveLength(1); // only the first sign-up's
  });
});

describe('email log-in', () => {
  it('6. an existing email account: username restored, no onboarding, "Logged in with Email"', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    const { container } = await start(fake);
    await fillSignIn(EMAIL, PASSWORD);
    expect(screen.queryByRole('dialog', { name: 'Log in with Email', hidden: true })).toBeNull(); // gone with the signed-out view
    expect(container.querySelector('.account__username')?.textContent).toBe('@Johan');
    expect(screen.getByText('Logged in with Email')).toBeTruthy();
    expect(document.querySelector<HTMLDialogElement>('dialog[aria-label="Welcome to LiqueAmp"]')?.open).toBe(false); // no username onboarding
    expect(browserStorage()).not.toContain(PASSWORD);
  });

  it('7. wrong password or unknown address → "Wrong email or password."; unconfirmed → confirm first', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    await providerFor(fake).signUp({ method: 'email', email: 'new@example.com', password: PASSWORD }); // never confirmed
    await start(fake);
    const d = await fillSignIn(EMAIL, 'wrong-password');
    expect(alertIn(d)).toBe('Wrong email or password.');
    type(d, 'Email', 'nobody@example.com');
    type(d, 'Password', PASSWORD);
    await click(d, 'Log in');
    expect(alertIn(d)).toBe('Wrong email or password.');
    type(d, 'Email', 'new@example.com');
    await click(d, 'Log in');
    expect(alertIn(d)).toBe('Confirm your email first: open the link we sent you, then log in.');
    type(d, 'Password', '');
    await click(d, 'Log in');
    expect(alertIn(d)).toBe('Enter your password.');
    expect(useAccount.getState().state).toEqual({ status: 'signed-out' });
  });

  it('rate limits and network failures get plain messages', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    await start(fake);
    fake.setRateLimited(true);
    const d = await fillSignIn(EMAIL, PASSWORD);
    expect(alertIn(d)).toBe('Too many attempts. Wait a minute and try again.');
    fake.setRateLimited(false);
    fake.setOffline(true);
    await click(d, 'Log in');
    expect(alertIn(d)).toMatch(/can’t be reached/);
  });
});

describe('forgot password', () => {
  it('8. reset link by email → new password → log in with it', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    await start(fake);
    fireEvent.click(screen.getByRole('button', { name: 'Log in with Email' }));
    let d = dialog('Log in with Email');
    await click(d, 'Forgot password?');
    d = dialog('Reset password');
    expect(within(d).queryByLabelText('Password')).toBeNull();
    type(d, 'Email', 'bad');
    await click(d, 'Send reset link');
    expect(alertIn(d)).toBe('Enter a valid email address.');
    type(d, 'Email', EMAIL);
    await click(d, 'Send reset link');
    expect(dialog('Check your email').textContent).toContain(EMAIL);
    expect(fake.emailsSent.at(-1)).toEqual({ kind: 'reset', email: EMAIL, redirectTo: CALLBACK });
    await click(dialog('Check your email'), 'Done');

    // the link: Supabase signs the user in with PASSWORD_RECOVERY
    act(() => fake.openResetLink(EMAIL));
    await settle();
    expect(screen.getByText('Logged in with Email')).toBeTruthy();
    const choose = dialog('Choose a new password');
    expect((choose as HTMLDialogElement).open).toBe(true);
    type(choose, 'New password', 'brand-new-secret');
    type(choose, 'Confirm new password', 'brand-new-secre');
    await click(choose, 'Save password');
    expect(alertIn(choose)).toBe('The passwords don’t match.');
    type(choose, 'New password', PASSWORD);
    type(choose, 'Confirm new password', PASSWORD);
    await click(choose, 'Save password');
    expect(alertIn(choose)).toBe('New password should be different from the old password.'); // Supabase's rule
    type(choose, 'New password', 'brand-new-secret');
    type(choose, 'Confirm new password', 'brand-new-secret');
    await click(choose, 'Save password');
    expect(dialog('Password changed')).toBeTruthy();
    expect(useAccount.getState().passwordRecovery).toBe(false);
    expect(browserStorage()).not.toContain('brand-new-secret');

    // the new password works, the old one does not
    await act(() => useAccount.getState().signOut());
    await settle();
    await expect(providerFor(fake).signIn({ method: 'email', email: EMAIL, password: PASSWORD })).rejects.toMatchObject({ code: 'wrong-credentials' });
    await providerFor(fake).signIn({ method: 'email', email: EMAIL, password: 'brand-new-secret' });
  });

  it('an unknown address gets the same confirmation (no account enumeration); "Not now" keeps the old password', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    await start(fake);
    fireEvent.click(screen.getByRole('button', { name: 'Log in with Email' }));
    await click(dialog('Log in with Email'), 'Forgot password?');
    type(dialog('Reset password'), 'Email', 'nobody@example.com');
    await click(dialog('Reset password'), 'Send reset link');
    expect(dialog('Check your email').textContent).toContain('If there is an account for nobody@example.com');
    expect(fake.emailsSent.filter((m) => m.kind === 'reset')).toEqual([]);
    await click(dialog('Check your email'), 'Done');

    await act(() => useAccount.getState().requestPasswordReset(EMAIL));
    act(() => fake.openResetLink(EMAIL));
    await settle();
    await click(dialog('Choose a new password'), 'Not now');
    expect(useAccount.getState().passwordRecovery).toBe(false);
    expect(fake.emailAccount(EMAIL)!.password).toBe(PASSWORD);
  });

  it('a recovery reported before the app subscribed is still delivered once', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    const provider = providerFor(fake);
    fake.openResetLink(EMAIL); // Supabase exchanged the link while the app was still starting
    let calls = 0;
    provider.onPasswordRecovery(() => calls++);
    provider.onPasswordRecovery(() => calls++);
    expect(calls).toBe(1);
  });
});

describe('the current-login provider label with three methods', () => {
  it('9–11. Email → Google → GitHub → Email, each labelled correctly on one account', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    const id = fake.emailAccount(EMAIL)!.userId;
    const labelAfter = async (login: () => Promise<void>) => {
      await login();
      return (await providerFor(fake).getState()) as { session?: { authMethod: string | null; user: { username: string } } };
    };
    const oauth = async (method: 'google' | 'github') => {
      await providerFor(fake).signIn({ method });
      fake.signInAs(id, method); // the callback: same account (linked identity)
    };
    const email = () => providerFor(fake).signIn({ method: 'email', email: EMAIL, password: PASSWORD });

    expect((await labelAfter(email)).session).toMatchObject({ authMethod: 'email', user: { username: 'Johan' } });
    await providerFor(fake).signOut();
    expect((await labelAfter(() => oauth('google'))).session).toMatchObject({ authMethod: 'google' });
    await providerFor(fake).signOut();
    expect((await labelAfter(() => oauth('github'))).session).toMatchObject({ authMethod: 'github' });
    await providerFor(fake).signOut();
    expect((await labelAfter(email)).session).toMatchObject({ authMethod: 'email' });
  });

  it('12. logging out clears the recorded email provider', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    await start(fake);
    await fillSignIn(EMAIL, PASSWORD);
    expect(localStorage.getItem('liqueamp.authMethod')).toContain('"email"');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Log out' })));
    await settle();
    expect(localStorage.getItem('liqueamp.authMethod')).toBeNull();
    expect(localStorage.getItem('liqueamp.authMethod.pending')).toBeNull();
    expect(screen.getByText('Not logged in')).toBeTruthy();
  });

  it('13. the email session and its label survive reloads', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    await providerFor(fake).signIn({ method: 'email', email: EMAIL, password: PASSWORD });
    for (let i = 0; i < 3; i++) {
      const reloaded = providerFor(fake); // a page reload: new provider, same browser storage and session
      expect(await reloaded.getState()).toMatchObject({ status: 'signed-in', session: { user: { username: 'Johan' }, authMethod: 'email' } });
    }
  });
});

describe('Friend Liques with email accounts', () => {
  it('15. signed out: ACCOUNT REQUIRED; after an email log-in the panel works like for any account', async () => {
    const fake = createFakeSupabase();
    await existingEmailAccount(fake);
    useFriends.getState().setDirectory(createSupabaseFriendDirectory(fake.client));
    await act(() => useAccount.getState().init(providerFor(fake)));
    render(
      <MemoryRouter>
        <FriendLiquesPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText('ACCOUNT REQUIRED')).toBeTruthy();
    await act(() => useAccount.getState().signInWithEmail(EMAIL, PASSWORD));
    expect(await screen.findByText('NO FRIEND LIQUES YET')).toBeTruthy();
  });
});
