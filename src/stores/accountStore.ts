import { create } from 'zustand';
import { createLocalAccountProvider, type AccountProvider, type AccountState, type AccountUser } from '../services/account/account';
import type { CloudProfileStore } from '../services/sync/cloudProfile';
import { unlinkLocalProfile } from '../services/sync/profileSync';

interface AccountStore {
  providerId: string;
  /** Whether accounts can be used in this build at all. */
  available: boolean;
  state: AccountState;
  /** Connects a provider (the local no-account provider by default). */
  init(provider: AccountProvider, cloud?: CloudProfileStore | null): Promise<void>;
  /** Log out (D14): disconnects the session; every local thing stays exactly as it is. */
  signOut(): Promise<void>;
  /**
   * Delete account (D15): permanently deletes the cloud profile and account;
   * the local Lique stays on this device and is no longer linked to it.
   * `confirmed` must be passed explicitly — the UI asks first.
   */
  deleteAccount(options: { confirmed: boolean }): Promise<void>;
}

let provider: AccountProvider = createLocalAccountProvider();
let cloudStore: CloudProfileStore | null = null;
let unsubscribe: (() => void) | null = null;

/** The signed-in user, or null. */
export function accountUser(state: AccountState): AccountUser | null {
  return state.status === 'signed-in' ? state.session.user : null;
}

export const useAccount = create<AccountStore>((set, get) => ({
  providerId: provider.id,
  available: provider.available,
  state: { status: 'signed-out' },

  async init(next, cloud = null) {
    unsubscribe?.();
    provider = next;
    cloudStore = cloud;
    set({ providerId: next.id, available: next.available });
    unsubscribe = next.onChange((state) => set({ state }));
    const session = await next.getSession();
    set({ state: session ? { status: 'signed-in', session } : { status: 'signed-out' } });
  },

  async signOut() {
    await provider.signOut();
    set({ state: { status: 'signed-out' } });
  },

  async deleteAccount({ confirmed }) {
    if (!confirmed) throw new Error('Deleting an account must be confirmed.');
    const user = accountUser(get().state);
    if (!user) throw new Error('Not logged in.');
    await cloudStore?.remove(user.userId);
    await provider.deleteAccount();
    await unlinkLocalProfile();
    set({ state: { status: 'signed-out' } });
  },
}));
