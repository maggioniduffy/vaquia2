-- migrate:up
-- Guest sessions may only join companies with plan = 'demo' (src/lib/auth.ts).
update public.companies set plan = 'demo' where id = '30000000-0000-7000-8000-000000000001';

-- Tenants may only edit name and settings; plan, cuit, ids are admin-managed.
revoke update on public.companies from authenticated;
grant update (name, settings) on public.companies to authenticated;

-- migrate:down
revoke update on public.companies from authenticated;
grant update on public.companies to authenticated;
update public.companies set plan = 'pilot' where id = '30000000-0000-7000-8000-000000000001';
