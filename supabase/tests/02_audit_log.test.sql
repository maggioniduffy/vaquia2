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

select plan(9);

select tests.create_user('aaaaaaaa-0000-7000-8000-000000000001', 'a-hse@test.local');
select tests.create_user('aaaaaaaa-0000-7000-8000-000000000002', 'a-worker@test.local');
select tests.create_user('bbbbbbbb-0000-7000-8000-000000000001', 'b-hse@test.local');
insert into public.companies (id, name) values
  ('aaaaaaaa-0000-7000-8000-00000000000a', 'Company A'),
  ('bbbbbbbb-0000-7000-8000-00000000000b', 'Company B');
insert into public.memberships (company_id, user_id, role) values
  ('aaaaaaaa-0000-7000-8000-00000000000a', 'aaaaaaaa-0000-7000-8000-000000000001', 'hse'),
  ('aaaaaaaa-0000-7000-8000-00000000000a', 'aaaaaaaa-0000-7000-8000-000000000002', 'worker'),
  ('bbbbbbbb-0000-7000-8000-00000000000b', 'bbbbbbbb-0000-7000-8000-000000000001', 'hse');

update public.companies set name = 'Company A2' where id = 'aaaaaaaa-0000-7000-8000-00000000000a';

select is(
  (select count(*)::int from public.audit_log where entity = 'companies' and entity_id = 'aaaaaaaa-0000-7000-8000-00000000000a'),
  2, 'company insert + update audited'
);
select is(
  (select diff -> 'name' ->> 'new' from public.audit_log
   where entity = 'companies' and action = 'update' and entity_id = 'aaaaaaaa-0000-7000-8000-00000000000a'),
  'Company A2', 'update diff holds changed column'
);
select is(
  (select count(*)::int from public.audit_log
   where entity = 'memberships'
     and company_id in ('aaaaaaaa-0000-7000-8000-00000000000a', 'bbbbbbbb-0000-7000-8000-00000000000b')),
  3, 'membership inserts audited'
);

-- Append-only, even for the table owner / service role
select throws_ok('update public.audit_log set action = ''delete''', 'P0001', null, 'UPDATE on audit_log fails');
select throws_ok('delete from public.audit_log', 'P0001', null, 'DELETE on audit_log fails');
select throws_ok('truncate public.audit_log', 'P0001', null, 'TRUNCATE on audit_log fails');

-- RLS: HSE of A sees only A entries; workers see none; nobody can insert directly
select tests.authenticate_as('aaaaaaaa-0000-7000-8000-000000000001');
select is(
  (select count(*)::int from public.audit_log where company_id <> 'aaaaaaaa-0000-7000-8000-00000000000a'),
  0, 'HSE of A cannot read audit entries of B'
);
select throws_ok(
  $$ insert into public.audit_log (company_id, entity, entity_id, action)
     values ('aaaaaaaa-0000-7000-8000-00000000000a', 'x', gen_random_uuid(), 'insert') $$,
  '42501', null, 'direct inserts into audit_log are denied'
);
select tests.authenticate_as('aaaaaaaa-0000-7000-8000-000000000002');
select is_empty('select 1 from public.audit_log', 'worker cannot read audit_log');

select * from finish();
rollback;
