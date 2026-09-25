// Public client configuration for the cloud backend (D16: Supabase).
// Everything in VITE_* variables is compiled into the public bundle, so only
// the project URL and the PUBLISHABLE (anon) key may ever be set here. The
// server enforces ownership and access with row-level security; the client
// never holds a secret. See .env.example.

export interface CloudConfig {
  url: string;
  publishableKey: string;
}

export class CloudConfigError extends Error {}

function decodeJwtRole(key: string): string | null {
  const part = key.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown };
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

/**
 * The cloud configuration, or null when LiqueAmp is built without one (then
 * it runs without accounts). A secret/service key is refused outright: it
 * must never ship to the browser.
 */
export function readCloudConfig(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>): CloudConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !publishableKey) return null;
  if (!url || !publishableKey) throw new CloudConfigError('Both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set, or neither.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CloudConfigError('VITE_SUPABASE_URL is not a URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') throw new CloudConfigError('VITE_SUPABASE_URL must use https.');
  if (publishableKey.startsWith('sb_secret_') || decodeJwtRole(publishableKey) === 'service_role') {
    throw new CloudConfigError('A secret (service) key must never be put in a VITE_* variable; use the publishable key.');
  }
  return { url: parsed.origin, publishableKey };
}

/**
 * Where an authentication redirect returns to. It includes the base path the
 * app is served from (/LiqueAmp/ on GitHub Pages), so it must be registered
 * in the backend's allowed redirect URLs for every origin the app runs on.
 * GitHub Pages' 404.html and the service worker both serve the app shell for
 * this path, so the SPA receives the callback with its query string intact.
 */
export function authCallbackUrl(origin: string = location.origin, base: string = import.meta.env.BASE_URL): string {
  return `${origin}${base.endsWith('/') ? base : `${base}/`}auth/callback`;
}
