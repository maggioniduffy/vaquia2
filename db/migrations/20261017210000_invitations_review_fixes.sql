-- migrate:up
-- 1. Invitee matching requires a verified email. 3. Distinct error when the persona is already linked
-- to another login. 2. Memberships are created only by create_company()/accept_invitation().

create or replace function public.my_invitations()
returns table (id uuid, company_name text, role public.member_role, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, c.name, i.role, i.created_at
  from public.invitations i
  join public.companies c on c.id = i.company_id
  join public.users u on lower(u.email) = i.email
  where u.id = app.current_user_id()
    and not u.is_anonymous
    and u.email_verified
    and i.status = 'pending'
  order by i.created_at desc;
$$;

create or replace function public.accept_invitation(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.current_user_id();
  inv public.invitations;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));

  select i.* into inv
  from public.invitations i
  join public.users u on lower(u.email) = i.email
  where i.id = p_id and i.status = 'pending' and u.id = uid
    and not u.is_anonymous and u.email_verified
  for update of i;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.memberships m
    where m.company_id = inv.company_id and m.persona_id = inv.persona_id and m.user_id <> uid
  ) then
    raise exception 'persona_taken' using errcode = 'P0001';
  end if;

  insert into public.memberships (company_id, user_id, role, persona_id, created_by)
  values (inv.company_id, uid, inv.role, inv.persona_id, inv.invited_by);

  update public.invitations set status = 'accepted', responded_at = now() where id = inv.id;

  insert into public.user_settings (user_id, active_company_id, updated_at)
  values (uid, inv.company_id, now())
  on conflict (user_id) do update
    set active_company_id = excluded.active_company_id, updated_at = excluded.updated_at;

  return inv.company_id;
end;
$$;

create or replace function public.decline_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.current_user_id();
  n int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update public.invitations i
     set status = 'declined', responded_at = now()
    from public.users u
   where i.id = p_id and i.status = 'pending' and u.id = uid
     and lower(u.email) = i.email and not u.is_anonymous and u.email_verified;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
end;
$$;

drop policy memberships_insert on public.memberships;
revoke insert, update on public.memberships from authenticated;
grant update (role, persona_id) on public.memberships to authenticated;

-- migrate:down
revoke update on public.memberships from authenticated;
grant insert, update on public.memberships to authenticated;
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['admin']::public.member_role[])
  );

create or replace function public.my_invitations()
returns table (id uuid, company_name text, role public.member_role, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, c.name, i.role, i.created_at
  from public.invitations i
  join public.companies c on c.id = i.company_id
  join public.users u on lower(u.email) = i.email
  where u.id = app.current_user_id()
    and not u.is_anonymous
    and i.status = 'pending'
  order by i.created_at desc;
$$;

create or replace function public.accept_invitation(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.current_user_id();
  inv public.invitations;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));

  select i.* into inv
  from public.invitations i
  join public.users u on lower(u.email) = i.email
  where i.id = p_id and i.status = 'pending' and u.id = uid and not u.is_anonymous
  for update of i;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  insert into public.memberships (company_id, user_id, role, persona_id, created_by)
  values (inv.company_id, uid, inv.role, inv.persona_id, inv.invited_by);

  update public.invitations set status = 'accepted', responded_at = now() where id = inv.id;

  insert into public.user_settings (user_id, active_company_id, updated_at)
  values (uid, inv.company_id, now())
  on conflict (user_id) do update
    set active_company_id = excluded.active_company_id, updated_at = excluded.updated_at;

  return inv.company_id;
end;
$$;

create or replace function public.decline_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.current_user_id();
  n int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update public.invitations i
     set status = 'declined', responded_at = now()
    from public.users u
   where i.id = p_id and i.status = 'pending' and u.id = uid
     and lower(u.email) = i.email and not u.is_anonymous;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
end;
$$;
