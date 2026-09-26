-- pgTAP: privacy hardening (checkpoint 10A). D12 is unchanged: an exact
-- username lets a signed-in user add its owner and read their Lique.
-- Run: npm run db:test:remote -- privacy   (no Docker; rolled back)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

create temporary table ids (name text primary key, id uuid not null) on commit drop;
insert into ids values ('a', gen_random_uuid()), ('b', gen_random_uuid()), ('c', gen_random_uuid()), ('d', gen_random_uuid());
grant select on ids to authenticated, anon;
insert into auth.users (id, aud, role, email, created_at, updated_at)
select id, 'authenticated', 'authenticated', 'pgtap10-' || name || '@example.invalid', now(), now() from ids;
insert into public.users (id, username)
select id, case name when 'a' then 'PgtapAda' when 'b' then 'PgtapBea' else 'PgtapCid' end from ids where name in ('a', 'b', 'c');
insert into public.profiles (user_id, schema_version, data)
select id, 1, jsonb_build_object('format', 'liqueamp-profile', 'meta', jsonb_build_object('schemaVersion', 1, 'ownerUserId', id::text), 'data', jsonb_build_object('who', name)) from ids where name in ('a', 'b');

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

-- ---- visibility says what D12 does ----
select is((select visibility from public.profiles where user_id = pg_temp.id_of('a')), 'FRIENDS', 'a new cloud profile is FRIENDS: readable by whoever adds its owner');
select is((select count(*)::int from public.profiles where visibility <> 'FRIENDS'), 0, 'no profile is labelled otherwise');
select pg_temp.as_user('a');
select results_eq($$ update public.profiles set visibility = 'PRIVATE' where user_id = pg_temp.id_of('a') returning visibility $$, $$ values ('FRIENDS'::text) $$, 'the client cannot change it');

-- ---- exact username lookup, unchanged ----
select results_eq($$ select username from public.lookup_username('pgtapbea') $$, $$ values ('PgtapBea'::text) $$, 'exact, case-insensitive lookup works');
select is_empty($$ select * from public.lookup_username('Pgtap%') $$, '% is no wildcard');
select is_empty($$ select * from public.lookup_username('PgtapBe_') $$, '_ is no wildcard');
select is_empty($$ select * from public.lookup_username('PgtapBe') $$, 'no prefix match');
select is(
  (select proargnames::text[] from pg_proc where oid = 'public.lookup_username(text)'::regprocedure),
  array['p_username', 'user_id', 'username'],
  'still returns only user_id and username');

-- ---- rate limit: 30 per 15 minutes per account ----
-- A has used 4 lookups above; 26 more reach the limit
-- the argument depends on g, so the function really runs once per row
select is((select count(*)::int from generate_series(1, 26) g, lateral public.lookup_username('PgtapBea' || left(g::text, 0)) r), 26, 'lookups up to the limit work');
select throws_ok($$ select * from public.lookup_username('PgtapBea') $$, 'LQ429', null, 'the 31st lookup within 15 minutes is refused');
select pg_temp.as_user('b');
select results_eq($$ select username from public.lookup_username('PgtapAda') $$, $$ values ('PgtapAda'::text) $$, 'the limit is per account: B is not affected');

-- 200 per day
select pg_temp.as_owner();
insert into private.username_lookups (user_id, looked_up_at) select pg_temp.id_of('c'), now() - interval '2 hours' from generate_series(1, 200);
insert into private.username_lookups (user_id, looked_up_at) values (pg_temp.id_of('b'), now() - interval '2 days');
select pg_temp.as_user('c');
select throws_ok($$ select * from public.lookup_username('PgtapAda') $$, 'LQ429', null, 'more than 200 lookups in 24 hours are refused');
select pg_temp.as_user('b');
select lives_ok($$ select * from public.lookup_username('PgtapAda') $$, 'B can still look up');
select pg_temp.as_owner();
select is((select count(*)::int from private.username_lookups where user_id = pg_temp.id_of('b') and looked_up_at < now() - interval '1 day'), 0, 'entries older than a day are removed');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE') and not has_schema_privilege('anon', 'private', 'USAGE'), 'the lookup log is not reachable through the API');

-- ---- friend access is unchanged ----
select pg_temp.as_user('a');
select lives_ok($$ insert into public.friendships (user_id, friend_id) values (pg_temp.id_of('a'), pg_temp.id_of('b')) $$, 'A adds B');
select results_eq($$ select data -> 'data' ->> 'who' from public.profiles where user_id = pg_temp.id_of('b') $$, $$ values ('b') $$, 'A reads B''s Lique');
select is_empty($$ update public.profiles set data = data where user_id = pg_temp.id_of('b') returning 1 $$, 'A cannot modify B''s Lique');
select pg_temp.as_user('c');
select is_empty($$ select 1 from public.profiles where user_id = pg_temp.id_of('b') $$, 'C (has not added B) cannot read B''s Lique');
select pg_temp.as_user('b');
select is_empty($$ select 1 from public.profiles where user_id = pg_temp.id_of('a') $$, 'B did not gain access to A (one-way)');

-- ---- summary size ----
select pg_temp.as_user('a');
select lives_ok($$ update public.profiles set summary = jsonb_build_object('pad', repeat('x', 1000)) where user_id = pg_temp.id_of('a') $$, 'a normal summary is stored');
select throws_ok($$ update public.profiles set summary = jsonb_build_object('pad', repeat('x', 17000)) where user_id = pg_temp.id_of('a') $$, '23514', null, 'an oversized summary (> 16 KB) is refused');

-- ---- privileges ----
select ok(not has_table_privilege('authenticated', 'public.users', 'UPDATE') and not has_table_privilege('authenticated', 'public.users', 'DELETE') and not has_table_privilege('authenticated', 'public.users', 'TRUNCATE'), 'users: no UPDATE, DELETE or TRUNCATE');
select ok(has_table_privilege('authenticated', 'public.users', 'SELECT') and has_table_privilege('authenticated', 'public.users', 'INSERT'), 'users: SELECT and INSERT kept');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE') and not has_table_privilege('authenticated', 'public.profiles', 'REFERENCES'), 'profiles: no TRUNCATE or REFERENCES');
select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT') and has_table_privilege('authenticated', 'public.profiles', 'INSERT') and has_table_privilege('authenticated', 'public.profiles', 'UPDATE') and has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'profiles: SELECT, INSERT, UPDATE, DELETE kept');
select ok(not has_table_privilege('anon', 'public.users', 'SELECT') and not has_table_privilege('anon', 'public.profiles', 'SELECT') and not has_table_privilege('anon', 'public.friendships', 'SELECT'), 'anon: no table access');

-- ---- account flows ----
select pg_temp.as_user('d');
select lives_ok($$ insert into public.users (id, username) values (pg_temp.id_of('d'), 'PgtapDee') $$, 'a new account claims its username');
select lives_ok($$ insert into public.profiles (user_id, schema_version, data) values (pg_temp.id_of('d'), 1, jsonb_build_object('format', 'liqueamp-profile', 'meta', jsonb_build_object('schemaVersion', 1, 'ownerUserId', pg_temp.id_of('d')::text), 'data', '{}'::jsonb)) $$, 'and uploads its first profile');
select pg_temp.as_user('a');
select lives_ok($$ select public.delete_my_account() $$, 'account deletion works');
select pg_temp.as_owner();
select is((select count(*)::int from private.username_lookups where user_id = pg_temp.id_of('a')), 0, 'the deleted account''s lookup log is gone too');

select * from finish();
rollback;
