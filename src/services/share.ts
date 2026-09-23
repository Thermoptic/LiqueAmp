export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

/**
 * Web Share API where available, otherwise copies the source URL
 * (PROVIDERS §54). No invented LIQUEAMP links.
 */
export async function shareOrCopy(data: { title: string; url: string }, nav: Navigator = navigator): Promise<ShareResult> {
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // fall through to copying
    }
  }
  try {
    await nav.clipboard.writeText(data.url);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}
