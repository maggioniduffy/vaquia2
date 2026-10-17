-- migrate:up
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

-- migrate:down
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
