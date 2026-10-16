-- migrate:up
-- Phase 0.5 — Append-only audit log + generic triggers.

-- Reusable guard for every append-only table (audit_log, rule_evaluations, notifications,
-- period_snapshots, exports). Applies to every role, including the table owner.
create or replace function public.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

create table public.audit_log (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  actor_id uuid default app.current_user_id(),
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  diff jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index audit_log_company_entity_idx on public.audit_log (company_id, entity, entity_id, at desc);

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.reject_mutation();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.reject_mutation();

alter table public.audit_log enable row level security;
grant select on public.audit_log to authenticated;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_role(array['hse', 'manager', 'admin']::public.member_role[])
  );

-- Generic row audit. Tenant id comes from the `company_id` column, or `id` for `companies` itself.
-- Diff: insert → {new}, delete → {old}, update → {changed_key: {old, new}}.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_data jsonb := coalesce(new_row, old_row);
  tenant uuid;
  changes jsonb;
begin
  tenant := case
    when tg_table_name = 'companies' then (row_data ->> 'id')::uuid
    else (row_data ->> 'company_id')::uuid
  end;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', old_row -> n.key, 'new', n.value)), '{}'::jsonb)
      into changes
      from jsonb_each(new_row) n
      where n.value is distinct from old_row -> n.key;
    if changes = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    changes := jsonb_build_object('new', new_row);
  else
    changes := jsonb_build_object('old', old_row);
  end if;

  -- A deleted company cannot own its own delete entry (FK); skip it.
  if tg_op = 'DELETE' and tg_table_name = 'companies' then
    return null;
  end if;

  insert into public.audit_log (company_id, actor_id, entity, entity_id, action, diff)
  values (tenant, app.current_user_id(), tg_table_name, (row_data ->> 'id')::uuid, lower(tg_op), changes);

  return null;
end;
$$;

revoke all on function public.audit_row() from public;

create trigger companies_audit
  after insert or update or delete on public.companies
  for each row execute function public.audit_row();

create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function public.audit_row();

-- migrate:down
drop trigger memberships_audit on public.memberships;
drop trigger companies_audit on public.companies;
drop function public.audit_row();
drop table public.audit_log;
drop function public.reject_mutation();
