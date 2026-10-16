-- Phase 0.3 — Tenancy: companies, memberships, active company, RLS helpers.

-- UUIDv7 (time-ordered). Clients may generate their own; this is the server default.
create or replace function public.uuid_generate_v7()
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  ts_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  bytes bytea := extensions.gen_random_bytes(16);
begin
  bytes := set_byte(bytes, 0, ((ts_ms >> 40) & 255)::int);
  bytes := set_byte(bytes, 1, ((ts_ms >> 32) & 255)::int);
  bytes := set_byte(bytes, 2, ((ts_ms >> 24) & 255)::int);
  bytes := set_byte(bytes, 3, ((ts_ms >> 16) & 255)::int);
  bytes := set_byte(bytes, 4, ((ts_ms >> 8) & 255)::int);
  bytes := set_byte(bytes, 5, (ts_ms & 255)::int);
  -- version 7
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112);
  -- variant 10xx
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  return encode(bytes, 'hex')::uuid;
end;
$$;

create type public.member_role as enum ('worker', 'supervisor', 'hse', 'manager', 'admin');

create table public.companies (
  id uuid primary key default public.uuid_generate_v7(),
  name text not null check (length(trim(name)) > 0),
  cuit text unique,
  plan text not null default 'pilot',
  settings jsonb not null default jsonb_build_object(
    'report_day', 1,
    'timezone', 'America/Argentina/Buenos_Aires',
    'kpi_base', 200000
  ),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid()
);

create table public.memberships (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  -- persona_id: FK added in phase 1 when `personas` exists.
  persona_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  unique (company_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

-- Which company a user with >1 membership is currently working in. User-scoped, not tenant-scoped.
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  active_company_id uuid references public.companies (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Active company: the user's chosen company if they still belong to it, else their oldest membership.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select us.active_company_id
      from public.user_settings us
      join public.memberships m
        on m.company_id = us.active_company_id and m.user_id = us.user_id
      where us.user_id = auth.uid()
    ),
    (
      select m.company_id
      from public.memberships m
      where m.user_id = auth.uid()
      order by m.created_at, m.id
      limit 1
    )
  );
$$;

create or replace function public.has_role(roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.company_id = public.current_company_id()
      and m.role = any (roles)
  );
$$;

-- Companies the caller belongs to (for the company switcher; RLS on `companies` only exposes the active one).
create or replace function public.my_companies()
returns table (company_id uuid, name text, role public.member_role, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, m.role, c.id = public.current_company_id()
  from public.memberships m
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid()
  order by c.name;
$$;

create or replace function public.set_active_company(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.memberships m where m.user_id = auth.uid() and m.company_id = target
  ) then
    raise exception 'not a member of company %', target using errcode = '42501';
  end if;

  insert into public.user_settings (user_id, active_company_id, updated_at)
  values (auth.uid(), target, now())
  on conflict (user_id) do update
    set active_company_id = excluded.active_company_id, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.current_company_id() from public, anon;
revoke all on function public.has_role(public.member_role[]) from public, anon;
revoke all on function public.my_companies() from public, anon;
revoke all on function public.set_active_company(uuid) from public, anon;
grant execute on function public.current_company_id() to authenticated, service_role;
grant execute on function public.has_role(public.member_role[]) to authenticated, service_role;
grant execute on function public.my_companies() to authenticated;
grant execute on function public.set_active_company(uuid) to authenticated;

-- RLS
alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.user_settings enable row level security;

revoke all on public.companies, public.memberships, public.user_settings from anon;

-- Companies are created by onboarding (service role); members only read/update their active one.
create policy companies_select on public.companies
  for select to authenticated
  using (id = public.current_company_id());

create policy companies_update on public.companies
  for update to authenticated
  using (id = public.current_company_id() and public.has_role(array['admin']::public.member_role[]))
  with check (id = public.current_company_id());

create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or company_id = public.current_company_id());

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['admin']::public.member_role[])
  );

create policy memberships_update on public.memberships
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_role(array['admin']::public.member_role[])
  )
  with check (company_id = public.current_company_id());

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_role(array['admin']::public.member_role[])
  );

-- Writes go through set_active_company(); users can only read their own row.
create policy user_settings_select on public.user_settings
  for select to authenticated
  using (user_id = auth.uid());
