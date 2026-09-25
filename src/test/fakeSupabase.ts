// An in-memory stand-in for the Supabase project, for tests only. It enforces
// the same rules as supabase/migrations/*_liqueamp_accounts.sql, so the
// adapters are tested against the server's behaviour, not just call shapes:
// - RLS: every table call only sees/changes rows of the signed-in user
// - users.username: format check + case-insensitive unique index (23505)
// - profiles: owner check, revision 1 on insert / +1 on update (trigger),
//   visibility forced PRIVATE, primary key (23505)
// - delete_my_account(): deletes the user and cascades
// It is not the real thing: SQL, OAuth and networking are verified against a
// real project (see docs/LIQUEAMP_IMPLEMENTATION_PLAN.md, checkpoint 5).
import type { SupabaseLike, SupabaseSession } from '../services/cloud/supabaseClient';

type Row = Record<string, unknown>;
type Err = { code: string; message: string } | null;

const USERNAME = /^[A-Za-z0-9]{3,20}$/;
const RESERVED = ['admin', 'administrator', 'liqueamp', 'support', 'system', 'root', 'moderator', 'official', 'null', 'undefined', 'anonymous', 'everyone'];

export function createFakeSupabase() {
  const tables: { users: Row[]; profiles: Row[]; [name: string]: Row[] } = { users: [], profiles: [] };
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

  const uid = () => session?.user.id ?? null;
  const now = () => `2026-09-25T14:00:${String(++clock).padStart(2, '0')}.000Z`;
  const net = <T>(v: T) => (offline ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(v));
  const own = (table: string) => tables[table]!.filter((r) => (table === 'users' ? r.id : r.user_id) === uid());
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
    const eqs: Array<[string, unknown]> = [];
    let columns: string | null = op === 'select' ? '*' : null;
    let pending: Promise<{ data: Row[] | null; error: Err }> | null = null;
    const run = (): Promise<{ data: Row[] | null; error: Err }> => {
      pending ??= (async () => {
        await net(null);
        const rows = own(table).filter((r) => eqs.every(([c, v]) => r[c] === v));
        if (op === 'update') {
          for (const r of rows) {
            const next = { ...r, ...values, user_id: r.user_id, revision: (r.revision as number) + 1, visibility: r.visibility, created_at: r.created_at, updated_at: now() };
            const err = guardProfile(next);
            if (err) return { data: null, error: err };
            Object.assign(r, next);
          }
        }
        if (op === 'delete') {
          tables[table] = tables[table]!.filter((r) => !rows.includes(r));
          if (table === 'users') tables.profiles = tables.profiles!.filter((p) => !rows.some((u) => u.id === p.user_id));
        }
        return { data: columns ? rows.map((r) => (columns === '*' ? { ...r } : pick(r, columns!))) : null, error: null };
      })();
      return pending;
    };
    const builder = {
      eq(c: string, v: unknown) {
        eqs.push([c, v]);
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

  const client: SupabaseLike = {
    auth: {
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
    rpc: async (fn) => {
      await net(null);
      if (fn !== 'delete_my_account' || !uid()) return { data: null, error: { code: '28000', message: 'not authenticated' } };
      const id = uid();
      tables.users = tables.users!.filter((u) => u.id !== id);
      tables.profiles = tables.profiles!.filter((p) => p.user_id !== id);
      return { data: null, error: null };
    },
  };

  return {
    client,
    tables,
    oauthCalls,
    /** Completes an OAuth sign-in, as the callback would. */
    signInAs(userId: string, provider: 'google' | 'github' = 'github') {
      const account = accounts.get(userId) ?? { firstProvider: provider, identities: [] };
      accounts.set(userId, account);
      const at = `2026-09-25T15:${String(Math.floor(++signIns / 60)).padStart(2, '0')}:${String(signIns % 60).padStart(2, '0')}.000Z`;
      const identity = account.identities.find((i) => i.provider === provider);
      if (identity) identity.updated_at = at;
      else account.identities.push({ provider, last_sign_in_at: at, updated_at: at });
      session = { user: { id: userId, app_metadata: { provider: account.firstProvider }, identities: account.identities.map((i) => ({ ...i })) } };
      listeners.forEach((l) => l('SIGNED_IN', session));
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
