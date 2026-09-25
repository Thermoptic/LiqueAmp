// An in-memory stand-in for the Supabase project, for tests only. It enforces
// the same rules as supabase/migrations/*_liqueamp_{accounts,friends}.sql, so the
// adapters are tested against the server's behaviour, not just call shapes:
// - RLS: every table call only sees/changes rows of the signed-in user
// - users.username: format check + case-insensitive unique index (23505)
// - profiles: owner check, revision 1 on insert / +1 on update (trigger),
//   visibility forced PRIVATE, primary key (23505)
// - friendships: own outgoing rows only (read/add/remove, no update), no
//   duplicates (23505), not oneself (23514); adding B lets me READ B's users
//   and profiles rows (one-way); lookup_username(): exact, case-insensitive
// - delete_my_account(): deletes the user and cascades
// - email + password auth like the real project (checked 2026-09-26: email
//   enabled, sign-up allowed, confirmation required): sign-up gives no session
//   until the confirmation link is opened; an already registered address gets
//   a user without identities; the AuthApiError codes Supabase returns
// It is not the real thing: SQL, OAuth and networking are verified against a
// real project (see docs/LIQUEAMP_IMPLEMENTATION_PLAN.md, checkpoint 5).
import type { SupabaseLike, SupabaseSession } from '../services/cloud/supabaseClient';

type Row = Record<string, unknown>;
type Err = { code: string; message: string } | null;

const USERNAME = /^[A-Za-z0-9]{3,20}$/;
const RESERVED = ['admin', 'administrator', 'liqueamp', 'support', 'system', 'root', 'moderator', 'official', 'null', 'undefined', 'anonymous', 'everyone'];

type AuthError = { name: string; code?: string; status: number; message: string };
const authError = (code: string, status: number, message: string): AuthError => ({ name: 'AuthApiError', code, status, message });

export function createFakeSupabase({ confirmEmail = true }: { confirmEmail?: boolean } = {}) {
  const tables: { users: Row[]; profiles: Row[]; friendships: Row[]; [name: string]: Row[] } = { users: [], profiles: [], friendships: [] };
  let session: SupabaseSession | null = null;
  // Like Supabase Auth (verified against the real project): the first
  // provider stays in app_metadata; an identity's last_sign_in_at is set when
  // it is linked and NOT updated on later sign-ins (only updated_at moves).
  // Nothing in the session says which provider the current login used.
  const accounts = new Map<string, { firstProvider: string; identities: Array<{ provider: string; last_sign_in_at: string; updated_at: string }> }>();
  let signIns = 0;
  let offline = false;
  let clock = 0;
  const listeners = new Set<(event: string, s: SupabaseSession | null) => void>();
  const oauthCalls: Array<{ provider: string; redirectTo?: string }> = [];
  // email accounts: Supabase's side (the password lives only in "Supabase")
  const emailAccounts = new Map<string, { userId: string; password: string; confirmed: boolean }>();
  const emailsSent: Array<{ kind: 'confirm' | 'reset'; email: string; redirectTo?: string }> = [];
  let rateLimited = false;
  let nextEmailUser = 0;

  const uid = () => session?.user.id ?? null;
  const now = () => `2026-09-25T14:00:${String(++clock).padStart(2, '0')}.000Z`;
  const net = <T>(v: T) => (offline ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(v));
  const ownerOf = (table: string, r: Row) => (table === 'users' ? r.id : r.user_id);
  const own = (table: string) => tables[table]!.filter((r) => ownerOf(table, r) === uid());
  const added = (id: unknown) => tables.friendships.some((f) => f.user_id === uid() && f.friend_id === id);
  /** select policies: own rows, plus users/profiles rows of the people I added (read-only). */
  const readable = (table: string) => tables[table]!.filter((r) => ownerOf(table, r) === uid() || (table !== 'friendships' && added(ownerOf(table, r))));
  const dropUser = (id: unknown) => {
    tables.users = tables.users.filter((u) => u.id !== id);
    tables.profiles = tables.profiles.filter((p) => p.user_id !== id);
    tables.friendships = tables.friendships.filter((f) => f.user_id !== id && f.friend_id !== id);
  };
  const pick = (row: Row, cols: string) => Object.fromEntries(cols.split(',').map((c) => c.trim()).map((c) => [c, row[c]]));

  function insertRow(table: string, values: Row): { row: Row | null; error: Err } {
    if (!uid()) return { row: null, error: { code: '42501', message: 'permission denied' } };
    if (table === 'users') {
      if (values.id !== uid()) return { row: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
      const name = String(values.username ?? '');
      if (!USERNAME.test(name) || RESERVED.includes(name.toLowerCase())) return { row: null, error: { code: '23514', message: 'violates check constraint' } };
      if (tables.users!.some((u) => String(u.username).toLowerCase() === name.toLowerCase())) return { row: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "users_username_lower_key"' } };
      if (tables.users!.some((u) => u.id === values.id)) return { row: null, error: { code: '23505', message: 'duplicate key' } };
      const row = { id: values.id, username: name, created_at: now(), updated_at: now() };
      tables.users!.push(row);
      return { row, error: null };
    }
    if (table === 'friendships') {
      if (values.user_id !== uid()) return { row: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
      if (values.friend_id === values.user_id) return { row: null, error: { code: '23514', message: 'violates check constraint "friendships_not_self"' } };
      if (!tables.users.some((u) => u.id === values.friend_id)) return { row: null, error: { code: '23503', message: 'foreign key' } };
      if (added(values.friend_id)) return { row: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "friendships_pkey"' } };
      const row = { user_id: values.user_id, friend_id: values.friend_id, created_at: now() };
      tables.friendships.push(row);
      return { row, error: null };
    }
    // profiles
    if (values.user_id !== uid()) return { row: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
    if (!tables.users!.some((u) => u.id === values.user_id)) return { row: null, error: { code: '23503', message: 'foreign key' } };
    const guard = guardProfile(values);
    if (guard) return { row: null, error: guard };
    if (tables.profiles!.some((p) => p.user_id === values.user_id)) return { row: null, error: { code: '23505', message: 'duplicate key' } };
    const row = { ...values, revision: 1, visibility: 'PRIVATE', created_at: now(), updated_at: now() };
    tables.profiles!.push(row);
    return { row, error: null };
  }

  function guardProfile(values: Row): Err {
    const data = values.data as { format?: string; meta?: { ownerUserId?: string }; data?: unknown } | undefined;
    if (data?.format !== 'liqueamp-profile' || typeof data.meta !== 'object' || typeof data.data !== 'object') return { code: '22023', message: 'not a LiqueAmp profile' };
    if (data.meta?.ownerUserId !== values.user_id) return { code: '22023', message: 'profile owner does not match' };
    return null;
  }

  function filter(table: string, op: 'select' | 'update' | 'delete', values?: Row) {
    const eqs: Array<[string, (v: unknown) => boolean]> = [];
    let columns: string | null = op === 'select' ? '*' : null;
    let pending: Promise<{ data: Row[] | null; error: Err }> | null = null;
    const run = (): Promise<{ data: Row[] | null; error: Err }> => {
      pending ??= (async () => {
        await net(null);
        if (op === 'update' && table === 'friendships') return { data: null, error: { code: '42501', message: 'permission denied for table friendships' } };
        const rows = (op === 'select' ? readable(table) : own(table)).filter((r) => eqs.every(([c, test]) => test(r[c])));
        if (op === 'update') {
          for (const r of rows) {
            const next = { ...r, ...values, user_id: r.user_id, revision: (r.revision as number) + 1, visibility: r.visibility, created_at: r.created_at, updated_at: now() };
            const err = guardProfile(next);
            if (err) return { data: null, error: err };
            Object.assign(r, next);
          }
        }
        if (op === 'delete') {
          if (table === 'users') rows.forEach((u) => dropUser(u.id));
          else tables[table] = tables[table]!.filter((r) => !rows.includes(r));
        }
        return { data: columns ? rows.map((r) => (columns === '*' ? { ...r } : pick(r, columns!))) : null, error: null };
      })();
      return pending;
    };
    const builder = {
      eq(c: string, v: unknown) {
        eqs.push([c, (x) => x === v]);
        return builder;
      },
      in(c: string, vs: readonly unknown[]) {
        eqs.push([c, (x) => vs.includes(x)]);
        return builder;
      },
      select(c: string) {
        columns = c;
        return builder;
      },
      maybeSingle: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      then<A, B>(ok?: ((v: { data: Row[] | null; error: Err }) => A) | null, fail?: ((e: unknown) => B) | null) {
        return run().then(ok, fail);
      },
    };
    return builder;
  }

  /** Establishes a session (as a callback or a password login would). */
  function establish(userId: string, provider: string, event = 'SIGNED_IN') {
    const account = accounts.get(userId) ?? { firstProvider: provider, identities: [] };
    accounts.set(userId, account);
    const at = `2026-09-25T15:${String(Math.floor(++signIns / 60)).padStart(2, '0')}:${String(signIns % 60).padStart(2, '0')}.000Z`;
    const identity = account.identities.find((i) => i.provider === provider);
    if (identity) identity.updated_at = at;
    else account.identities.push({ provider, last_sign_in_at: at, updated_at: at });
    session = { user: { id: userId, app_metadata: { provider: account.firstProvider }, identities: account.identities.map((i) => ({ ...i })) } };
    listeners.forEach((l) => l(event, session));
  }

  const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const weak = (password: string) => (password.length < 6 ? authError('weak_password', 422, 'Password should be at least 6 characters.') : null);

  const client: SupabaseLike = {
    auth: {
      signUp: async ({ email, password, options }) => {
        await net(null);
        if (rateLimited) return { data: { user: null, session: null }, error: authError('over_email_send_rate_limit', 429, 'email rate limit exceeded') };
        const key = email.toLowerCase();
        if (!validEmail(key)) return { data: { user: null, session: null }, error: authError('validation_failed', 400, 'Unable to validate email address: invalid format') };
        const tooWeak = weak(password);
        if (tooWeak) return { data: { user: null, session: null }, error: tooWeak };
        const existing = emailAccounts.get(key);
        if (existing) {
          // confirmation on: an obfuscated user, no identities, no email sent; off: an error
          if (confirmEmail) return { data: { user: { id: `obfuscated-${++nextEmailUser}`, identities: [] }, session: null }, error: null };
          return { data: { user: null, session: null }, error: authError('user_already_exists', 422, 'User already registered') };
        }
        const userId = `eeeeeeee-0000-4000-8000-${String(++nextEmailUser).padStart(12, '0')}`;
        emailAccounts.set(key, { userId, password, confirmed: !confirmEmail });
        if (confirmEmail) {
          emailsSent.push({ kind: 'confirm', email: key, redirectTo: options?.emailRedirectTo });
          return { data: { user: { id: userId, identities: [{ provider: 'email' }] }, session: null }, error: null };
        }
        establish(userId, 'email');
        return { data: { user: session!.user, session }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        await net(null);
        if (rateLimited) return { data: { session: null }, error: authError('over_request_rate_limit', 429, 'Request rate limit reached') };
        const account = emailAccounts.get(email.toLowerCase());
        if (!account || account.password !== password) return { data: { session: null }, error: authError('invalid_credentials', 400, 'Invalid login credentials') };
        if (!account.confirmed) return { data: { session: null }, error: authError('email_not_confirmed', 400, 'Email not confirmed') };
        establish(account.userId, 'email');
        return { data: { session }, error: null };
      },
      resetPasswordForEmail: async (email, options) => {
        await net(null);
        if (rateLimited) return { error: authError('over_email_send_rate_limit', 429, 'email rate limit exceeded') };
        // same answer whether or not the address exists
        if (emailAccounts.has(email.toLowerCase())) emailsSent.push({ kind: 'reset', email: email.toLowerCase(), redirectTo: options?.redirectTo });
        return { error: null };
      },
      updateUser: async ({ password }) => {
        await net(null);
        const account = [...emailAccounts.values()].find((a) => a.userId === uid());
        if (!session) return { error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' } };
        if (!account) return { error: authError('validation_failed', 400, 'no email identity') };
        if (account.password === password) return { error: authError('same_password', 422, 'New password should be different from the old password.') };
        const tooWeak = weak(password);
        if (tooWeak) return { error: tooWeak };
        account.password = password;
        return { error: null };
      },
      getSession: () => net({ data: { session }, error: null }),
      onAuthStateChange(cb) {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signInWithOAuth: async ({ provider, options }) => {
        await net(null);
        oauthCalls.push({ provider, redirectTo: options?.redirectTo });
        return { error: null };
      },
      signOut: async () => {
        session = null;
        listeners.forEach((l) => l('SIGNED_OUT', null));
        return { error: null };
      },
    },
    from(table) {
      return {
        select: (cols) => filter(table, 'select').select(cols) as never,
        insert: (values) => ({
          select: (cols) => ({
            single: async () => {
              await net(null);
              const { row, error } = insertRow(table, values);
              return { data: row ? pick(row, cols) : null, error };
            },
          }),
        }),
        update: (values) => filter(table, 'update', values) as never,
        delete: () => filter(table, 'delete') as never,
      };
    },
    rpc: async (fn, args) => {
      await net(null);
      if (!uid()) return { data: null, error: { code: fn === 'lookup_username' ? '42501' : '28000', message: 'not authenticated' } };
      if (fn === 'lookup_username') {
        // only id + username, never anything else
        const key = String(args?.p_username ?? '').trim().toLowerCase();
        return { data: tables.users.filter((u) => String(u.username).toLowerCase() === key).slice(0, 1).map((u) => ({ user_id: u.id, username: u.username })), error: null };
      }
      if (fn !== 'delete_my_account') return { data: null, error: { code: 'PGRST202', message: 'function not found' } };
      dropUser(uid());
      return { data: null, error: null };
    },
  };

  return {
    client,
    tables,
    oauthCalls,
    /** Completes an OAuth sign-in, as the callback would. */
    signInAs(userId: string, provider: 'google' | 'github' = 'github') {
      establish(userId, provider);
    },
    /** Email sent by "Supabase" (confirmation / reset), newest last. */
    emailsSent,
    /** The user opens the confirmation link: confirmed, and signed in through the callback. */
    openConfirmationLink(email: string) {
      const account = emailAccounts.get(email.toLowerCase())!;
      account.confirmed = true;
      establish(account.userId, 'email');
    },
    /** The user opens the password reset link: signed in, PASSWORD_RECOVERY. */
    openResetLink(email: string) {
      establish(emailAccounts.get(email.toLowerCase())!.userId, 'email', 'PASSWORD_RECOVERY');
    },
    /** For inspection only: what "Supabase" holds for an address. */
    emailAccount: (email: string) => emailAccounts.get(email.toLowerCase()),
    setRateLimited(v: boolean) {
      rateLimited = v;
    },
    /** The access token expired and could not be refreshed. */
    expireSession() {
      session = null;
      listeners.forEach((l) => l('SIGNED_OUT', null));
    },
    setOffline(v: boolean) {
      offline = v;
    },
  };
}
