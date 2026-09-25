// CloudProfileStore on the public.profiles table (D9). The server owns the
// revision (trigger: 1 on insert, +1 on update) and RLS limits every call to
// the signed-in user's own row. Compare-and-swap: an update only matches the
// row while it is still at the expected revision.
import type { CloudProfileHead, CloudProfileStore, CloudUploadResult } from '../sync/cloudProfile';
import { backendCall, toAccountError } from './errors';
import type { SupabaseLike } from './supabaseClient';

const head = (row: Record<string, unknown> | null | undefined): CloudProfileHead | null =>
  row && typeof row.revision === 'number' ? { revision: row.revision, updatedAt: String(row.updated_at ?? '') } : null;

export function createSupabaseProfileStore(client: SupabaseLike): CloudProfileStore {
  async function readHead(userId: string): Promise<CloudProfileHead | null> {
    const { data, error } = await backendCall(client.from('profiles').select('revision, updated_at').eq('user_id', userId).maybeSingle());
    if (error) throw toAccountError(error);
    return head(data);
  }

  return {
    head: readHead,

    async download(userId) {
      const { data, error } = await backendCall(client.from('profiles').select('revision, updated_at, data').eq('user_id', userId).maybeSingle());
      if (error) throw toAccountError(error);
      const h = head(data);
      return h && data ? { ...h, text: JSON.stringify(data.data) } : null;
    },

    async upload(userId, { text, summary, expectedRevision }): Promise<CloudUploadResult> {
      const profile = JSON.parse(text) as { meta?: { schemaVersion?: number } };
      const values = { data: profile, summary, schema_version: profile.meta?.schemaVersion ?? 1 };
      if (expectedRevision === 0) {
        const { data, error } = await backendCall(client.from('profiles').insert({ user_id: userId, ...values }).select('revision, updated_at').single());
        if (error?.code === '23505') return { ok: false, reason: 'conflict', cloud: (await readHead(userId)) ?? { revision: 0, updatedAt: '' } };
        if (error) throw toAccountError(error);
        const h = head(data)!;
        return { ok: true, revision: h.revision, updatedAt: h.updatedAt };
      }
      const { data, error } = await backendCall(client.from('profiles').update(values).eq('user_id', userId).eq('revision', expectedRevision).select('revision, updated_at'));
      if (error) throw toAccountError(error);
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return { ok: false, reason: 'conflict', cloud: (await readHead(userId)) ?? { revision: 0, updatedAt: '' } };
      const h = head(row)!;
      return { ok: true, revision: h.revision, updatedAt: h.updatedAt };
    },

    async remove(userId) {
      const { error } = await backendCall(client.from('profiles').delete().eq('user_id', userId));
      if (error) throw toAccountError(error);
    },
  };
}
