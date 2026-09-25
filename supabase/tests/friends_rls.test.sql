-- pgTAP: friend access (one-way, read-only) and the existing ownership rules.
-- Run: npm run db:test:remote -- friends   (no Docker; see scripts/db-test-remote.mjs)
--   or: npx supabase test db --linked        (needs Docker)
-- Everything runs in one transaction that is rolled back: no test data remains.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(34);

-- ---- fixtures (as the migration owner) ----------------------------------------
create temporary table ids (name text primary key, id uuid not null) on commit drop;
insert into ids values ('a', gen_random_uuid()), ('b', gen_random_uuid()), ('c', gen_random_uuid());
grant select on ids to authenticated, anon;

insert into auth.users (id, aud, role, email, created_at, updated_at)
select id, 'authenticated', 'authenticated', 'pgtap-' || name || '@example.invalid', now(), now() from ids;
insert into public.users (id, username)
select id, case name when 'a' then 'PgtapAlice' when 'b' then 'PgtapBob' else 'PgtapCarol' end from ids;
insert into public.profiles (user_id, schema_version, data)
select id, 1, jsonb_build_object('format', 'liqueamp-profile', 'meta', jsonb_build_object('schemaVersion', 1, 'ownerUserId', id::text), 'data', jsonb_build_object('who', name)) from ids;

create function pg_temp.as_user(who text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where name = who), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.id_of(who text) returns uuid language sql as $$ select id from ids where name = who $$;

-- ---- schema ------------------------------------------------------------------------
select has_table('public', 'friendships', 'friendships table exists');
select col_is_pk('public', 'friendships', array['user_id', 'friend_id'], 'one row per (adder, added) pair');
select policies_are('public', 'friendships', array['friendships: read own', 'friendships: add own', 'friendships: remove own'], 'friendships policies: own rows only, no update');
select policies_are('public', 'profiles', array['profiles: read own', 'profiles: create own', 'profiles: update own', 'profiles: delete own', 'profiles: read Liques I added'], 'profiles policies');

-- ---- username lookup ------------------------------------------------------------------
select pg_temp.as_user('a');
select results_eq(
  $$ select user_id, username from public.lookup_username('pgtapbob') $$,
  $$ select id, 'PgtapBob'::text from ids where name = 'b' $$,
  'lookup is exact, case-insensitive, returns the id and the canonical username');
select is_empty($$ select * from public.lookup_username('PgtapNobody') $$, 'lookup of an unknown username returns nothing');
select is_empty($$ select * from public.lookup_username('Pgtap') $$, 'lookup is exact, not a prefix search');
select is(
  (select proargnames::text[] from pg_proc where oid = 'public.lookup_username(text)'::regprocedure),
  array['p_username', 'user_id', 'username'],
  'lookup exposes only user_id and username (no timestamps, auth data or profile)');

-- ---- A adds B: A may read B; B gains nothing ------------------------------------------------
select is_empty($$ select 1 from public.profiles where user_id = pg_temp.id_of('b') $$, 'before adding, A cannot read B''s profile');
select lives_ok($$ insert into public.friendships (user_id, friend_id) values (pg_temp.id_of('a'), pg_temp.id_of('b')) $$, 'A can add B');
select results_eq($$ select data -> 'data' ->> 'who' from public.profiles where user_id = pg_temp.id_of('b') $$, $$ values ('b') $$, 'A can read B''s profile after adding B');
select results_eq($$ select username from public.users where id = pg_temp.id_of('b') $$, $$ values ('PgtapBob'::text) $$, 'A can read B''s username');
select is_empty($$ update public.profiles set data = data where user_id = pg_temp.id_of('b') returning 1 $$, 'A cannot update B''s profile (read-only)');
select is_empty($$ delete from public.profiles where user_id = pg_temp.id_of('b') returning 1 $$, 'A cannot delete B''s profile');
select throws_ok($$ insert into public.friendships (user_id, friend_id) values (pg_temp.id_of('a'), pg_temp.id_of('b')) $$, '23505', null, 'adding the same person twice is refused');
select throws_ok($$ insert into public.friendships (user_id, friend_id) values (pg_temp.id_of('a'), pg_temp.id_of('a')) $$, '23514', null, 'A cannot add themself');
select throws_ok($$ insert into public.friendships (user_id, friend_id) values (pg_temp.id_of('b'), pg_temp.id_of('a')) $$, '42501', null, 'A cannot create a relationship pretending to be B');
select throws_ok($$ update public.friendships set friend_id = pg_temp.id_of('c') where user_id = pg_temp.id_of('a') $$, '42501', null, 'relationships cannot be rewritten');

select pg_temp.as_user('b');
select is_empty($$ select 1 from public.profiles where user_id = pg_temp.id_of('a') $$, 'B cannot read A''s profile (one-way)');
select is_empty($$ select 1 from public.users where id = pg_temp.id_of('a') $$, 'B cannot read A''s users row');
select is_empty($$ select 1 from public.friendships $$, 'B does not see that A added them');

-- ---- unrelated users and other people's relationships ----------------------------------------
select pg_temp.as_user('a');
select is_empty($$ select 1 from public.profiles where user_id = pg_temp.id_of('c') $$, 'A cannot read an unrelated user''s profile');
select is_empty($$ select 1 from public.users where id = pg_temp.id_of('c') $$, 'A cannot read an unrelated user''s users row');

select pg_temp.as_user('c');
select lives_ok($$ insert into public.friendships (user_id, friend_id) values (pg_temp.id_of('c'), pg_temp.id_of('b')) $$, 'C adds B as well');
select pg_temp.as_user('a');
select is_empty($$ delete from public.friendships where user_id = pg_temp.id_of('c') returning 1 $$, 'A cannot remove C''s relationship');
select pg_temp.as_owner();
select is((select count(*)::int from public.friendships where user_id = pg_temp.id_of('c')), 1, 'C''s relationship is still there');

-- ---- A removes B -------------------------------------------------------------------------------
select pg_temp.as_user('a');
select isnt_empty($$ delete from public.friendships where user_id = pg_temp.id_of('a') and friend_id = pg_temp.id_of('b') returning 1 $$, 'A can remove B');
select is_empty($$ select 1 from public.profiles where user_id = pg_temp.id_of('b') $$, 'after removal A can no longer read B''s profile');
select is_empty($$ select 1 from public.users where id = pg_temp.id_of('b') $$, 'after removal A can no longer read B''s username');

-- ---- existing ownership rules still hold ----------------------------------------------------------
select results_eq($$ select data -> 'data' ->> 'who' from public.profiles where user_id = pg_temp.id_of('a') $$, $$ values ('a') $$, 'A still reads its own profile');
select results_eq($$ update public.profiles set data = data where user_id = pg_temp.id_of('a') returning revision $$, $$ values (2) $$, 'A still updates its own profile; the server counts the revision');

-- ---- anon ------------------------------------------------------------------------------------------
select pg_temp.as_owner();
select set_config('role', 'anon', true);
select throws_ok($$ select 1 from public.friendships $$, '42501', null, 'anon cannot read relationships');
select throws_ok($$ select * from public.lookup_username('PgtapBob') $$, '42501', null, 'anon cannot look up usernames');

-- ---- account deletion removes relationships in both directions -----------------------------------------
select pg_temp.as_user('b');
select public.delete_my_account();
select pg_temp.as_owner();
select is((select count(*)::int from public.friendships where friend_id = pg_temp.id_of('b') or user_id = pg_temp.id_of('b')), 0, 'deleting B removes every relationship to or from B');

select * from finish();
rollback;
