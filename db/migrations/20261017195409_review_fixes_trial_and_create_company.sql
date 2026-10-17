-- migrate:up
-- memberships DELETE is always allowed; create_company bounds name lengths; company_writable() is
-- only called by the trigger (runs as owner), so authenticated no longer needs execute.
-- Rule on `companies`:
--   DELETE: always allowed (children cascade afterwards; company_writable() is true for missing companies).
--   UPDATE: allowed when only `plan` and/or `trial_ends_at` change (ops can expire or re-activate);
--           otherwise allowed only if the OLD or the NEW row is writable (not an expired trial),
--           so an expired trial cannot rename itself or change settings, except in the same
--           statement that re-activates it.
--   INSERT: checked via company_writable() (unknown company => true).
-- All other tables: blocked when the company is on an expired trial.
create or replace function app.assert_company_writable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  target uuid;
begin
  -- Revoking access must work on an expired trial (also lets user-delete cascades through).
  if tg_table_name = 'memberships' and tg_op = 'DELETE' then
    return old;
  end if;

  if tg_table_name = 'companies' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if tg_op = 'UPDATE' then
      if (to_jsonb(new) - 'plan' - 'trial_ends_at') = (to_jsonb(old) - 'plan' - 'trial_ends_at') then
        return new;
      end if;
      if (old.plan = 'trial' and old.trial_ends_at <= now())
         and (new.plan = 'trial' and new.trial_ends_at <= now()) then
        raise exception 'company_read_only' using errcode = 'VQ001';
      end if;
      return new;
    end if;
    target := (row_data ->> 'id')::uuid;
  else
    target := (row_data ->> 'company_id')::uuid;
  end if;

  if target is not null and not public.company_writable(target) then
    raise exception 'company_read_only' using errcode = 'VQ001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

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

  if length(v_name) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if length(v_full_name) not between 2 and 120 then
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

revoke execute on function public.company_writable(uuid) from authenticated;

-- migrate:down
grant execute on function public.company_writable(uuid) to authenticated;

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
