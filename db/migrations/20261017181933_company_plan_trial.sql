-- migrate:up
-- Phase 1b.1 — Trial plan and read-only enforcement for expired trials.

alter table public.companies add column trial_ends_at timestamptz;

update public.companies set plan = 'paid' where plan = 'pilot';
alter table public.companies alter column plan set default 'trial';

alter table public.companies
  add constraint companies_plan_check check (plan in ('trial', 'paid', 'demo')),
  add constraint companies_trial_ends_at_check check (plan <> 'trial' or trial_ends_at is not null);

-- True unless the company is on an expired trial. Unknown company => true (e.g. cascade deletes).
create or replace function public.company_writable(company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select not (c.plan = 'trial' and c.trial_ends_at <= now())
      from public.companies c
      where c.id = company
    ),
    true
  );
$$;

revoke all on function public.company_writable(uuid) from public;
grant execute on function public.company_writable(uuid) to authenticated;

-- Blocks writes on expired trials, for every role. On `companies` UPDATE the NEW row is checked,
-- so ops can re-activate an expired company by changing plan/trial_ends_at.
create or replace function app.assert_company_writable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  target uuid;
begin
  if tg_table_name = 'companies' then
    target := (row_data ->> 'id')::uuid;
  else
    target := (row_data ->> 'company_id')::uuid;
  end if;

  if target is not null then
    if tg_table_name = 'companies' and tg_op = 'UPDATE' then
      if new.plan = 'trial' and new.trial_ends_at <= now() then
        raise exception 'company_read_only' using errcode = 'VQ001';
      end if;
    elsif not public.company_writable(target) then
      raise exception 'company_read_only' using errcode = 'VQ001';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger assert_company_writable before insert or update or delete on public.companies
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.memberships
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.locations
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.crews
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.personas
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.qualification_types
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.task_types
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.task_requirements
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.qualifications
  for each row execute function app.assert_company_writable();

-- migrate:down
drop trigger assert_company_writable on public.qualifications;
drop trigger assert_company_writable on public.task_requirements;
drop trigger assert_company_writable on public.task_types;
drop trigger assert_company_writable on public.qualification_types;
drop trigger assert_company_writable on public.personas;
drop trigger assert_company_writable on public.crews;
drop trigger assert_company_writable on public.locations;
drop trigger assert_company_writable on public.memberships;
drop trigger assert_company_writable on public.companies;
drop function app.assert_company_writable();
drop function public.company_writable(uuid);

alter table public.companies
  drop constraint companies_trial_ends_at_check,
  drop constraint companies_plan_check;
alter table public.companies alter column plan set default 'pilot';
update public.companies set plan = 'pilot' where plan = 'paid';
alter table public.companies drop column trial_ends_at;
