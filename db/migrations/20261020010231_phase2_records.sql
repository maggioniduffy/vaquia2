-- migrate:up
-- Phase 2.1 — Records: record_types, form_schemas, records, record_participants, signatures,
-- attachments, record_conflicts (spec/data-model.md#Records, design-reviewed).
-- Server is authoritative: insert forcing, immutability and file-key shapes live in triggers and
-- check constraints that bind every role (including the table owner).

create type public.record_status as enum ('submitted', 'blocked', 'accepted', 'reviewed', 'locked');

-- Client-generated ids must be UUIDv7 (version nibble 7, RFC 4122 variant).
create function public.is_uuid_v7(u uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select substr(u::text, 15, 1) = '7' and substr(u::text, 20, 1) in ('8', '9', 'a', 'b');
$$;

-- True when the caller is an anonymous guest (users.is_anonymous). SECURITY DEFINER: `users` is not
-- readable by `authenticated`.
create function public.current_user_is_guest()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.is_anonymous from public.users u where u.id = app.current_user_id()), false);
$$;
revoke all on function public.current_user_is_guest() from public;
grant execute on function public.current_user_is_guest() to authenticated;

-- record_types ---------------------------------------------------------------------------------
-- company_id null = global built-in (seeded below, read-only for users).
create table public.record_types (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id),
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) default app.current_user_id(),
  unique nulls not distinct (company_id, code)
);

-- A company code may not shadow a global code.
create function public.record_types_code_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is not null and exists (
    select 1 from public.record_types g where g.company_id is null and g.code = new.code
  ) then
    raise exception 'record type code % shadows a global code', new.code using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger record_types_code_check
  before insert or update on public.record_types
  for each row execute function public.record_types_code_check();

-- form_schemas ---------------------------------------------------------------------------------
create table public.form_schemas (
  id uuid primary key default public.uuid_generate_v7(),
  record_type_id uuid not null references public.record_types (id),
  company_id uuid references public.companies (id),
  kind text not null check (kind in ('base', 'extension')),
  version int not null check (version > 0),
  schema jsonb not null check (jsonb_typeof(schema) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_at timestamptz,
  published_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) default app.current_user_id(),
  unique nulls not distinct (record_type_id, company_id, kind, version),
  -- extensions belong to a company; published_at is set exactly once the row leaves draft.
  check (kind = 'base' or company_id is not null),
  check ((status = 'draft') = (published_at is null))
);
create unique index form_schemas_one_published
  on public.form_schemas (record_type_id, company_id, kind) nulls not distinct
  where status = 'published';

-- Base schema: same owner as its type (global type -> global schema, company type -> own schema).
-- Extension: only for global types, always company-owned.
create function public.form_schemas_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  type_company uuid;
begin
  select rt.company_id into type_company from public.record_types rt where rt.id = new.record_type_id;
  if new.kind = 'base' and new.company_id is distinct from type_company then
    raise exception 'base schema must belong to the same company as its record type' using errcode = '23514';
  end if;
  if new.kind = 'extension' and type_company is not null then
    raise exception 'extensions are only allowed for global record types' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger form_schemas_check
  before insert or update on public.form_schemas
  for each row execute function public.form_schemas_check();

-- Published schemas are immutable: no delete, only published -> retired (nothing else changes).
-- Drafts are free to edit/delete and can only move to published. Binds all roles.
create function public.form_schemas_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'form_schemas: a % schema cannot be deleted', old.status using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    if new.status = 'retired' then
      raise exception 'form_schemas: a draft cannot be retired' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.status = 'published' and new.status = 'retired'
     and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
    return new;
  end if;
  raise exception 'form_schemas: a % schema is immutable', old.status using errcode = 'P0001';
end;
$$;
create trigger form_schemas_guard
  before update or delete on public.form_schemas
  for each row execute function public.form_schemas_guard();

-- records --------------------------------------------------------------------------------------
create table public.records (
  id uuid primary key check (public.is_uuid_v7(id)),
  company_id uuid not null references public.companies (id),
  record_type_id uuid not null references public.record_types (id),
  schema_version int not null check (schema_version > 0),
  extension_version int check (extension_version > 0),
  status public.record_status not null default 'submitted',
  occurred_at timestamptz not null,
  crew_id uuid not null,
  location_id uuid not null,
  task_type_id uuid references public.task_types (id),
  author_id uuid not null references public.users (id) default app.current_user_id(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 262144),
  submission_hash text not null check (submission_hash ~ '^[0-9a-f]{64}$'),
  geo_lat numeric(9, 6) check (geo_lat between -90 and 90),
  geo_lng numeric(9, 6) check (geo_lng between -180 and 180),
  geo_accuracy numeric(8, 2) check (geo_accuracy >= 0),
  device_id text not null check (length(trim(device_id)) > 0),
  client_created_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  amends_record_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  check ((geo_lat is null) = (geo_lng is null)),
  check (geo_accuracy is null or geo_lat is not null),
  check (amends_record_id is null or amends_record_id <> id),
  foreign key (company_id, crew_id) references public.crews (company_id, id),
  foreign key (company_id, location_id) references public.locations (company_id, id),
  foreign key (company_id, amends_record_id) references public.records (company_id, id)
);
create index records_company_occurred_idx on public.records (company_id, occurred_at desc);
create index records_author_idx on public.records (company_id, author_id);
create index records_type_idx on public.records (record_type_id);
create index records_crew_idx on public.records (company_id, crew_id);
create index records_location_idx on public.records (company_id, location_id);
create index records_task_type_idx on public.records (task_type_id);
create index records_amends_idx on public.records (company_id, amends_record_id);
create index records_author_user_idx on public.records (author_id);

-- Insert forcing (all roles): the server decides status, time and author.
create function public.records_force_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := 'submitted';
  new.submitted_at := now();
  new.author_id := app.current_user_id();
  return new;
end;
$$;
create trigger records_force_insert
  before insert on public.records
  for each row execute function public.records_force_insert();

-- Version pin: the base (and extension) version the record was filled in must exist and be
-- published or retired. record_types.active is deliberately not checked (offline drafts of a
-- deactivated type still sync).
create function public.records_version_pin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  type_company uuid;
begin
  if not exists (
    select 1 from public.form_schemas fs
    where fs.record_type_id = new.record_type_id and fs.kind = 'base' and fs.version = new.schema_version
      and fs.status in ('published', 'retired')
      and (fs.company_id is null or fs.company_id = new.company_id)
  ) then
    raise exception 'no published base schema v% for record type %', new.schema_version, new.record_type_id
      using errcode = '23503';
  end if;
  if new.extension_version is not null then
    select rt.company_id into type_company from public.record_types rt where rt.id = new.record_type_id;
    if type_company is not null or not exists (
      select 1 from public.form_schemas fs
      where fs.record_type_id = new.record_type_id and fs.kind = 'extension' and fs.version = new.extension_version
        and fs.status in ('published', 'retired') and fs.company_id = new.company_id
    ) then
      raise exception 'no published extension schema v% for record type %', new.extension_version, new.record_type_id
        using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
create trigger records_version_pin
  before insert on public.records
  for each row execute function public.records_version_pin();

create trigger records_ref_check
  before insert or update on public.records
  for each row execute function public.check_global_or_own_ref(
    'record_type_id', 'record_types', 'task_type_id', 'task_types'
  );

-- Immutability (all roles): never deleted; locked is frozen; otherwise only `status` may change
-- (future reviewed_* columns join the exception in the phase that adds them).
create function public.records_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'records cannot be deleted' using errcode = 'P0001';
  end if;
  if old.status = 'locked' then
    raise exception 'record % is locked', old.id using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'records are immutable: only status may change' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger records_guard
  before update or delete on public.records
  for each row execute function public.records_guard();

-- record_participants --------------------------------------------------------------------------
create table public.record_participants (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id),
  record_id uuid not null,
  persona_id uuid not null,
  role text not null check (role in ('attendee', 'signer', 'responsible')),
  created_at timestamptz not null default now(),
  unique (record_id, persona_id, role),
  foreign key (company_id, record_id) references public.records (company_id, id),
  foreign key (company_id, persona_id) references public.personas (company_id, id)
);
create index record_participants_persona_idx on public.record_participants (company_id, persona_id);

-- signatures -----------------------------------------------------------------------------------
create table public.signatures (
  id uuid primary key check (public.is_uuid_v7(id)),
  company_id uuid not null references public.companies (id),
  record_id uuid not null,
  persona_id uuid not null,
  image_path text not null,
  signed_at timestamptz not null,
  geo_lat numeric(9, 6) check (geo_lat between -90 and 90),
  geo_lng numeric(9, 6) check (geo_lng between -180 and 180),
  geo_accuracy numeric(8, 2) check (geo_accuracy >= 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (record_id, persona_id),
  check (image_path = company_id::text || '/signatures/' || id::text || '.png'),
  check ((geo_lat is null) = (geo_lng is null)),
  foreign key (company_id, record_id) references public.records (company_id, id),
  foreign key (company_id, persona_id) references public.personas (company_id, id)
);
create index signatures_persona_idx on public.signatures (company_id, persona_id);

-- A signature's persona must be a signer/attendee participant of the same record.
create function public.signatures_participant_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.record_participants p
    where p.record_id = new.record_id and p.persona_id = new.persona_id and p.role in ('signer', 'attendee')
  ) then
    raise exception 'signature persona % is not a signer or attendee of record %', new.persona_id, new.record_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger signatures_participant_check
  before insert on public.signatures
  for each row execute function public.signatures_participant_check();

-- attachments ----------------------------------------------------------------------------------
-- One owner. Phase 3 adds corrective_action_id and widens the owner check to num_nonnulls(...) = 1.
create table public.attachments (
  id uuid primary key check (public.is_uuid_v7(id)),
  company_id uuid not null references public.companies (id),
  record_id uuid,
  path text not null,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  size int not null check (size > 0 and size <= 5242880),
  taken_at timestamptz not null,
  geo_lat numeric(9, 6) check (geo_lat between -90 and 90),
  geo_lng numeric(9, 6) check (geo_lng between -180 and 180),
  created_at timestamptz not null default now(),
  check (num_nonnulls(record_id) = 1),
  check (path ~ ('^' || company_id::text || '/records/' || record_id::text || '/' || id::text || '\.(jpg|jpeg|png|webp)$')),
  check ((geo_lat is null) = (geo_lng is null)),
  foreign key (company_id, record_id) references public.records (company_id, id)
);
create index attachments_record_idx on public.attachments (company_id, record_id);

-- record_conflicts -----------------------------------------------------------------------------
create table public.record_conflicts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id),
  record_id uuid not null,
  envelope jsonb not null check (jsonb_typeof(envelope) = 'object' and octet_length(envelope::text) <= 524288),
  device_id text not null check (length(trim(device_id)) > 0),
  author_id uuid not null references public.users (id) default app.current_user_id(),
  received_at timestamptz not null default now(),
  foreign key (company_id, record_id) references public.records (company_id, id)
);
create index record_conflicts_record_idx on public.record_conflicts (company_id, record_id);
create index record_conflicts_author_idx on public.record_conflicts (author_id);

-- Append-only / never updated (all roles). Children are only written in the record's transaction.
create trigger record_participants_no_mutation
  before update or delete on public.record_participants
  for each row execute function public.reject_mutation();
create trigger signatures_no_mutation
  before update or delete on public.signatures
  for each row execute function public.reject_mutation();
create trigger attachments_no_mutation
  before update or delete on public.attachments
  for each row execute function public.reject_mutation();
create trigger record_conflicts_no_mutation
  before update or delete on public.record_conflicts
  for each row execute function public.reject_mutation();

-- Global seeds (fixed ids, like the other 90000000-... seeds):
--   record types 90000000-0000-7000-8000-0000000005NN, base schemas ...0006NN.
-- Seeded BEFORE the audit triggers exist; global rows are never audited anyway.
insert into public.record_types (id, code, name) values
  ('90000000-0000-7000-8000-000000000501', 'toolbox_talk', 'Charla de seguridad'),
  ('90000000-0000-7000-8000-000000000502', 'ats', 'Análisis de trabajo seguro (ATS)');

insert into public.form_schemas (id, record_type_id, kind, version, status, published_at, schema) values
  ('90000000-0000-7000-8000-000000000601', '90000000-0000-7000-8000-000000000501', 'base', 1, 'published', now(),
   $schema${
  "title": "Charla de seguridad",
  "sections": [
    {
      "key": "charla",
      "title": "Charla",
      "fields": [
        { "key": "topic", "type": "text", "label": "Tema", "required": true, "maxLength": 200 },
        { "key": "crew", "type": "crew", "label": "Cuadrilla", "required": true },
        { "key": "location", "type": "location", "label": "Locación", "required": true },
        {
          "key": "attendees",
          "type": "persona",
          "label": "Asistentes",
          "multiple": true,
          "role": "attendee",
          "signature": true,
          "required": true,
          "widget": "attendees"
        },
        { "key": "notes", "type": "textarea", "label": "Observaciones", "maxLength": 2000 },
        { "key": "geo", "type": "geo", "label": "Ubicación" }
      ]
    }
  ]
}$schema$::jsonb),
  ('90000000-0000-7000-8000-000000000602', '90000000-0000-7000-8000-000000000502', 'base', 1, 'published', now(),
   $schema${
  "title": "Análisis de trabajo seguro (ATS)",
  "sections": [
    {
      "key": "tarea",
      "title": "Tarea",
      "fields": [
        { "key": "task_type", "type": "task_type", "label": "Tipo de tarea", "required": true },
        {
          "key": "steps",
          "type": "group",
          "label": "Pasos, peligros y controles",
          "repeatable": true,
          "min": 1,
          "max": 30,
          "required": true,
          "widget": "steps_hazards_controls",
          "fields": [
            { "key": "step", "type": "text", "label": "Paso", "required": true, "maxLength": 300 },
            {
              "key": "hazards",
              "type": "group",
              "label": "Peligros",
              "repeatable": true,
              "min": 1,
              "max": 20,
              "required": true,
              "fields": [
                {
                  "key": "hazard",
                  "type": "text",
                  "label": "Peligro",
                  "required": true,
                  "maxLength": 300
                },
                {
                  "key": "controls",
                  "type": "textarea",
                  "label": "Controles",
                  "required": true,
                  "maxLength": 1000
                }
              ]
            }
          ]
        },
        { "key": "ppe", "type": "ppe", "label": "EPP requerido", "required": true }
      ]
    },
    {
      "key": "cierre",
      "title": "Participantes",
      "fields": [
        {
          "key": "participants",
          "type": "persona",
          "label": "Participantes",
          "multiple": true,
          "role": "signer",
          "signature": true,
          "required": true
        },
        { "key": "geo", "type": "geo", "label": "Ubicación" }
      ]
    }
  ]
}$schema$::jsonb);

-- RLS ------------------------------------------------------------------------------------------
alter table public.record_types enable row level security;
alter table public.form_schemas enable row level security;
alter table public.records enable row level security;
alter table public.record_participants enable row level security;
alter table public.signatures enable row level security;
alter table public.attachments enable row level security;
alter table public.record_conflicts enable row level security;

-- Phase 2: types and schemas are read-only for users (writes arrive with phase 3b).
grant select on public.record_types to authenticated;
grant select on public.form_schemas to authenticated;
grant select, insert on public.records to authenticated;
grant select, insert on public.record_participants to authenticated;
grant select, insert on public.signatures to authenticated;
grant select, insert on public.attachments to authenticated;
grant select, insert on public.record_conflicts to authenticated;

create policy record_types_select on public.record_types
  for select to authenticated
  using (company_id is null or company_id = public.current_company_id());

create policy form_schemas_select on public.form_schemas
  for select to authenticated
  using (
    (company_id is null or company_id = public.current_company_id())
    and (status in ('published', 'retired') or public.has_role(array['hse', 'admin']::public.member_role[]))
  );

-- Read: the author, or hse/manager/admin; anonymous guests (who share the demo company) only their own.
create policy records_select on public.records
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      author_id = app.current_user_id()
      or (
        not public.current_user_is_guest()
        and public.has_role(array['hse', 'manager', 'admin']::public.member_role[])
      )
    )
  );
create policy records_insert on public.records
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['supervisor', 'hse', 'admin']::public.member_role[])
    and status = 'submitted'
    and author_id = app.current_user_id()
    and exists (
      select 1 from public.record_types rt
      where rt.id = record_type_id and (rt.company_id is null or rt.company_id = records.company_id)
    )
    and (
      task_type_id is null or exists (
        select 1 from public.task_types tt
        where tt.id = task_type_id and (tt.company_id is null or tt.company_id = records.company_id)
      )
    )
  );

-- Children: readable when their record is (the subquery runs under the records policy); insertable
-- only into the caller's own record, still `submitted`, created in this very transaction.
create policy record_participants_select on public.record_participants
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.records r
      where r.company_id = record_participants.company_id and r.id = record_participants.record_id
    )
  );
create policy record_participants_insert on public.record_participants
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['supervisor', 'hse', 'admin']::public.member_role[])
    and exists (
      select 1 from public.records r
      where r.company_id = record_participants.company_id and r.id = record_participants.record_id
        and r.author_id = app.current_user_id() and r.status = 'submitted' and r.created_at = now()
    )
  );

create policy signatures_select on public.signatures
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.records r
      where r.company_id = signatures.company_id and r.id = signatures.record_id
    )
  );
create policy signatures_insert on public.signatures
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['supervisor', 'hse', 'admin']::public.member_role[])
    and exists (
      select 1 from public.records r
      where r.company_id = signatures.company_id and r.id = signatures.record_id
        and r.author_id = app.current_user_id() and r.status = 'submitted' and r.created_at = now()
    )
  );

create policy attachments_select on public.attachments
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.records r
      where r.company_id = attachments.company_id and r.id = attachments.record_id
    )
  );
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['supervisor', 'hse', 'admin']::public.member_role[])
    and exists (
      select 1 from public.records r
      where r.company_id = attachments.company_id and r.id = attachments.record_id
        and r.author_id = app.current_user_id() and r.status = 'submitted' and r.created_at = now()
    )
  );

-- Conflict copies are for HSE (and the submitter, so INSERT ... RETURNING works). Inserted by the
-- caller as author, only for a record they can see.
create policy record_conflicts_select on public.record_conflicts
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (author_id = app.current_user_id() or public.has_role(array['hse', 'admin']::public.member_role[]))
  );
create policy record_conflicts_insert on public.record_conflicts
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_role(array['supervisor', 'hse', 'admin']::public.member_role[])
    and author_id = app.current_user_id()
    and exists (
      select 1 from public.records r
      where r.company_id = record_conflicts.company_id and r.id = record_conflicts.record_id
    )
  );

-- Shared triggers ------------------------------------------------------------------------------
-- Expired trials are read-only (global rows, company_id null, pass). None of these functions read
-- table-specific columns.
create trigger assert_company_writable before insert or update or delete on public.record_types
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.form_schemas
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.records
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.record_participants
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.signatures
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.attachments
  for each row execute function app.assert_company_writable();
create trigger assert_company_writable before insert or update or delete on public.record_conflicts
  for each row execute function app.assert_company_writable();

create trigger records_audit
  after insert or update or delete on public.records
  for each row execute function public.audit_row();
create trigger record_participants_audit
  after insert or update or delete on public.record_participants
  for each row execute function public.audit_row();
create trigger signatures_audit
  after insert or update or delete on public.signatures
  for each row execute function public.audit_row();
create trigger attachments_audit
  after insert or update or delete on public.attachments
  for each row execute function public.audit_row();
create trigger record_conflicts_audit
  after insert or update or delete on public.record_conflicts
  for each row execute function public.audit_row();

-- Global rows (company_id null) are not audited: audit_log.company_id is NOT NULL.
create trigger record_types_audit_ins
  after insert on public.record_types
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger record_types_audit_upd
  after update on public.record_types
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger record_types_audit_del
  after delete on public.record_types
  for each row when (old.company_id is not null) execute function public.audit_row();

create trigger form_schemas_audit_ins
  after insert on public.form_schemas
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger form_schemas_audit_upd
  after update on public.form_schemas
  for each row when (new.company_id is not null) execute function public.audit_row();
create trigger form_schemas_audit_del
  after delete on public.form_schemas
  for each row when (old.company_id is not null) execute function public.audit_row();

-- migrate:down
drop table public.record_conflicts, public.attachments, public.signatures, public.record_participants;
drop table public.records;
drop table public.form_schemas;
drop table public.record_types;
drop function public.records_guard();
drop function public.records_version_pin();
drop function public.records_force_insert();
drop function public.signatures_participant_check();
drop function public.form_schemas_guard();
drop function public.form_schemas_check();
drop function public.record_types_code_check();
drop function public.current_user_is_guest();
drop function public.is_uuid_v7(uuid);
drop type public.record_status;
