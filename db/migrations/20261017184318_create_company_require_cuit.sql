-- migrate:up
-- CUIT is mandatory at sign-up (column stays nullable for legacy/demo rows).
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
  if v_cuit is null or not app.cuit_valid(v_cuit) then
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

-- migrate:down
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

