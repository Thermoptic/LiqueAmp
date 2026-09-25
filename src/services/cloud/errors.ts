// Turns Supabase / Postgres / network failures into LiqueAmp account errors.
// Raw backend messages go to the developer console only.
import { accountError, AccountError, type AccountErrorCode } from '../account/account';

export const NETWORK_TIMEOUT_MS = 12000;

/** Rejects with an 'offline' error if the backend does not answer in time. */
export function withTimeout<T>(promise: PromiseLike<T>, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(accountError('offline', new Error(`timed out after ${ms} ms`))), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** A backend call with the timeout, and every rejection (network, abort …) as a LiqueAmp error. */
export function backendCall<T>(promise: PromiseLike<T>, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  return withTimeout(promise, ms).catch((err: unknown) => {
    throw toAccountError(err);
  });
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch failed
  const name = (err as { name?: string } | null)?.name ?? '';
  const status = (err as { status?: number } | null)?.status;
  return name === 'AuthRetryableFetchError' || status === 0 || /fetch|network/i.test((err as { message?: string } | null)?.message ?? '');
}

export function toAccountError(err: unknown, fallback: AccountErrorCode = 'unknown'): AccountError {
  if (err instanceof AccountError) return err;
  if (import.meta.env.DEV) console.warn('[account]', err);
  if (isNetworkError(err)) return accountError('offline', err);
  const e = err as { code?: string; status?: number; name?: string } | null;
  if (e?.code === '22023' || e?.code === '23514') return accountError('profile-rejected', err); // guard trigger / check constraint
  if (e?.status === 401 || e?.code === 'PGRST301' || e?.code === '28000' || /jwt|expired/i.test((err as { message?: string } | null)?.message ?? '')) return accountError('session-expired', err);
  if (e?.name?.startsWith('Auth')) return accountError('auth-failed', err);
  return accountError(fallback, err);
}

/** OAuth errors come back in the callback URL (?error=access_denied&error_description=…). */
export function oauthErrorFromUrl(href: string): AccountError | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const params = new URLSearchParams(url.search);
  if (url.hash.includes('error=')) for (const [k, v] of new URLSearchParams(url.hash.slice(1))) params.set(k, v);
  const error = params.get('error');
  if (!error) return null;
  return accountError(error === 'access_denied' ? 'cancelled' : 'auth-failed', new Error(`${error}: ${params.get('error_description') ?? ''}`));
}
