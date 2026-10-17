-- migrate:up
-- Phase 1b.2 — CUIT validation and atomic company creation (self-serve onboarding).

-- AFIP CUIT/CUIL: 11 digits (caller strips dashes), valid type prefix, mod-11 check digit.
create or replace function app.cuit_valid(cuit text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  weights int[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  total int := 0;
  rest int;
  expected int;
  i int;
begin
  if cuit is null or cuit !~ '^[0-9]{11}$' then
    return false;
  end if;
  if substr(cuit, 1, 2) not in ('20', '23', '24', '27', '30', '33', '34') then
    return false;
  end if;
  for i in 1..10 loop
    total := total + substr(cuit, i, 1)::int * weights[i];
  end loop;
  rest := total % 11;
  expected := case rest when 0 then 0 else 11 - rest end;
  if expected = 10 then
    return false;
  end if;
  return expected = substr(cuit, 11, 1)::int;
end;
$$;

-- The demo company's CUIT was a placeholder with an invalid check digit; use a valid one.
update public.companies set cuit = '30700000008' where id = '30000000-0000-7000-8000-000000000001';
-- Any other legacy value that is not a valid digits-only CUIT is dropped (cuit is optional).
update public.companies set cuit = null where cuit is not null and not app.cuit_valid(cuit);

alter table public.companies
  add constraint companies_cuit_valid check (cuit is null or app.cuit_valid(cuit));

-- Creates the caller's first company: company (30-day trial) + persona + admin membership + active company.
-- Duplicate CUIT surfaces as 23505. Audit triggers record the caller (app.user_id persists inside).
create or replace function public.create_company(p_name text, p_cuit text, p_full_name text, p_dni text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.current_user_id();
  v_name text := trim(coalesce(p_name, ''));
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_dni text := regexp_replace(coalesce(p_dni, ''), '[.\s-]', '', 'g');
  v_cuit text := nullif(regexp_replace(coalesce(p_cuit, ''), '[^0-9]', '', 'g'), '');
  v_company uuid;
  v_persona uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Serialize concurrent calls by the same user (double submit).
  perform pg_advisory_xact_lock(hashtext(uid::text));

  if exists (select 1 from public.users u where u.id = uid and u.is_anonymous) then
    raise exception 'anonymous users cannot create companies' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships m where m.user_id = uid) then
    raise exception 'user already belongs to a company' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_full_name = '' then
    raise exception 'invalid_full_name' using errcode = '22023';
  end if;
  if v_cuit is not null and not app.cuit_valid(v_cuit) then
    raise exception 'invalid_cuit' using errcode = '22023';
  end if;
  if v_dni !~ '^[0-9]{7,8}$' then
    raise exception 'invalid_dni' using errcode = '22023';
  end if;

  insert into public.companies (name, cuit, plan, trial_ends_at, created_by)
  values (v_name, v_cuit, 'trial', now() + interval '30 days', uid)
  returning id into v_company;

  insert into public.personas (company_id, full_name, dni, created_by)
  values (v_company, v_full_name, v_dni, uid)
  returning id into v_persona;

  insert into public.memberships (company_id, user_id, role, persona_id, created_by)
  values (v_company, uid, 'admin', v_persona, uid);

  insert into public.user_settings (user_id, active_company_id, updated_at)
  values (uid, v_company, now())
  on conflict (user_id) do update
    set active_company_id = excluded.active_company_id, updated_at = excluded.updated_at;

  return v_company;
end;
$$;

revoke all on function public.create_company(text, text, text, text) from public;
grant execute on function public.create_company(text, text, text, text) to authenticated;

-- migrate:down
drop function public.create_company(text, text, text, text);
alter table public.companies drop constraint companies_cuit_valid;
drop function app.cuit_valid(text);
