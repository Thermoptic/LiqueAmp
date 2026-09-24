const pending = new Map<string, Promise<void>>();

export type ScriptStatus = 'not-loaded' | 'loading' | 'loaded' | 'failed';
const statuses = new Map<string, ScriptStatus>();

/** Whether a third-party script was requested/loaded this session (for /control). */
export function getScriptStatus(src: string): ScriptStatus {
  return statuses.get(src) ?? 'not-loaded';
}

/**
 * Loads an official third-party player script once. Only called when the
 * user actually plays that provider, so nothing is contacted otherwise.
 */
export function loadScript(src: string, timeoutMs = 15000): Promise<void> {
  const existing = pending.get(src);
  if (existing) return existing;
  statuses.set(src, 'loading');
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    const timer = window.setTimeout(() => {
      statuses.set(src, 'failed');
      reject(new Error(`Timed out loading ${src}`));
    }, timeoutMs);
    el.onload = () => {
      window.clearTimeout(timer);
      statuses.set(src, 'loaded');
      resolve();
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      statuses.set(src, 'failed');
      pending.delete(src);
      el.remove();
      reject(new Error(`Could not load ${src}`));
    };
    document.head.appendChild(el);
  });
  pending.set(src, promise);
  return promise;
}
