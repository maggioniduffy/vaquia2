-- migrate:up
-- Phase 1.1/1.2 — Qualifications: types (global seed + company), task types, requirements, per-persona
-- qualifications, and the status views. Status is computed on the ART date, never stored.

-- Today in the company's timezone (Argentina has no DST, so a fixed zone is correct).
create function public.today_art()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

-- company_id null = global seed (read-only for users, written only by migrations/owner).
create table public.qualification_types (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id),
  name text not null check (length(trim(name)) > 0),
  default_validity_months int check (default_validity_months > 0),
  issuer text,
  operator_id uuid references public.operators (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) default app.current_user_id()
);
create unique index qualification_types_name_uniq
  on public.qualification_types (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create table public.task_types (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id),
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) default app.current_user_id()
);
create unique index task_types_code_uniq
  on public.task_types (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

-- Which qualification types a task type needs. Company rows add to the global defaults.
create table public.task_requirements (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id),
  task_type_id uuid not null references public.task_types (id),
  qualification_type_id uuid not null references public.qualification_types (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) default app.current_user_id()
);
create unique index task_requirements_uniq
  on public.task_requirements (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), task_type_id, qualification_type_id
  );
create index task_requirements_qtype_idx on public.task_requirements (qualification_type_id);

-- Renewal = new row; the current one per persona x type is the latest issued_on (see current_qualifications).
create table public.qualifications (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id),
  persona_id uuid not null,
  type_id uuid not null references public.qualification_types (id),
  issued_on date not null,
  expires_on date,
  file_path text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) default app.current_user_id(),
  unique (company_id, id),
  check (expires_on is null or expires_on >= issued_on),
  foreign key (company_id, persona_id) references public.personas (company_id, id)
);
create index qualifications_persona_type_idx
  on public.qualifications (company_id, persona_id, type_id, issued_on desc);
create index qualifications_type_idx on public.qualifications (type_id);

-- Seed globals. Fixed ids so tests/fixtures can reference them:
--   qualification types 90000000-0000-7000-8000-0000000002NN
--   task types          90000000-0000-7000-8000-0000000003NN
--   task requirements   90000000-0000-7000-8000-0000000004NN
-- Seeded BEFORE the audit triggers exist (audit_log.company_id is NOT NULL).
insert into public.qualification_types (id, name, default_validity_months) values
  ('90000000-0000-7000-8000-000000000201', 'Inducción de operadora', 12),
  ('90000000-0000-7000-8000-000000000202', 'Trabajo en altura (IRAM 3625)', 12),
  ('90000000-0000-7000-8000-000000000203', 'Espacios confinados', 12),
  ('90000000-0000-7000-8000-000000000204', 'Manejo defensivo', 24),
  ('90000000-0000-7000-8000-000000000205', 'Primeros auxilios / RCP', 24),
  ('90000000-0000-7000-8000-000000000206', 'Lucha contra incendios', 12),
  ('90000000-0000-7000-8000-000000000207', 'Materiales peligrosos (HAZMAT)', 12),
  ('90000000-0000-7000-8000-000000000208', 'Licencia de conducir de campo', null),
  ('90000000-0000-7000-8000-000000000209', 'Rigger / operador de grúa', 24),
  ('90000000-0000-7000-8000-000000000210', 'Protección radiológica (ARN)', null);

insert into public.task_types (id, code, name) values
  ('90000000-0000-7000-8000-000000000301', 'general', 'General'),
  ('90000000-0000-7000-8000-000000000302', 'altura', 'Trabajo en altura'),
  ('90000000-0000-7000-8000-000000000303', 'espacio_confinado', 'Espacio confinado'),
  ('90000000-0000-7000-8000-000000000304', 'trabajo_en_caliente', 'Trabajo en caliente'),
  ('90000000-0000-7000-8000-000000000305', 'electrico', 'Trabajo eléctrico'),
  ('90000000-0000-7000-8000-000000000306', 'izaje', 'Izaje');

-- general -> none. electrico -> first aid/CPR is a PLACEHOLDER until HSE defines the real electrical
-- qualification (companies add their own requirements on top).
insert into public.task_requirements (id, task_type_id, qualification_type_id) values
  ('90000000-0000-7000-8000-000000000401', '90000000-0000-7000-8000-000000000302', '90000000-0000-7000-8000-000000000202'),
  ('90000000-0000-7000-8000-000000000402', '90000000-0000-7000-8000-000000000303', '90000000-0000-7000-8000-000000000203'),
  ('90000000-0000-7000-8000-000000000403', '90000000-0000-7000-8000-000000000304', '90000000-0000-7000-8000-000000000206'),
  ('90000000-0000-7000-8000-000000000404', '90000000-0000-7000-8000-000000000306', '90000000-0000-7000-8000-000000000209'),
  ('90000000-0000-7000-8000-000000000405', '90000000-0000-7000-8000-000000000305', '90000000-0000-7000-8000-000000000205');

-- Integrity for "global or own" references. A plain FK cannot express it, so it is enforced twice:
-- in the RLS `with check` (users) and in this trigger (also binds the table owner connection).
-- Trigger args come in pairs: (column, referenced table). A referenced row must be global
-- (company_id null) or belong to the same company as the row being written.
create function public.check_global_or_own_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  i int := 0;
  ref_id uuid;
  ok boolean;
begin
  while i < tg_nargs loop
    ref_id := (to_jsonb(new) ->> tg_argv[i])::uuid;
    if ref_id is not null then
      execute format(
        'select exists (select 1 from public.%I r where r.id = $1 and (r.company_id is null or r.company_id = $2))',
        tg_argv[i + 1]
      ) into ok using ref_id, new.company_id;
      if not ok then
        raise exception '% % is not global or in the same company', tg_argv[i], ref_id
          using errcode = '23503';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end;
$$;

create trigger qualifications_ref_check
  before insert or update on public.qualifications
  for each row execute function public.check_global_or_own_ref('type_id', 'qualification_types');
create trigger task_requirements_ref_check
  before insert or update on public.task_requirements
  for each row execute function public.check_global_or_own_ref(
    'task_type_id', 'task_types', 'qualification_type_id', 'qualification_types'
  );

-- RLS
alter table public.qualification_types enable row level security;
alter table public.task_types enable row level security;
alter table public.task_requirements enable row level security;
alter table public.qualifications enable row level security;

grant select, insert, update, delete on public.qualification_types to authenticated;
grant select, insert, update, delete on public.task_types to authenticated;
grant select, insert, update, delete on public.task_requirements to authenticated;
grant select, insert, update, delete on public.qualifications to authenticated;

-- Global-capable tables: everyone reads globals + own rows; writes only on own rows (globals are never writable).
create policy qualification_types_select on public.qualification_types
  for select to authenticated
  using (company_id is null or company_id = public.current_company_id());
create policy qualification_types_insert on public.qualification_types
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));
create policy qualification_types_update on public.qualification_types
  for update to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]))
  with check (company_id = public.current_company_id());
create policy qualification_types_delete on public.qualification_types
  for delete to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));

create policy task_types_select on public.task_types
  for select to authenticated
  using (company_id is null or company_id = public.current_company_id());
create policy task_types_insert on public.task_types
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));
create policy task_types_update on public.task_types
  for update to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]))
  with check (company_id = public.current_company_id());
create policy task_types_delete on public.task_types
  for delete to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));

create policy task_requirements_select on public.task_requirements
  for select to authenticated
  using (company_id is null or company_id = public.current_company_id());
create policy task_requirements_insert on public.task_requirements
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['hse', 'admin']::public.member_role[])
    and exists (
      select 1 from public.task_types tt
      where tt.id = task_type_id and (tt.company_id is null or tt.company_id = task_requirements.company_id)
    )
    and exists (
      select 1 from public.qualification_types qt
      where qt.id = qualification_type_id and (qt.company_id is null or qt.company_id = task_requirements.company_id)
    )
  );
create policy task_requirements_update on public.task_requirements
  for update to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]))
  with check (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.task_types tt
      where tt.id = task_type_id and (tt.company_id is null or tt.company_id = task_requirements.company_id)
    )
    and exists (
      select 1 from public.qualification_types qt
      where qt.id = qualification_type_id and (qt.company_id is null or qt.company_id = task_requirements.company_id)
    )
  );
create policy task_requirements_delete on public.task_requirements
  for delete to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));

create policy qualifications_select on public.qualifications
  for select to authenticated
  using (company_id = public.current_company_id());
create policy qualifications_insert on public.qualifications
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['hse', 'admin']::public.member_role[])
    and exists (
      select 1 from public.qualification_types qt
      where qt.id = type_id and (qt.company_id is null or qt.company_id = qualifications.company_id)
    )
  );
create policy qualifications_update on public.qualifications
  for update to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]))
  with check (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.qualification_types qt
      where qt.id = type_id and (qt.company_id is null or qt.company_id = qualifications.company_id)
    )
  );
create policy qualifications_delete on public.qualifications
  for delete to authenticated
  using (company_id = public.current_company_id() and public.has_role(array['hse', 'admin']::public.member_role[]));

-- Audit. Global rows (company_id null) are not audited: audit_log.company_id is NOT NULL and
-- audit_row() reads it from the row. One trigger per event because WHEN cannot mix OLD and NEW
-- across INSERT/DELETE.
create trigger qualifications_audit
  after insert or update or delete on public.qualifications
  for each row execute function public.audit_row();

create trigger qualification_types_audit_ins
  after insert on public.qualification_types
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger qualification_types_audit_upd
  after update on public.qualification_types
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger qualification_types_audit_del
  after delete on public.qualification_types
  for each row when (old.company_id is not null) execute function public.audit_row();

create trigger task_types_audit_ins
  after insert on public.task_types
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger task_types_audit_upd
  after update on public.task_types
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger task_types_audit_del
  after delete on public.task_types
  for each row when (old.company_id is not null) execute function public.audit_row();

create trigger task_requirements_audit_ins
  after insert on public.task_requirements
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger task_requirements_audit_upd
  after update on public.task_requirements
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger task_requirements_audit_del
  after delete on public.task_requirements
  for each row when (old.company_id is not null) execute function public.audit_row();

-- Views (security_invoker: RLS of the underlying tables applies to the caller).

-- Latest qualification per persona x type (issued_on desc, created_at desc) with its status.
-- days_left is null when there is no expiry.
create view public.current_qualifications with (security_invoker = true) as
select
  c.id as qualification_id,
  c.company_id,
  c.persona_id,
  c.type_id,
  c.issued_on,
  c.expires_on,
  c.file_path,
  case
    when c.expires_on is null then 'valid'
    when c.expires_on <= public.today_art() then 'expired'
    when c.expires_on <= public.today_art() + 30 then 'expiring'
    else 'valid'
  end as status,
  (c.expires_on - public.today_art())::int as days_left
from (
  select distinct on (q.persona_id, q.type_id) q.*
  from public.qualifications q
  order by q.persona_id, q.type_id, q.issued_on desc, q.created_at desc, q.id desc
) c;

-- One row per active persona x task type x required qualification type (global defaults + company rows).
-- status: valid | expiring | expired | missing.
create view public.qualification_status with (security_invoker = true) as
select
  p.company_id,
  p.id as persona_id,
  tt.id as task_type_id,
  req.qualification_type_id,
  cq.qualification_id,
  cq.expires_on,
  cq.days_left,
  coalesce(cq.status, 'missing') as status
from public.personas p
join public.task_types tt on tt.company_id is null or tt.company_id = p.company_id
join lateral (
  select distinct tr.qualification_type_id
  from public.task_requirements tr
  where tr.task_type_id = tt.id and (tr.company_id is null or tr.company_id = p.company_id)
) req on true
left join public.current_qualifications cq
  on cq.persona_id = p.id and cq.type_id = req.qualification_type_id
where p.active;

-- One row per active persona x task type. apto = every required type is valid or expiring
-- (a task type with no requirements is apto).
create view public.persona_task_fitness with (security_invoker = true) as
select
  p.company_id,
  p.id as persona_id,
  tt.id as task_type_id,
  count(qs.qualification_type_id)::int as required_count,
  (count(*) filter (where qs.status = 'missing'))::int as missing_count,
  (count(*) filter (where qs.status = 'expired'))::int as expired_count,
  (count(*) filter (where qs.status = 'expiring'))::int as expiring_count,
  coalesce(bool_and(qs.status in ('valid', 'expiring')), true) as apto
from public.personas p
join public.task_types tt on tt.company_id is null or tt.company_id = p.company_id
left join public.qualification_status qs on qs.persona_id = p.id and qs.task_type_id = tt.id
where p.active
group by p.company_id, p.id, tt.id;

grant select on public.current_qualifications to authenticated;
grant select on public.qualification_status to authenticated;
grant select on public.persona_task_fitness to authenticated;

-- migrate:down
drop view public.persona_task_fitness, public.qualification_status, public.current_qualifications;
drop table public.qualifications, public.task_requirements, public.task_types, public.qualification_types;
drop function public.check_global_or_own_ref();
drop function public.today_art();
