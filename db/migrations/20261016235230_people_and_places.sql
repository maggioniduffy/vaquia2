-- migrate:up
-- Phase 1.1 — People & places: operators (global catalog), locations, crews, personas.
-- Same-company references are composite FKs (company_id, x_id) -> x (company_id, id), so a row can
-- never point at another tenant's row. `on delete set null (col)` nulls only the reference column
-- (company_id is NOT NULL and must stay).

-- Shared operator catalog: no company_id, read-only for users.
create table public.operators (
  id uuid primary key default public.uuid_generate_v7(),
  name text not null check (length(trim(name)) > 0),
  code text not null unique check (length(trim(code)) > 0),
  created_at timestamptz not null default now()
);

-- Fixed ids (90000000-0000-7000-8000-0000000001NN) so tests and fixtures can reference them.
insert into public.operators (id, name, code) values
  ('90000000-0000-7000-8000-000000000101', 'YPF', 'YPF'),
  ('90000000-0000-7000-8000-000000000102', 'Pan American Energy', 'PAE'),
  ('90000000-0000-7000-8000-000000000103', 'Tecpetrol', 'TECPETROL'),
  ('90000000-0000-7000-8000-000000000104', 'Pluspetrol', 'PLUSPETROL'),
  ('90000000-0000-7000-8000-000000000105', 'Vista Energy', 'VISTA'),
  ('90000000-0000-7000-8000-000000000106', 'Shell Argentina', 'SHELL'),
  ('90000000-0000-7000-8000-000000000107', 'Chevron Argentina', 'CHEVRON'),
  ('90000000-0000-7000-8000-000000000108', 'TotalEnergies', 'TOTAL');

alter table public.operators enable row level security;
grant select on public.operators to authenticated;
create policy operators_select on public.operators
  for select to authenticated
  using (true);

create table public.locations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id),
  name text not null check (length(trim(name)) > 0),
  field text,
  operator_id uuid references public.operators (id),
  lat numeric(9, 6) check (lat between -90 and 90),
  lng numeric(9, 6) check (lng between -180 and 180),
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) default app.current_user_id(),
  unique (company_id, id),
  unique (company_id, name)
);

create table public.crews (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id),
  name text not null check (length(trim(name)) > 0),
  supervisor_persona_id uuid,
  location_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) default app.current_user_id(),
  unique (company_id, id),
  unique (company_id, name),
  foreign key (company_id, location_id) references public.locations (company_id, id)
    on delete set null (location_id)
);

create table public.personas (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id),
  full_name text not null check (length(trim(full_name)) > 0),
  dni text not null check (length(trim(dni)) > 0),
  crew_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) default app.current_user_id(),
  unique (company_id, id),
  unique (company_id, dni),
  foreign key (company_id, crew_id) references public.crews (company_id, id)
    on delete set null (crew_id)
);

-- crews <-> personas is circular: add the crews side after both tables exist.
alter table public.crews
  add constraint crews_supervisor_fk
  foreign key (company_id, supervisor_persona_id) references public.personas (company_id, id)
  on delete set null (supervisor_persona_id);

-- memberships.persona_id existed since 0.3 without FK; now it can be enforced.
alter table public.memberships
  add constraint memberships_persona_fk
  foreign key (company_id, persona_id) references public.personas (company_id, id)
  on delete set null (persona_id);

create index locations_operator_id_idx on public.locations (operator_id);
create index crews_location_id_idx on public.crews (company_id, location_id);
create index crews_supervisor_idx on public.crews (company_id, supervisor_persona_id);
create index personas_crew_id_idx on public.personas (company_id, crew_id);
create index memberships_persona_idx on public.memberships (company_id, persona_id);

-- RLS: every member reads; hse/admin write; only own company rows.
alter table public.locations enable row level security;
alter table public.crews enable row level security;
alter table public.personas enable row level security;

grant select, insert, update, delete on public.locations to authenticated;
grant select, insert, update, delete on public.crews to authenticated;
grant select, insert, update, delete on public.personas to authenticated;

create policy locations_select on public.locations
  for select to authenticated
  using (company_id = public.current_company_id());
create policy locations_insert on public.locations
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));
create policy locations_update on public.locations
  for update to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]))
  with check (company_id = public.current_company_id());
create policy locations_delete on public.locations
  for delete to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));

create policy crews_select on public.crews
  for select to authenticated
  using (company_id = public.current_company_id());
create policy crews_insert on public.crews
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));
create policy crews_update on public.crews
  for update to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]))
  with check (company_id = public.current_company_id());
create policy crews_delete on public.crews
  for delete to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));

create policy personas_select on public.personas
  for select to authenticated
  using (company_id = public.current_company_id());
create policy personas_insert on public.personas
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));
create policy personas_update on public.personas
  for update to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]))
  with check (company_id = public.current_company_id());
create policy personas_delete on public.personas
  for delete to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));

create trigger locations_audit
  after insert or update or delete on public.locations
  for each row execute function public.audit_row();
create trigger crews_audit
  after insert or update or delete on public.crews
  for each row execute function public.audit_row();
create trigger personas_audit
  after insert or update or delete on public.personas
  for each row execute function public.audit_row();

-- migrate:down
drop trigger personas_audit on public.personas;
drop trigger crews_audit on public.crews;
drop trigger locations_audit on public.locations;
alter table public.memberships drop constraint memberships_persona_fk;
drop index public.memberships_persona_idx;
alter table public.crews drop constraint crews_supervisor_fk;
drop table public.personas, public.crews, public.locations, public.operators;
