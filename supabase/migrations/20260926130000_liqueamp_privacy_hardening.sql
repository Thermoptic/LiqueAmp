-- LiqueAmp privacy hardening (checkpoint 10A). D12 is unchanged: anyone who
-- knows an exact username may add that user and then read their shared Lique
-- (read-only; one-way). This migration makes the stored terminology say so,
-- slows down username guessing, bounds the profile summary and removes
-- privileges nothing uses. No policy changes: RLS stays the authority.

-- ---------------------------------------------------------------------------
-- 1. Visibility: a cloud profile is readable by everyone who added its owner
-- ---------------------------------------------------------------------------
-- 'PRIVATE' said "nobody", but since checkpoint 6 anyone who adds the user
-- by exact username can read the profile (D12). 'FRIENDS' is that meaning:
-- "the people who added me". The column is still set by the server only.
create or replace function public.profiles_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.data ->> 'format' is distinct from 'liqueamp-profile' then
    raise exception 'not a LiqueAmp profile' using errcode = '22023';
  end if;
  if jsonb_typeof(new.data -> 'meta') is distinct from 'object' or jsonb_typeof(new.data -> 'data') is distinct from 'object' then
    raise exception 'profile has no meta or data section' using errcode = '22023';
  end if;
  -- the profile inside must name its real owner: the row, not the browser, decides
  if new.data -> 'meta' ->> 'ownerUserId' is distinct from new.user_id::text then
    raise exception 'profile owner does not match' using errcode = '22023';
  end if;
  new.schema_version := coalesce((new.data -> 'meta' ->> 'schemaVersion')::integer, new.schema_version);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.visibility := 'FRIENDS';         -- D12: readable by whoever adds the owner by username
    new.created_at := now();
  else
    new.user_id := old.user_id;          -- a profile never changes owner
    new.revision := old.revision + 1;    -- the server counts revisions
    new.visibility := old.visibility;    -- not changeable from the client
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

alter table public.profiles alter column visibility set default 'FRIENDS';

-- Existing rows get the accurate label without a new revision (the trigger
-- would count this as a profile change and make every client resync).
alter table public.profiles disable trigger profiles_guard;
update public.profiles set visibility = 'FRIENDS' where visibility <> 'FRIENDS';
alter table public.profiles enable trigger profiles_guard;

-- ---------------------------------------------------------------------------
-- 2. Username lookup: exact as before, but not at machine speed
-- ---------------------------------------------------------------------------
-- Each signed-in user may look up at most 30 usernames per 15 minutes and 200
-- per 24 hours. Plenty for adding friends; it makes guessing usernames with a
-- word list slow. Per account only: someone with many accounts gets more.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.username_lookups (
  user_id uuid not null references auth.users (id) on delete cascade,
  looked_up_at timestamptz not null default now()
);
create index username_lookups_user_time_idx on private.username_lookups (user_id, looked_up_at);
alter table private.username_lookups enable row level security;
revoke all on private.username_lookups from public, anon, authenticated;

create or replace function public.lookup_username(p_username text)
returns table (user_id uuid, username text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  last_15_minutes integer;
  last_day integer;
begin
  if me is null then
    return;
  end if;
  delete from private.username_lookups l where l.user_id = me and l.looked_up_at < now() - interval '1 day';
  select count(*) filter (where l.looked_up_at > now() - interval '15 minutes'), count(*)
    into last_15_minutes, last_day
    from private.username_lookups l
   where l.user_id = me;
  if last_15_minutes >= 30 or last_day >= 200 then
    raise exception 'too many username lookups' using errcode = 'LQ429';
  end if;
  insert into private.username_lookups (user_id) values (me);
  -- exact, case-insensitive; only the id and the username as its owner wrote it
  return query
    select u.id, u.username
      from public.users u
     where lower(u.username) = lower(trim(both from p_username))
     limit 1;
end;
$$;

revoke all on function public.lookup_username(text) from public, anon;
grant execute on function public.lookup_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The summary is a lightweight preview (a few hundred bytes); 16 KB is ample
-- ---------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_summary_size check (summary is null or octet_length(summary::text) <= 16384);

-- ---------------------------------------------------------------------------
-- 4. Privileges: only what the app uses (RLS stays the authorization layer)
-- ---------------------------------------------------------------------------
-- users:    SELECT, INSERT (claim a username)            — kept
-- profiles: SELECT, INSERT, UPDATE, DELETE (own profile)  — kept
-- friendships: SELECT, INSERT, DELETE                      — already exact
revoke update, delete, truncate, references, trigger on public.users from authenticated;
revoke truncate, references, trigger on public.profiles from authenticated;

-- Future tables, sequences and functions in public get no privileges for the
-- API roles by default; every migration grants what it needs explicitly.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
