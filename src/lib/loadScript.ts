const pending = new Map<string, Promise<void>>();

/**
 * Loads an official third-party player script once. Only called when the
 * user actually plays that provider, so nothing is contacted otherwise.
 */
export function loadScript(src: string, timeoutMs = 15000): Promise<void> {
  const existing = pending.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    const timer = window.setTimeout(() => reject(new Error(`Timed out loading ${src}`)), timeoutMs);
    el.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      pending.delete(src);
      el.remove();
      reject(new Error(`Could not load ${src}`));
    };
    document.head.appendChild(el);
  });
  pending.set(src, promise);
  return promise;
}
