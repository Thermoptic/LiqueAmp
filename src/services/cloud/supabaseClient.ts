// The Supabase browser client (D16). Loaded lazily — only when the build has
// a cloud configuration — so a local-only LiqueAmp never downloads or
// contacts it. Auth uses the PKCE flow (right for a static SPA): the OAuth
// provider redirects back to <base>/auth/callback?code=…, and the client
// exchanges the code for a session on start.
import type { CloudConfig } from '../account/config';

/**
 * The part of the Supabase client LiqueAmp uses. The real SupabaseClient
 * satisfies it; tests use a small fake.
 */
export interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: SupabaseSession | null }; error: unknown }>;
    onAuthStateChange(callback: (event: string, session: SupabaseSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
    signInWithOAuth(options: { provider: 'google' | 'github'; options?: { redirectTo?: string } }): Promise<{ error: unknown }>;
    signOut(options?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: unknown }>;
  };
  from(table: string): SupabaseQuery;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: PostgrestErrorLike | null }>;
}

export interface SupabaseSession {
  user: {
    id: string;
    /** `provider` is the FIRST provider the account was created with — not the current login (see supabaseAccount.ts). */
    app_metadata?: { provider?: string };
    identities?: Array<{ provider: string; last_sign_in_at?: string }>;
  };
}

export interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

type Result<T> = PromiseLike<{ data: T; error: PostgrestErrorLike | null }>;

/** The chain of query-builder calls LiqueAmp makes (select/insert/update/delete + eq/in + single). */
export interface SupabaseQuery {
  select(columns: string): SupabaseFilter;
  insert(values: Record<string, unknown>): { select(columns: string): { single(): Result<Record<string, unknown> | null> } };
  update(values: Record<string, unknown>): SupabaseFilter;
  delete(): SupabaseFilter;
}

export interface SupabaseFilter extends Result<Array<Record<string, unknown>> | null> {
  eq(column: string, value: unknown): SupabaseFilter;
  in(column: string, values: readonly unknown[]): SupabaseFilter;
  select(columns: string): SupabaseFilter;
  maybeSingle(): Result<Record<string, unknown> | null>;
}

let client: Promise<SupabaseLike> | null = null;

export function loadSupabaseClient(config: CloudConfig): Promise<SupabaseLike> {
  client ??= import('@supabase/supabase-js').then(
    ({ createClient }) =>
      createClient(config.url, config.publishableKey, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'liqueamp-auth',
        },
      }) as unknown as SupabaseLike,
  );
  return client;
}
