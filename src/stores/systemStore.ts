import { create } from 'zustand';
import { getStorageStatus, onStorageStatus, type StorageStatus } from '../services/storage/db';

/** Measured runtime state shown in the status bar. Nothing here is invented. */
interface SystemStore {
  online: boolean;
  storage: StorageStatus;
  storageError: string | null;
  startedAt: number;
}

export const useSystem = create<SystemStore>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  storage: getStorageStatus().status,
  storageError: getStorageStatus().error,
  startedAt: Date.now(),
}));

let wired = false;

export function wireSystemListeners(): void {
  if (wired) return;
  wired = true;
  window.addEventListener('online', () => useSystem.setState({ online: true }));
  window.addEventListener('offline', () => useSystem.setState({ online: false }));
  onStorageStatus((storage) => useSystem.setState({ storage, storageError: getStorageStatus().error }));
}
