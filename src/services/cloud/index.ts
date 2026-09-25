// Chooses the account backend for this build: Supabase when the build has a
// public configuration (VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY),
// otherwise the local no-account provider. Either way LiqueAmp starts and
// plays without the network (local-first, D16).
import { createLocalAccountProvider, type AccountProvider } from '../account/account';
import { authCallbackUrl, readCloudConfig } from '../account/config';
import type { FriendDirectory } from '../friends/friends';
import type { CloudProfileStore } from '../sync/cloudProfile';
import { toAccountError } from './errors';
import { createSupabaseAccountProvider } from './supabaseAccount';
import { createSupabaseFriendDirectory } from './supabaseFriends';
import { createSupabaseProfileStore } from './supabaseProfiles';
import { loadSupabaseClient } from './supabaseClient';

export interface CloudServices {
  provider: AccountProvider;
  cloud: CloudProfileStore | null;
  /** Friend access (checkpoint 6); null without an account backend. Not wired to the UI yet. */
  friends: FriendDirectory | null;
  /** Why accounts are not available although the build is configured (shown in Settings). */
  problem: string | null;
}

export async function createCloudServices(env?: Record<string, string | undefined>): Promise<CloudServices> {
  const local: CloudServices = { provider: createLocalAccountProvider(), cloud: null, friends: null, problem: null };
  let config;
  try {
    config = readCloudConfig(env);
  } catch (err) {
    console.error('[account] invalid cloud configuration:', err);
    return { ...local, problem: 'Accounts are misconfigured in this build.' };
  }
  if (!config) return local;
  try {
    const client = await loadSupabaseClient(config);
    return {
      provider: createSupabaseAccountProvider(client, { redirectTo: () => authCallbackUrl() }),
      cloud: createSupabaseProfileStore(client),
      friends: createSupabaseFriendDirectory(client),
      problem: null,
    };
  } catch (err) {
    // e.g. the account code could not be downloaded while offline
    return { ...local, problem: toAccountError(err, 'offline').message };
  }
}
