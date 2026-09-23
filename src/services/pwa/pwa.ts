import { create } from 'zustand';
import { useUi } from '../../stores/uiStore';

/** Chromium's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type OfflineStatus =
  /** Service workers are not available in this browser/context. */
  | 'unsupported'
  /** Development server: no service worker, so HMR is never served stale files. */
  | 'dev'
  | 'registering'
  /** The app shell is cached; LIQUEAMP opens without a network. */
  | 'ready'
  | 'error';

export interface WorkerInfo {
  version: string;
  precached: number;
  cache: string;
}

interface PwaState {
  offline: OfflineStatus;
  error: string | null;
  /** A new version is installed and waiting; applying it reloads the page. */
  updateAvailable: boolean;
  /** The browser offered an install prompt we can show. */
  installable: boolean;
  /** Running as an installed app (standalone display mode). */
  installed: boolean;
  info: WorkerInfo | null;
}

export const usePwa = create<PwaState>(() => ({
  offline: 'registering',
  error: null,
  updateAvailable: false,
  installable: false,
  installed: false,
  info: null,
}));

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
let reloadOnControllerChange = false;
let started = false;

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

/** Asks the active worker which build it serves (measured, for /control). */
async function readWorkerInfo(worker: ServiceWorker | null): Promise<WorkerInfo | null> {
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (e) => {
      window.clearTimeout(timer);
      resolve(e.data as WorkerInfo);
    };
    worker.postMessage({ type: 'GET_INFO' }, [channel.port2]);
  });
}

function markUpdateAvailable() {
  if (usePwa.getState().updateAvailable) return;
  usePwa.setState({ updateAvailable: true });
  useUi.getState().toast('Update available — reload from Settings › Install / PWA');
}

function watchForUpdates(reg: ServiceWorkerRegistration) {
  // A worker already waiting from an earlier visit.
  if (reg.waiting && navigator.serviceWorker.controller) markUpdateAvailable();
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      // With an existing controller this is an update, not the first install.
      if (worker.state === 'installed' && navigator.serviceWorker.controller) markUpdateAvailable();
    });
  });
}

/**
 * Registers the service worker (production builds only) and tracks
 * installability. Nothing here reloads the page on its own: an update is
 * only applied when the user asks, because a reload stops playback.
 */
export function startPwa(): void {
  if (started) return;
  started = true;

  usePwa.setState({ installed: isStandalone() });
  window.matchMedia?.('(display-mode: standalone)').addEventListener('change', () => usePwa.setState({ installed: isStandalone() }));
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own Install button instead of the browser's mini bar
    deferredPrompt = e as BeforeInstallPromptEvent;
    usePwa.setState({ installable: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    usePwa.setState({ installable: false, installed: true });
  });

  if (!('serviceWorker' in navigator)) {
    usePwa.setState({ offline: 'unsupported' });
    return;
  }
  if (!import.meta.env.PROD) {
    usePwa.setState({ offline: 'dev' });
    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnControllerChange) window.location.reload();
  });

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then(async (reg) => {
      registration = reg;
      watchForUpdates(reg);
      const ready = await navigator.serviceWorker.ready;
      usePwa.setState({ offline: 'ready', info: await readWorkerInfo(ready.active) });
    })
    .catch((e: unknown) => usePwa.setState({ offline: 'error', error: e instanceof Error ? e.message : String(e) }));
}

/** Shows the browser's install dialog, when it offered one. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null; // a prompt event can only be used once
  usePwa.setState({ installable: false });
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome;
}

/** Activates the waiting version and reloads into it. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) return;
  reloadOnControllerChange = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** Asks the browser to look for a new version now. */
export async function checkForUpdate(): Promise<void> {
  await registration?.update();
}

export interface StorageInfo {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

/** Measured storage state; null where the browser does not report it. */
export async function readStorageInfo(): Promise<StorageInfo> {
  const storage = navigator.storage;
  const [persisted, estimate] = await Promise.all([
    storage?.persisted ? storage.persisted().catch(() => null) : Promise.resolve(null),
    storage?.estimate ? storage.estimate().catch(() => null) : Promise.resolve(null),
  ]);
  return { persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null };
}

/**
 * Asks the browser not to evict local data (library, playlists, themes)
 * under storage pressure. Only on an explicit user action — some browsers
 * show a permission prompt.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}
