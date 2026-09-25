-- LiqueAmp friend access foundation (Friend Liques, checkpoint 6).
-- Decisions: docs/LIQUEAMP_IMPLEMENTATION_PLAN.md §30 D12, D17.
--
-- One-way relationships, no requests: when A adds B, A gains READ-ONLY
-- access to B's Lique (B's profile row and username). B gains nothing and
-- does not see who added them. All rules live here (RLS); the client is
-- never trusted. Block (D17) is a later step.

-- ---------------------------------------------------------------------------
-- friendships: "user_id added friend_id"
-- ---------------------------------------------------------------------------
create table public.friendships (
  user_id uuid not null references public.users (id) on delete cascade,   -- the viewer (who added)
  friend_id uuid not null references public.users (id) on delete cascade, -- whose Lique the viewer may read
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),                                      -- no duplicates
  constraint friendships_not_self check (user_id <> friend_id)
);

-- "who may read this Lique" lookups (profiles/users policies below)
create index friendships_friend_id_idx on public.friendships (friend_id);

alter table public.friendships enable row level security;

-- Only the adder sees, creates and removes their own outgoing relationships.
create policy "friendships: read own" on public.friendships
  for select to authenticated using (user_id = (select auth.uid()));
create policy "friendships: add own" on public.friendships
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "friendships: remove own" on public.friendships
  for delete to authenticated using (user_id = (select auth.uid()));
-- no update policy: a relationship is added or removed, never rewritten

revoke all on public.friendships from anon, authenticated;
grant select, insert, delete on public.friendships to authenticated;

-- ---------------------------------------------------------------------------
-- Read access that follows from a relationship (D12: adder → added, read-only)
-- ---------------------------------------------------------------------------
create policy "users: read people I added" on public.users
  for select to authenticated using (
    exists (select 1 from public.friendships f where f.user_id = (select auth.uid()) and f.friend_id = users.id)
  );

create policy "profiles: read Liques I added" on public.profiles
  for select to authenticated using (
    exists (select 1 from public.friendships f where f.user_id = (select auth.uid()) and f.friend_id = profiles.user_id)
  );
-- Insert/update/delete on profiles stay "own" only (checkpoint 5 policies):
-- a friend's profile is read-only to the viewer.

-- ---------------------------------------------------------------------------
-- Username lookup for Add Friend
-- ---------------------------------------------------------------------------
-- The only way to see a user one has not added. Exact, case-insensitive
-- match; returns the opaque user id and the username as its owner wrote it —
-- nothing else (no timestamps, no auth data, no profile). Signed-in users only.
create function public.lookup_username(p_username text)
returns table (user_id uuid, username text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.username
  from public.users u
  where (select auth.uid()) is not null
    and lower(u.username) = lower(trim(both from p_username))
  limit 1;
$$;

revoke all on function public.lookup_username(text) from public, anon;
grant execute on function public.lookup_username(text) to authenticated;
