// FriendDirectory on public.friendships (checkpoint 6). The rules are the
// database's (supabase/migrations/*_liqueamp_friends.sql): RLS lets me see,
// add and remove only my own outgoing rows, and gives me read-only access to
// the users/profiles rows of the people I added. The checks here only turn
// the server's answers into friendly errors.
import { checkUsername } from '../account/username';
import { friendError, type Friend, type FriendDirectory } from '../friends/friends';
import { readStoredSummary, summarizeProfileText } from '../friends/friendSummary';
import { backendCall, toAccountError } from './errors';
import type { SupabaseLike } from './supabaseClient';
import { createSupabaseProfileStore } from './supabaseProfiles';

export function createSupabaseFriendDirectory(client: SupabaseLike): FriendDirectory {
  const profiles = createSupabaseProfileStore(client);

  async function me(): Promise<string> {
    const { data, error } = await backendCall(client.auth.getSession());
    if (error) throw toAccountError(error);
    const id = data.session?.user.id;
    if (!id) throw friendError('not-signed-in');
    return id;
  }

  return {
    async add(input) {
      const check = checkUsername(input);
      if (!check.ok) throw friendError('username-invalid');
      const userId = await me();
      const found = await backendCall(client.rpc('lookup_username', { p_username: check.username }));
      if (found.error) throw toAccountError(found.error);
      const target = (Array.isArray(found.data) ? found.data[0] : null) as { user_id?: string; username?: string } | null;
      if (!target?.user_id) throw friendError('not-found');
      if (target.user_id === userId) throw friendError('self');
      const { data, error } = await backendCall(client.from('friendships').insert({ user_id: userId, friend_id: target.user_id }).select('friend_id, created_at').single());
      if (error?.code === '23505') throw friendError('already-added', error);
      if (error?.code === '23514') throw friendError('self', error);
      if (error?.code === '23503') throw friendError('not-found', error); // deleted between lookup and insert
      if (error) throw toAccountError(error);
      return { userId: target.user_id, username: String(target.username ?? check.username), addedAt: String(data?.created_at ?? '') };
    },

    async list() {
      const userId = await me();
      const rows = await backendCall(client.from('friendships').select('friend_id, created_at').eq('user_id', userId));
      if (rows.error) throw toAccountError(rows.error);
      const added = rows.data ?? [];
      if (added.length === 0) return [];
      const names = await backendCall(client.from('users').select('id, username').in('id', added.map((r) => r.friend_id)));
      if (names.error) throw toAccountError(names.error);
      const username = new Map((names.data ?? []).map((u) => [String(u.id), String(u.username)]));
      return added
        .filter((r) => username.has(String(r.friend_id))) // gone between the two reads
        .map((r): Friend => ({ userId: String(r.friend_id), username: username.get(String(r.friend_id))!, addedAt: String(r.created_at ?? '') }))
        .sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
    },

    async remove(friendUserId) {
      const userId = await me();
      const { error } = await backendCall(client.from('friendships').delete().eq('user_id', userId).eq('friend_id', friendUserId));
      if (error) throw toAccountError(error);
    },

    readProfile: (friendUserId) => profiles.download(friendUserId),

    async readSummary(friendUserId) {
      // the lightweight summary stored with the profile (spec §12: not the whole profile just for a preview)
      const { data, error } = await backendCall(client.from('profiles').select('revision, updated_at, summary').eq('user_id', friendUserId).maybeSingle());
      if (error) throw toAccountError(error);
      if (!data || typeof data.revision !== 'number') return null;
      const head = { revision: data.revision, updatedAt: String(data.updated_at ?? '') };
      const stored = readStoredSummary(data.summary, head);
      if (stored) return stored;
      // no usable summary: validate and summarize the full profile instead
      const doc = await profiles.download(friendUserId);
      if (!doc) return null;
      const derived = summarizeProfileText(doc.text, { revision: doc.revision, updatedAt: doc.updatedAt });
      if (!derived) throw friendError('profile-invalid');
      return derived;
    },
  };
}
