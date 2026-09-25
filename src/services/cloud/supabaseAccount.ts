// AccountProvider on Supabase Auth (D5: Google and GitHub OAuth) and the
// public.users table (D6: username). LiqueAmp stores no auth data: the
// session belongs to Supabase, the user id IS the auth user UUID.
import {
  accountError,
  AUTH_METHODS,
  type AccountProvider,
  type AccountSession,
  type AccountState,
  type AuthCredentials,
  type AuthMethod,
} from '../account/account';
import { checkUsername } from '../account/username';
import { backendCall, toAccountError } from './errors';
import type { SupabaseLike, SupabaseSession } from './supabaseClient';

function authMethodOf(session: SupabaseSession): AuthMethod | null {
  const p = session.user.app_metadata?.provider;
  return (AUTH_METHODS as readonly string[]).includes(p ?? '') ? (p as AuthMethod) : null;
}

export function createSupabaseAccountProvider(client: SupabaseLike, { redirectTo }: { redirectTo: () => string }): AccountProvider {
  async function currentSession(): Promise<SupabaseSession | null> {
    const { data, error } = await backendCall(client.auth.getSession());
    if (error) throw toAccountError(error, 'auth-failed');
    return data.session;
  }

  async function stateFor(session: SupabaseSession | null): Promise<AccountState> {
    if (!session) return { status: 'signed-out' };
    const authMethod = authMethodOf(session);
    const { data, error } = await backendCall(client.from('users').select('username').eq('id', session.user.id).maybeSingle());
    if (error) throw toAccountError(error);
    const username = typeof data?.username === 'string' ? data.username : null;
    if (!username) return { status: 'needs-username', userId: session.user.id, authMethod };
    return { status: 'signed-in', session: { user: { userId: session.user.id, username }, authMethod } };
  }

  async function signIn({ method }: AuthCredentials): Promise<void> {
    if (!(AUTH_METHODS as readonly string[]).includes(method)) throw accountError('auth-failed');
    const { error } = await backendCall(client.auth.signInWithOAuth({ provider: method, options: { redirectTo: redirectTo() } }));
    if (error) throw toAccountError(error, 'auth-failed');
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
    signUp: signIn,

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
      return { user: { userId: session.user.id, username: String(data?.username ?? check.username) }, authMethod: authMethodOf(session) };
    },

    async signOut() {
      // this device only: other devices stay signed in
      const { error } = await backendCall(client.auth.signOut({ scope: 'local' }));
      if (error) throw toAccountError(error);
    },

    async deleteAccount() {
      const { error } = await backendCall(client.rpc('delete_my_account'));
      if (error) throw toAccountError(error);
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
