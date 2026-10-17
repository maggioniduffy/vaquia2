-- migrate:up
-- Withdrawing an invitation (pending -> revoked/declined, only status/responded_at change) is allowed
-- on an expired trial, like revoking memberships. Creating and accepting stay blocked.
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

  if tg_table_name = 'invitations' and tg_op = 'UPDATE'
     and old.status = 'pending' and new.status in ('revoked', 'declined')
     and (to_jsonb(new) - 'status' - 'responded_at') = (to_jsonb(old) - 'status' - 'responded_at') then
    return new;
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
