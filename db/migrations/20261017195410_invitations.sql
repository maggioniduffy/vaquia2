-- migrate:up
-- Access grants are pending invitations the invited user accepts after signing in.
-- Memberships are created only by create_company() or accept_invitation().
create table public.invitations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email = lower(email) and length(email) > 0),
  role public.member_role not null,
  persona_id uuid not null,
  invited_by uuid references public.users (id) default app.current_user_id(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  foreign key (company_id, persona_id) references public.personas (company_id, id) on delete cascade
);

create unique index invitations_pending_email_uniq on public.invitations (company_id, email)
  where status = 'pending';
create unique index invitations_pending_persona_uniq on public.invitations (company_id, persona_id)
  where status = 'pending';
create index invitations_email_idx on public.invitations (email) where status = 'pending';

alter table public.invitations enable row level security;
grant select, insert, update on public.invitations to authenticated;

create policy invitations_select on public.invitations
  for select to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['admin']::public.member_role[]));
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['admin']::public.member_role[])
    and status = 'pending'
  );
create policy invitations_update on public.invitations
  for update to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['admin']::public.member_role[]) and status = 'pending')
  with check (company_id = public.current_company_id() and status = 'revoked');

create trigger assert_company_writable before insert or update or delete on public.invitations
  for each row execute function app.assert_company_writable();
create trigger invitations_audit
  after insert or update or delete on public.invitations
  for each row execute function public.audit_row();

-- Pending invitations addressed to the caller's email. Exposes nothing else about the company.
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

revoke all on function public.my_invitations() from public;
revoke all on function public.accept_invitation(uuid) from public;
revoke all on function public.decline_invitation(uuid) from public;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.decline_invitation(uuid) to authenticated;

-- migrate:down
drop function public.decline_invitation(uuid);
drop function public.accept_invitation(uuid);
drop function public.my_invitations();
drop table public.invitations;
