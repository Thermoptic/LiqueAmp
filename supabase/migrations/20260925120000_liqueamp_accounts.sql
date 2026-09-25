-- LiqueAmp accounts and cloud profiles (checkpoint 5).
-- Decisions: docs/LIQUEAMP_IMPLEMENTATION_PLAN.md §30 (D5–D9, D12, D14–D16).
--
-- Identity is Supabase Auth (auth.users). LiqueAmp stores no passwords and no
-- auth data; public.users.id IS the auth user UUID. The username is the
-- human-facing identity (unique, case-insensitive) but never a key.
-- Every rule that decides ownership lives here (RLS + triggers); the browser
-- is never trusted.

-- ---------------------------------------------------------------------------
-- users: the LiqueAmp identity of an auth user
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- D6: 3–20 letters or digits, no spaces. Kept in sync with
  -- src/services/account/username.ts.
  constraint users_username_format check (username ~ '^[A-Za-z0-9]{3,20}$'),
  constraint users_username_not_reserved check (
    lower(username) <> all (array['admin', 'administrator', 'liqueamp', 'support', 'system', 'root', 'moderator', 'official', 'null', 'undefined', 'anonymous', 'everyone'])
  )
);

-- D6: unique case-insensitively, enforced by the database (not by a SELECT
-- before INSERT). "Johan" and "johan" cannot both exist.
create unique index users_username_lower_key on public.users (lower(username));

-- ---------------------------------------------------------------------------
-- profiles: one cloud LiqueAmpProfile per user
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  -- D9: owned by the server. Set to 1 on insert and +1 on every update by
  -- the trigger below; whatever the client sends is ignored.
  revision integer not null default 1 check (revision >= 1),
  schema_version integer not null check (schema_version >= 1),
  -- D12: private by default. Friend read access comes in the Friend Liques
  -- checkpoint (one-way relationships); nothing here is public.
  visibility text not null default 'PRIVATE' check (visibility in ('PRIVATE', 'FRIENDS', 'PUBLIC')),
  -- the serialized LiqueAmpProfile (format 'liqueamp-profile'), already
  -- checked for credentials in URLs by the client (D13)
  data jsonb not null,
  -- the lightweight summary for future Friend Lique previews
  summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a shared profile stays small (client limit: MAX_PROFILE_BYTES = 5 MB)
  constraint profiles_data_size check (octet_length(data::text) <= 5242880)
);

-- Server-side structure check and server-owned fields.
create function public.profiles_guard() returns trigger
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
    new.visibility := 'PRIVATE';
    new.created_at := now();
  else
    new.user_id := old.user_id;          -- a profile never changes owner
    new.revision := old.revision + 1;    -- the server counts revisions
    new.visibility := old.visibility;    -- not changeable from the client yet
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
before insert or update on public.profiles
for each row execute function public.profiles_guard();

create function public.users_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger users_touch
before insert or update on public.users
for each row execute function public.users_touch();

-- ---------------------------------------------------------------------------
-- Row Level Security: a user sees and changes only their own rows
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.profiles enable row level security;

create policy "users: read own" on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy "users: create own" on public.users
  for insert to authenticated with check (id = (select auth.uid()));
-- no update policy: usernames cannot be changed yet (D6 rename policy is open)
-- no delete policy: accounts are deleted with delete_my_account()

create policy "profiles: read own" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles: create own" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "profiles: delete own" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));
-- Friend read access (one-way, D12) is added in the Friend Liques checkpoint.

revoke all on public.users, public.profiles from anon;
grant select, insert on public.users to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Delete account (D15): removes the auth user; users and profiles rows
-- cascade, which releases the username. Local LiqueAmp data is untouched
-- (it is in the browser, not here).
-- ---------------------------------------------------------------------------
create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
