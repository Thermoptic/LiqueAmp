// AccountProvider on Supabase Auth (D5: Google and GitHub OAuth, email + password) and the
// public.users table (D6: username). LiqueAmp stores no auth data: the
// session belongs to Supabase, the user id IS the auth user UUID.
import {
  accountError,
  AUTH_METHODS,
  checkEmail,
  OAUTH_METHODS,
  type AccountProvider,
  type AccountSession,
  type AccountState,
  type AuthCredentials,
  type AuthMethod,
  type SignUpResult,
} from '../account/account';
import { checkUsername } from '../account/username';
import { backendCall, toAccountError, toEmailAuthError } from './errors';
import type { SupabaseLike, SupabaseSession } from './supabaseClient';

const isAuthMethod = (p: unknown): p is AuthMethod => (AUTH_METHODS as readonly string[]).includes(String(p));

// ---- the provider of the current login ---------------------------------------
//
// Supabase does not say which provider the CURRENT session signed in with:
// `app_metadata.provider` is the provider the account was first created with,
// and an identity's `last_sign_in_at` is when it was linked. So LiqueAmp
// records the provider it sends the user to, and binds it to the user id once
// the OAuth callback has established the session. Stored locally (like the
// Supabase session, `liqueamp-auth`), so it survives the redirect and reloads;
// cleared on logout. An email/password login has no redirect: it is recorded
// when it succeeds. Email confirmation and password reset links do come back
// through the callback, so they use the pending record too, with the link's
// lifetime. Only the method name is stored, never an address or a password.

/** Set when OAuth starts; only honoured for a short while (an abandoned or cancelled attempt must not stick). */
const PENDING_KEY = 'liqueamp.authMethod.pending';
/** The current login's provider, bound to the signed-in user id. */
const CURRENT_KEY = 'liqueamp.authMethod';
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
/** Supabase's default lifetimes of a sign-up confirmation link and of a password reset link. */
const CONFIRM_LINK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RESET_LINK_MAX_AGE_MS = 60 * 60 * 1000;

function readJson(key: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: object | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // no storage: the label falls back to "Logged in"
  }
}

/** The provider of the current login for this user; binds a pending OAuth start to the new session. */
function currentAuthMethod(userId: string): AuthMethod | null {
  const pending = readJson(PENDING_KEY);
  const maxAge = typeof pending?.maxAgeMs === 'number' ? Math.min(pending.maxAgeMs, CONFIRM_LINK_MAX_AGE_MS) : PENDING_MAX_AGE_MS;
  if (pending && isAuthMethod(pending.method) && typeof pending.startedAt === 'number' && Date.now() - pending.startedAt < maxAge) {
    write(CURRENT_KEY, { userId, method: pending.method });
    write(PENDING_KEY, null);
    return pending.method;
  }
  write(PENDING_KEY, null);
  const current = readJson(CURRENT_KEY);
  return current && current.userId === userId && isAuthMethod(current.method) ? current.method : null;
}

function clearAuthMethod() {
  write(CURRENT_KEY, null);
}

/** This login's method, known at once (email/password: no redirect). */
function recordAuthMethod(userId: string, method: AuthMethod) {
  write(PENDING_KEY, null);
  write(CURRENT_KEY, { userId, method });
}

const isOAuthMethod = (m: unknown): m is (typeof OAUTH_METHODS)[number] => (OAUTH_METHODS as readonly string[]).includes(String(m));

function emailCredentials(credentials: { email: string; password: string }) {
  const email = checkEmail(credentials.email);
  if (!email) throw accountError('email-invalid');
  if (!credentials.password) throw accountError('password-invalid', undefined, 'Enter your password.');
  return { email, password: credentials.password };
}

export function createSupabaseAccountProvider(client: SupabaseLike, { redirectTo }: { redirectTo: () => string }): AccountProvider {
  async function currentSession(): Promise<SupabaseSession | null> {
    const { data, error } = await backendCall(client.auth.getSession());
    if (error) throw toAccountError(error, 'auth-failed');
    return data.session;
  }

  async function stateFor(session: SupabaseSession | null): Promise<AccountState> {
    if (!session) {
      clearAuthMethod();
      return { status: 'signed-out' };
    }
    const authMethod = currentAuthMethod(session.user.id);
    const { data, error } = await backendCall(client.from('users').select('username').eq('id', session.user.id).maybeSingle());
    if (error) throw toAccountError(error);
    const username = typeof data?.username === 'string' ? data.username : null;
    if (!username) return { status: 'needs-username', userId: session.user.id, authMethod };
    return { status: 'signed-in', session: { user: { userId: session.user.id, username }, authMethod } };
  }

  // PASSWORD_RECOVERY is emitted while Supabase exchanges the reset link's
  // code, possibly before the app subscribes: remember it until delivered.
  let recovered = false;
  const recoveryListeners = new Set<() => void>();
  client.auth.onAuthStateChange((event) => {
    if (event !== 'PASSWORD_RECOVERY') return;
    recovered = recoveryListeners.size === 0;
    recoveryListeners.forEach((l) => l());
  });

  /** Email auth calls: network failures and Supabase Auth errors both become LiqueAmp errors. */
  async function emailAuthCall<T extends { error: unknown }>(call: PromiseLike<T>): Promise<T> {
    const result = await backendCall(call).catch((err: unknown) => {
      throw toEmailAuthError(err);
    });
    if (result.error) throw toEmailAuthError(result.error);
    return result;
  }

  async function signInWithEmail(credentials: { email: string; password: string }): Promise<void> {
    const { data } = await emailAuthCall(client.auth.signInWithPassword(emailCredentials(credentials)));
    if (!data.session) throw accountError('auth-failed');
    recordAuthMethod(data.session.user.id, 'email');
  }

  async function signUpWithEmail(credentials: { email: string; password: string }): Promise<SignUpResult> {
    const { email, password } = emailCredentials(credentials);
    const { data } = await emailAuthCall(client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } }));
    if (data.session) {
      // email confirmation is off: signed in at once
      recordAuthMethod(data.session.user.id, 'email');
      return 'signed-in';
    }
    // With confirmation on, Supabase answers an already registered address
    // with a user that has no identities (and sends no email).
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw accountError('email-taken');
    // no session until the link in the email is opened (it returns to the callback URL)
    write(PENDING_KEY, { method: 'email', startedAt: Date.now(), maxAgeMs: CONFIRM_LINK_MAX_AGE_MS });
    return 'confirm-email';
  }

  async function signIn(credentials: AuthCredentials): Promise<void> {
    if (credentials.method === 'email') return signInWithEmail(credentials);
    const { method } = credentials;
    if (!isOAuthMethod(method)) throw accountError('auth-failed');
    // remember where the user is being sent; bound to the session after the callback
    write(PENDING_KEY, { method, startedAt: Date.now() });
    const { error } = await backendCall(client.auth.signInWithOAuth({ provider: method, options: { redirectTo: redirectTo() } }));
    if (error) {
      write(PENDING_KEY, null);
      throw toAccountError(error, 'auth-failed');
    }
    // the browser now leaves for Google/GitHub and returns to the callback URL
  }

  return {
    id: 'supabase',
    available: true,
    getState: async () => stateFor(await currentSession()),
    async getSession() {
      const state = await stateFor(await currentSession());
      return state.status === 'signed-in' ? state.session : null;
    },
    async getCurrentUser() {
      return (await this.getSession())?.user ?? null;
    },
    signIn,
    async signUp(credentials) {
      if (credentials.method === 'email') return signUpWithEmail(credentials);
      await signIn(credentials); // OAuth: the first sign-in creates the account
      return 'signed-in';
    },

    async requestPasswordReset(input) {
      const email = checkEmail(input);
      if (!email) throw accountError('email-invalid');
      await emailAuthCall(client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() }));
      // the link signs in through the callback URL: that login is an email login
      write(PENDING_KEY, { method: 'email', startedAt: Date.now(), maxAgeMs: RESET_LINK_MAX_AGE_MS });
    },

    async updatePassword(password) {
      if (!password) throw accountError('password-invalid', undefined, 'Enter a new password.');
      if (!(await currentSession())) throw accountError('not-signed-in');
      await emailAuthCall(client.auth.updateUser({ password }));
    },

    onPasswordRecovery(listener) {
      recoveryListeners.add(listener);
      if (recovered) {
        recovered = false;
        listener();
      }
      return () => recoveryListeners.delete(listener);
    },

    async claimUsername(input: string): Promise<AccountSession> {
      const check = checkUsername(input);
      if (!check.ok) throw accountError('username-invalid', new Error(check.message));
      const session = await currentSession();
      if (!session) throw accountError('not-signed-in');
      // The database is the arbiter: format check + case-insensitive unique
      // index; two people choosing "Johan" and "johan" at once cannot both win.
      const { data, error } = await backendCall(client.from('users').insert({ id: session.user.id, username: check.username }).select('username').single());
      if (error?.code === '23505') throw accountError('username-taken', error); // unique index on lower(username)
      if (error?.code === '23514') throw accountError('username-invalid', error); // format / reserved check
      if (error) throw toAccountError(error);
      return { user: { userId: session.user.id, username: String(data?.username ?? check.username) }, authMethod: currentAuthMethod(session.user.id) };
    },

    async signOut() {
      clearAuthMethod();
      // this device only: other devices stay signed in
      const { error } = await backendCall(client.auth.signOut({ scope: 'local' }));
      if (error) throw toAccountError(error);
    },

    async deleteAccount() {
      const { error } = await backendCall(client.rpc('delete_my_account'));
      if (error) throw toAccountError(error);
      clearAuthMethod();
      await client.auth.signOut({ scope: 'local' }).then(
        () => undefined,
        () => undefined,
      );
    },

    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // defer: Supabase must not be called from inside its own callback
        setTimeout(() => {
          stateFor(session).then(listener, () => undefined);
        }, 0);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
