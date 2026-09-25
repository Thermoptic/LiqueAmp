import { create } from 'zustand';
import { AccountError, createLocalAccountProvider, type AccountProvider, type AccountState, type AccountUser, type AuthMethod } from '../services/account/account';
import type { SharingDecision, SharingFinding } from '../services/profile/sharing';
import { onOwnProfileWrite } from '../services/storage/repository';
import type { CloudProfileStore } from '../services/sync/cloudProfile';
import { ProfileOwnershipError } from '../services/sync/ownProfileMeta';
import { keepLocalProfile, syncOwnProfile, unlinkLocalProfile, useCloudProfile, type SyncResult } from '../services/sync/profileSync';
import { oauthErrorFromUrl } from '../services/cloud/errors';
import { reloadProfileStores } from './reloadProfileStores';
import { useSettings } from './settingsStore';

/** Where the own profile stands relative to the account's cloud profile. */
export type SyncView =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'synced'; at: string }
  /** Suspicious stream URLs (D13): the user decides per item before anything is uploaded. */
  | { state: 'needs-review'; findings: SharingFinding[] }
  /** Both this device and the cloud changed (D9): Keep local / Use cloud. */
  | { state: 'conflict' }
  /** This device has its own Lique, the account already has a cloud profile: Keep local / Use cloud. */
  | { state: 'resolve-local' }
  /** This device's Lique belongs to another account: nothing is synced (never mixed). */
  | { state: 'blocked-other-account' }
  | { state: 'error'; message: string };

interface AccountStore {
  providerId: string;
  /** Whether sign-in can be used in this build. */
  available: boolean;
  /** Why accounts are unavailable in a configured build, if they are. */
  problem: string | null;
  loading: boolean;
  state: AccountState;
  /** The last account error, in words a LiqueAmp user understands. */
  error: string | null;
  sync: SyncView;
  init(provider: AccountProvider, cloud?: CloudProfileStore | null, problem?: string | null): Promise<void>;
  signIn(method: AuthMethod): Promise<void>;
  claimUsername(username: string): Promise<void>;
  /** Log out (D14): disconnects the session; every local thing stays exactly as it is. */
  signOut(): Promise<void>;
  /** Delete account (D15): cloud account and profile go; the local Lique stays. Needs explicit confirmation. */
  deleteAccount(options: { confirmed: boolean }): Promise<void>;
  syncNow(): Promise<void>;
  /** Answers for a needs-review sync; null cancels the sync. */
  reviewSharing(decisions: Record<string, SharingDecision> | null): Promise<void>;
  /** Explicit resolution of a conflict or an unlinked local Lique. */
  resolve(choice: 'keep-local' | 'use-cloud'): Promise<void>;
  clearError(): void;
}

let provider: AccountProvider = createLocalAccountProvider();
let cloudStore: CloudProfileStore | null = null;
let unsubscribe: (() => void) | null = null;
let userSignedOut = false;

/** The signed-in user, or null. */
export function accountUser(state: AccountState): AccountUser | null {
  return state.status === 'signed-in' ? state.session.user : null;
}

export function accountAuthMethod(state: AccountState): AuthMethod | null {
  return state.status === 'signed-in' ? state.session.authMethod : state.status === 'needs-username' ? state.authMethod : null;
}

const RETURN_KEY = 'liqueamp.authReturn';

/** The in-app path to go back to after the OAuth round trip. */
export function takeAuthReturnPath(): string {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return path && path.startsWith('/') ? path : '/settings';
  } catch {
    return '/settings';
  }
}

function message(err: unknown): string {
  if (err instanceof AccountError || err instanceof ProfileOwnershipError) return err.message;
  if (err instanceof Error && err.name === 'SyncError') return err.message;
  console.error('[account]', err);
  return 'Something went wrong with your account. Everything on this device keeps working.';
}

/** States in which nothing syncs until the user has decided. */
const WAITING: ReadonlyArray<SyncView['state']> = ['needs-review', 'conflict', 'resolve-local', 'blocked-other-account'];

export const useAccount = create<AccountStore>((set, get) => {
  let pendingDecisions: Record<string, SharingDecision> = {};

  function applyResult(r: SyncResult) {
    switch (r.status) {
      case 'needs-review':
        set({ sync: { state: 'needs-review', findings: r.findings } });
        return;
      case 'conflict':
      case 'resolve-local':
      case 'blocked-other-account':
        set({ sync: { state: r.status } });
        return;
      default:
        pendingDecisions = {};
        set({ sync: { state: 'synced', at: new Date().toISOString() } });
    }
  }

  async function runSync() {
    const user = accountUser(get().state);
    if (!user || !cloudStore) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // will run when back online
    set({ sync: { state: 'syncing' } });
    try {
      const r = await syncOwnProfile({ userId: user.userId, username: user.username, cloud: cloudStore, settings: useSettings.getState(), decisions: pendingDecisions });
      if (r.status === 'downloaded') await reloadProfileStores();
      applyResult(r);
    } catch (err) {
      set({ sync: { state: 'error', message: message(err) } });
    }
  }

  // local changes are uploaded shortly after they happen (while signed in)
  let debounce: ReturnType<typeof setTimeout> | null = null;
  onOwnProfileWrite(() => {
    if (!accountUser(get().state) || WAITING.includes(get().sync.state)) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void runSync(), 4000);
  });
  if (typeof window !== 'undefined') window.addEventListener('online', () => void (accountUser(get().state) && runSync()));

  function setState(state: AccountState) {
    const wasSignedIn = get().state.status !== 'signed-out';
    // the session ended without the user logging out: it expired
    const expired = wasSignedIn && state.status === 'signed-out' && !userSignedOut;
    set({ state, ...(expired ? { error: 'Your session has expired. Log in again to sync your Lique.' } : {}), ...(state.status === 'signed-out' ? { sync: { state: 'idle' } } : {}) });
    userSignedOut = false;
  }

  return {
    providerId: provider.id,
    available: provider.available,
    problem: null,
    loading: false,
    state: { status: 'signed-out' },
    error: null,
    sync: { state: 'idle' },

    async init(next, cloud = null, problem = null) {
      unsubscribe?.();
      provider = next;
      cloudStore = cloud;
      const oauthError = typeof location !== 'undefined' ? oauthErrorFromUrl(location.href) : null;
      set({ providerId: next.id, available: next.available, problem, loading: true, error: oauthError?.message ?? null });
      unsubscribe = next.onChange((state) => {
        const before = get().state;
        setState(state);
        if (state.status === 'signed-in' && accountUser(before)?.userId !== state.session.user.userId) void runSync();
      });
      try {
        const state = await next.getState();
        set({ state, loading: false });
        if (state.status === 'signed-in') void runSync();
      } catch (err) {
        set({ loading: false, error: message(err) });
      }
    },

    async signIn(method) {
      set({ error: null });
      try {
        try {
          const base = import.meta.env.BASE_URL.replace(/\/$/, '');
          sessionStorage.setItem(RETURN_KEY, location.pathname.slice(base.length) || '/settings');
        } catch {
          // no session storage: return to Settings
        }
        await provider.signIn({ method });
      } catch (err) {
        set({ error: message(err) });
      }
    },

    async claimUsername(username) {
      set({ error: null });
      const session = await provider.claimUsername(username); // errors reach the username form
      set({ state: { status: 'signed-in', session } });
      await runSync(); // D7: this device's Lique becomes the account's first cloud profile
    },

    async signOut() {
      set({ error: null });
      userSignedOut = true;
      try {
        await provider.signOut();
      } catch (err) {
        // the session is gone locally even if the server could not be told
        console.warn('[account] sign-out:', err);
      }
      pendingDecisions = {};
      set({ state: { status: 'signed-out' }, sync: { state: 'idle' } });
    },

    async deleteAccount({ confirmed }) {
      if (!confirmed) throw new Error('Deleting an account must be confirmed.');
      const user = accountUser(get().state);
      if (!user) throw new Error('Not logged in.');
      userSignedOut = true;
      await cloudStore?.remove(user.userId);
      await provider.deleteAccount();
      await unlinkLocalProfile();
      set({ state: { status: 'signed-out' }, sync: { state: 'idle' } });
    },

    syncNow: runSync,

    async reviewSharing(decisions) {
      if (!decisions) {
        pendingDecisions = {};
        set({ sync: { state: 'idle' } }); // cancelled: nothing uploaded
        return;
      }
      pendingDecisions = { ...pendingDecisions, ...decisions };
      await runSync();
    },

    async resolve(choice) {
      const user = accountUser(get().state);
      if (!user || !cloudStore) return;
      set({ sync: { state: 'syncing' } });
      try {
        if (choice === 'use-cloud') {
          await useCloudProfile({ userId: user.userId, cloud: cloudStore });
          await reloadProfileStores();
          applyResult({ status: 'downloaded', revision: 0 });
        } else {
          applyResult(await keepLocalProfile({ userId: user.userId, username: user.username, cloud: cloudStore, settings: useSettings.getState(), decisions: pendingDecisions }));
        }
      } catch (err) {
        set({ sync: { state: 'error', message: message(err) } });
      }
    },

    clearError: () => set({ error: null }),
  };
});
