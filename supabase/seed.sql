-- Demo data: two companies, one user per role mix. Password for every demo user: vaquia-demo
-- Fixed ids so tests and e2e can reference them.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('vaquia-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name),
  now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-7000-8000-000000000001'::uuid, 'hse@petrosur.test', 'Laura Gómez'),
  ('a0000000-0000-7000-8000-000000000002'::uuid, 'supervisor@petrosur.test', 'Juan Pérez'),
  ('b0000000-0000-7000-8000-000000000001'::uuid, 'hse@andesservicios.test', 'Martín Díaz'),
  ('c0000000-0000-7000-8000-000000000001'::uuid, 'admin@vaquia.test', 'Admin Vaquia')
) as u (id, email, full_name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%.test';

insert into public.companies (id, name, cuit) values
  ('10000000-0000-7000-8000-000000000001', 'Petrosur Servicios SRL', '30-71111111-1'),
  ('20000000-0000-7000-8000-000000000001', 'Andes Servicios Petroleros SA', '30-72222222-2');

insert into public.memberships (company_id, user_id, role) values
  ('10000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001', 'hse'),
  ('10000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000002', 'supervisor'),
  ('20000000-0000-7000-8000-000000000001', 'b0000000-0000-7000-8000-000000000001', 'hse'),
  -- Member of both companies: exercises the company switcher.
  ('10000000-0000-7000-8000-000000000001', 'c0000000-0000-7000-8000-000000000001', 'admin'),
  ('20000000-0000-7000-8000-000000000001', 'c0000000-0000-7000-8000-000000000001', 'admin');
