-- migrate:up
-- Demo company for guest sessions (temporary demo feature). Fixed id: src/lib/env.ts DEMO_COMPANY_ID.
-- Holds no customer data; guests join it as `hse`.
insert into public.companies (id, name, cuit)
values ('30000000-0000-7000-8000-000000000001', 'Empresa Demo', '30-73333333-3')
on conflict (id) do nothing;

-- migrate:down
-- Intentionally empty: the company has append-only audit_log rows referencing it.
