begin;
-- Test helpers (rolled back with the transaction)
create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.create_user(uid uuid, email text)
returns uuid language sql security definer set search_path = '' as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', email, '', now(), now())
  returning id;
$$;

create or replace function tests.authenticate_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.clear_authentication()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;

select plan(17);

-- Fixtures (as postgres, RLS bypassed)
select tests.create_user('aaaaaaaa-0000-7000-8000-000000000001', 'a-hse@test.local');
select tests.create_user('aaaaaaaa-0000-7000-8000-000000000002', 'a-worker@test.local');
select tests.create_user('bbbbbbbb-0000-7000-8000-000000000001', 'b-admin@test.local');
select tests.create_user('cccccccc-0000-7000-8000-000000000001', 'both@test.local');

insert into public.companies (id, name) values
  ('aaaaaaaa-0000-7000-8000-00000000000a', 'Company A'),
  ('bbbbbbbb-0000-7000-8000-00000000000b', 'Company B');

insert into public.memberships (company_id, user_id, role, created_at) values
  ('aaaaaaaa-0000-7000-8000-00000000000a', 'aaaaaaaa-0000-7000-8000-000000000001', 'hse', now()),
  ('aaaaaaaa-0000-7000-8000-00000000000a', 'aaaaaaaa-0000-7000-8000-000000000002', 'worker', now()),
  ('bbbbbbbb-0000-7000-8000-00000000000b', 'bbbbbbbb-0000-7000-8000-000000000001', 'admin', now()),
  ('aaaaaaaa-0000-7000-8000-00000000000a', 'cccccccc-0000-7000-8000-000000000001', 'worker', now() - interval '1 day'),
  ('bbbbbbbb-0000-7000-8000-00000000000b', 'cccccccc-0000-7000-8000-000000000001', 'admin', now());

-- User of company A
select tests.authenticate_as('aaaaaaaa-0000-7000-8000-000000000001');

select is(public.current_company_id(), 'aaaaaaaa-0000-7000-8000-00000000000a'::uuid, 'A user: active company is A');
select results_eq(
  'select id from public.companies',
  $$ values ('aaaaaaaa-0000-7000-8000-00000000000a'::uuid) $$,
  'A user sees only company A'
);
select is_empty(
  $$ select 1 from public.companies where id = 'bbbbbbbb-0000-7000-8000-00000000000b' $$,
  'A user cannot read company B'
);
select is_empty(
  $$ select 1 from public.memberships where company_id = 'bbbbbbbb-0000-7000-8000-00000000000b' $$,
  'A user cannot read company B memberships'
);
select is((select count(*)::int from public.memberships), 3, 'A user sees the 3 memberships of company A');

-- Non-admin cannot write memberships, nor touch company B
select throws_ok(
  $$ insert into public.memberships (company_id, user_id, role)
     values ('aaaaaaaa-0000-7000-8000-00000000000a', 'bbbbbbbb-0000-7000-8000-000000000001', 'worker') $$,
  '42501', null, 'non-admin cannot add memberships'
);
select throws_ok(
  $$ insert into public.memberships (company_id, user_id, role)
     values ('bbbbbbbb-0000-7000-8000-00000000000b', 'aaaaaaaa-0000-7000-8000-000000000001', 'admin') $$,
  '42501', null, 'A user cannot insert into company B'
);
update public.companies set name = 'hacked' where id = 'bbbbbbbb-0000-7000-8000-00000000000b';
select throws_ok(
  $$ select public.set_active_company('bbbbbbbb-0000-7000-8000-00000000000b') $$,
  '42501', null, 'A user cannot switch into company B'
);
select is(public.has_role(array['hse']::public.member_role[]), true, 'has_role true for own role');
select is(public.has_role(array['admin']::public.member_role[]), false, 'has_role false for other role');

-- Company B admin
select tests.authenticate_as('bbbbbbbb-0000-7000-8000-000000000001');
select is((select name from public.companies), 'Company B', 'B admin sees company B unchanged by A');
update public.memberships set role = 'admin' where company_id = 'aaaaaaaa-0000-7000-8000-00000000000a';
select tests.clear_authentication();
select is(
  (select count(*)::int from public.memberships where company_id = 'aaaaaaaa-0000-7000-8000-00000000000a' and role = 'admin'),
  0, 'B admin cannot update company A memberships'
);

-- Member of both companies: switcher
select tests.authenticate_as('cccccccc-0000-7000-8000-000000000001');
select is((select count(*)::int from public.my_companies()), 2, 'my_companies lists both companies');
select is(public.current_company_id(), 'aaaaaaaa-0000-7000-8000-00000000000a'::uuid, 'defaults to oldest membership');
select public.set_active_company('bbbbbbbb-0000-7000-8000-00000000000b');
select is(public.current_company_id(), 'bbbbbbbb-0000-7000-8000-00000000000b'::uuid, 'switch to B');
select results_eq('select id from public.companies', $$ values ('bbbbbbbb-0000-7000-8000-00000000000b'::uuid) $$, 'after switch sees only B');

-- anon sees nothing
select tests.clear_authentication();
set local role anon;
select throws_ok('select 1 from public.companies', '42501', null, 'anon has no access to companies');

select * from finish();
rollback;
