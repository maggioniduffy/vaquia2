-- migrate:up

-- RLS helpers (current_company_id, has_role, current_user_is_guest, app.current_user_id) are STABLE
-- SECURITY DEFINER / search_path-pinned, so Postgres never inlines them and would call them once per
-- row. Wrapping each call in a scalar subquery turns it into an InitPlan evaluated once per statement.
-- Only the helper calls are wrapped (none takes a row column); correlated EXISTS stay per-row.
-- Semantics are unchanged.
alter policy attachments_insert on public.attachments
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role])) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = attachments.company_id) AND (r.id = attachments.record_id) AND (r.author_id = (select app.current_user_id())) AND (r.status = 'submitted'::public.record_status) AND (r.created_at = now())))))
  );

alter policy audit_log_select on public.audit_log
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'manager'::public.member_role, 'admin'::public.member_role])))
  );

alter policy companies_select on public.companies
  using (
    (id = (select public.current_company_id()))
  );

alter policy companies_update on public.companies
  using (
    ((id = (select public.current_company_id())) AND (select public.has_role(ARRAY['admin'::public.member_role])))
  )
  with check (
    (id = (select public.current_company_id()))
  );

alter policy crews_delete on public.crews
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy crews_insert on public.crews
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy crews_select on public.crews
  using (
    (company_id = (select public.current_company_id()))
  );

alter policy crews_update on public.crews
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  )
  with check (
    (company_id = (select public.current_company_id()))
  );

alter policy form_schemas_select on public.form_schemas
  using (
    (((company_id IS NULL) OR (company_id = (select public.current_company_id()))) AND ((status = ANY (ARRAY['published'::text, 'retired'::text])) OR (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))))
  );

alter policy invitations_insert on public.invitations
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['admin'::public.member_role])) AND (status = 'pending'::text))
  );

alter policy invitations_select on public.invitations
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['admin'::public.member_role])))
  );

alter policy invitations_update on public.invitations
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['admin'::public.member_role])) AND (status = 'pending'::text))
  )
  with check (
    ((company_id = (select public.current_company_id())) AND (status = 'revoked'::text))
  );

alter policy locations_delete on public.locations
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy locations_insert on public.locations
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy locations_select on public.locations
  using (
    (company_id = (select public.current_company_id()))
  );

alter policy locations_update on public.locations
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  )
  with check (
    (company_id = (select public.current_company_id()))
  );

alter policy memberships_delete on public.memberships
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['admin'::public.member_role])))
  );

alter policy memberships_select on public.memberships
  using (
    ((user_id = (select app.current_user_id())) OR (company_id = (select public.current_company_id())))
  );

alter policy memberships_update on public.memberships
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['admin'::public.member_role])))
  )
  with check (
    (company_id = (select public.current_company_id()))
  );

alter policy personas_delete on public.personas
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy personas_insert on public.personas
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy personas_select on public.personas
  using (
    (company_id = (select public.current_company_id()))
  );

alter policy personas_update on public.personas
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  )
  with check (
    (company_id = (select public.current_company_id()))
  );

alter policy qualification_types_delete on public.qualification_types
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy qualification_types_insert on public.qualification_types
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy qualification_types_select on public.qualification_types
  using (
    ((company_id IS NULL) OR (company_id = (select public.current_company_id())))
  );

alter policy qualification_types_update on public.qualification_types
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  )
  with check (
    (company_id = (select public.current_company_id()))
  );

alter policy qualifications_delete on public.qualifications
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy qualifications_insert on public.qualifications
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])) AND (EXISTS ( SELECT 1
    FROM public.qualification_types qt
    WHERE ((qt.id = qualifications.type_id) AND ((qt.company_id IS NULL) OR (qt.company_id = qualifications.company_id))))))
  );

alter policy qualifications_select on public.qualifications
  using (
    (company_id = (select public.current_company_id()))
  );

alter policy qualifications_update on public.qualifications
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  )
  with check (
    ((company_id = (select public.current_company_id())) AND (EXISTS ( SELECT 1
    FROM public.qualification_types qt
    WHERE ((qt.id = qualifications.type_id) AND ((qt.company_id IS NULL) OR (qt.company_id = qualifications.company_id))))))
  );

alter policy record_conflicts_insert on public.record_conflicts
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role])) AND (author_id = (select app.current_user_id())) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = record_conflicts.company_id) AND (r.id = record_conflicts.record_id)))))
  );

alter policy record_conflicts_select on public.record_conflicts
  using (
    ((company_id = (select public.current_company_id())) AND ((author_id = (select app.current_user_id())) OR (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))))
  );

alter policy record_participants_insert on public.record_participants
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role])) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = record_participants.company_id) AND (r.id = record_participants.record_id) AND (r.author_id = (select app.current_user_id())) AND (r.status = 'submitted'::public.record_status) AND (r.created_at = now())))))
  );

alter policy record_types_select on public.record_types
  using (
    ((company_id IS NULL) OR (company_id = (select public.current_company_id())))
  );

alter policy records_insert on public.records
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role])) AND (status = 'submitted'::public.record_status) AND (author_id = (select app.current_user_id())) AND (EXISTS ( SELECT 1
    FROM public.record_types rt
    WHERE ((rt.id = records.record_type_id) AND ((rt.company_id IS NULL) OR (rt.company_id = records.company_id))))) AND ((task_type_id IS NULL) OR (EXISTS ( SELECT 1
    FROM public.task_types tt
    WHERE ((tt.id = records.task_type_id) AND ((tt.company_id IS NULL) OR (tt.company_id = records.company_id)))))))
  );

alter policy records_select on public.records
  using (
    ((company_id = (select public.current_company_id())) AND ((author_id = (select app.current_user_id())) OR ((NOT (select public.current_user_is_guest())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'manager'::public.member_role, 'admin'::public.member_role])))))
  );

alter policy signatures_insert on public.signatures
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role])) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = signatures.company_id) AND (r.id = signatures.record_id) AND (r.author_id = (select app.current_user_id())) AND (r.status = 'submitted'::public.record_status) AND (r.created_at = now())))))
  );

alter policy task_requirements_delete on public.task_requirements
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy task_requirements_insert on public.task_requirements
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])) AND (EXISTS ( SELECT 1
    FROM public.task_types tt
    WHERE ((tt.id = task_requirements.task_type_id) AND ((tt.company_id IS NULL) OR (tt.company_id = task_requirements.company_id))))) AND (EXISTS ( SELECT 1
    FROM public.qualification_types qt
    WHERE ((qt.id = task_requirements.qualification_type_id) AND ((qt.company_id IS NULL) OR (qt.company_id = task_requirements.company_id))))))
  );

alter policy task_requirements_select on public.task_requirements
  using (
    ((company_id IS NULL) OR (company_id = (select public.current_company_id())))
  );

alter policy task_requirements_update on public.task_requirements
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  )
  with check (
    ((company_id = (select public.current_company_id())) AND (EXISTS ( SELECT 1
    FROM public.task_types tt
    WHERE ((tt.id = task_requirements.task_type_id) AND ((tt.company_id IS NULL) OR (tt.company_id = task_requirements.company_id))))) AND (EXISTS ( SELECT 1
    FROM public.qualification_types qt
    WHERE ((qt.id = task_requirements.qualification_type_id) AND ((qt.company_id IS NULL) OR (qt.company_id = task_requirements.company_id))))))
  );

alter policy task_types_delete on public.task_types
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy task_types_insert on public.task_types
  with check (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy task_types_select on public.task_types
  using (
    ((company_id IS NULL) OR (company_id = (select public.current_company_id())))
  );

alter policy task_types_update on public.task_types
  using (
    ((company_id = (select public.current_company_id())) AND (select public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  )
  with check (
    (company_id = (select public.current_company_id()))
  );

alter policy user_settings_select on public.user_settings
  using (
    (user_id = (select app.current_user_id()))
  );

-- Child tables follow the visibility of their record. This mirrors records_select (phase2_records):
-- company = current company AND (author = me OR (NOT guest AND role in hse/manager/admin)). Keep both
-- in sync (db/tests/records.test.ts has a drift guard). The role branch needs no per-row records
-- lookup; the author branch still reads records (and records_select applies to that read as well).
alter policy record_participants_select on public.record_participants
  using (
    company_id = (select public.current_company_id())
    and (
      (
        (select not public.current_user_is_guest())
        and (select public.has_role(array['hse', 'manager', 'admin']::public.member_role[]))
      )
      or exists (
        select 1 from public.records r
        where r.company_id = record_participants.company_id
          and r.id = record_participants.record_id
          and r.author_id = (select app.current_user_id())
      )
    )
  );

alter policy signatures_select on public.signatures
  using (
    company_id = (select public.current_company_id())
    and (
      (
        (select not public.current_user_is_guest())
        and (select public.has_role(array['hse', 'manager', 'admin']::public.member_role[]))
      )
      or exists (
        select 1 from public.records r
        where r.company_id = signatures.company_id
          and r.id = signatures.record_id
          and r.author_id = (select app.current_user_id())
      )
    )
  );

alter policy attachments_select on public.attachments
  using (
    company_id = (select public.current_company_id())
    and (
      (
        (select not public.current_user_is_guest())
        and (select public.has_role(array['hse', 'manager', 'admin']::public.member_role[]))
      )
      or exists (
        select 1 from public.records r
        where r.company_id = attachments.company_id
          and r.id = attachments.record_id
          and r.author_id = (select app.current_user_id())
      )
    )
  );

-- today_art() is STABLE with a pinned search_path, so it is not inlined and ran 3x per row of the
-- status calculation. Hoisting it into a scalar subquery evaluates it once per statement.
create or replace view public.current_qualifications with (security_invoker = true) as
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
    when c.expires_on <= (select public.today_art()) then 'expired'
    when c.expires_on <= (select public.today_art()) + 30 then 'expiring'
    else 'valid'
  end as status,
  (c.expires_on - (select public.today_art()))::int as days_left
from (
  select distinct on (q.persona_id, q.type_id) q.*
  from public.qualifications q
  order by q.persona_id, q.type_id, q.issued_on desc, q.created_at desc, q.id desc
) c;

-- Latest-qualification lookups (DISTINCT ON persona, type ordered by issued_on, created_at, id) can now
-- be served in order from the index.
drop index public.qualifications_persona_type_idx;
create index qualifications_persona_type_idx
  on public.qualifications (company_id, persona_id, type_id, issued_on desc, created_at desc, id desc);

-- migrate:down
create or replace view public.current_qualifications with (security_invoker = true) as
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

drop index public.qualifications_persona_type_idx;
create index qualifications_persona_type_idx
  on public.qualifications (company_id, persona_id, type_id, issued_on desc);

alter policy attachments_insert on public.attachments
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role]) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = attachments.company_id) AND (r.id = attachments.record_id) AND (r.author_id = app.current_user_id()) AND (r.status = 'submitted'::public.record_status) AND (r.created_at = now())))))
  );

alter policy audit_log_select on public.audit_log
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'manager'::public.member_role, 'admin'::public.member_role]))
  );

alter policy companies_select on public.companies
  using (
    (id = public.current_company_id())
  );

alter policy companies_update on public.companies
  using (
    ((id = public.current_company_id()) AND public.has_role(ARRAY['admin'::public.member_role]))
  )
  with check (
    (id = public.current_company_id())
  );

alter policy crews_delete on public.crews
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy crews_insert on public.crews
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy crews_select on public.crews
  using (
    (company_id = public.current_company_id())
  );

alter policy crews_update on public.crews
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  )
  with check (
    (company_id = public.current_company_id())
  );

alter policy form_schemas_select on public.form_schemas
  using (
    (((company_id IS NULL) OR (company_id = public.current_company_id())) AND ((status = ANY (ARRAY['published'::text, 'retired'::text])) OR public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy invitations_insert on public.invitations
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['admin'::public.member_role]) AND (status = 'pending'::text))
  );

alter policy invitations_select on public.invitations
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['admin'::public.member_role]))
  );

alter policy invitations_update on public.invitations
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['admin'::public.member_role]) AND (status = 'pending'::text))
  )
  with check (
    ((company_id = public.current_company_id()) AND (status = 'revoked'::text))
  );

alter policy locations_delete on public.locations
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy locations_insert on public.locations
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy locations_select on public.locations
  using (
    (company_id = public.current_company_id())
  );

alter policy locations_update on public.locations
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  )
  with check (
    (company_id = public.current_company_id())
  );

alter policy memberships_delete on public.memberships
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['admin'::public.member_role]))
  );

alter policy memberships_select on public.memberships
  using (
    ((user_id = app.current_user_id()) OR (company_id = public.current_company_id()))
  );

alter policy memberships_update on public.memberships
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['admin'::public.member_role]))
  )
  with check (
    (company_id = public.current_company_id())
  );

alter policy personas_delete on public.personas
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy personas_insert on public.personas
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy personas_select on public.personas
  using (
    (company_id = public.current_company_id())
  );

alter policy personas_update on public.personas
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  )
  with check (
    (company_id = public.current_company_id())
  );

alter policy qualification_types_delete on public.qualification_types
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy qualification_types_insert on public.qualification_types
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy qualification_types_select on public.qualification_types
  using (
    ((company_id IS NULL) OR (company_id = public.current_company_id()))
  );

alter policy qualification_types_update on public.qualification_types
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  )
  with check (
    (company_id = public.current_company_id())
  );

alter policy qualifications_delete on public.qualifications
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy qualifications_insert on public.qualifications
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]) AND (EXISTS ( SELECT 1
    FROM public.qualification_types qt
    WHERE ((qt.id = qualifications.type_id) AND ((qt.company_id IS NULL) OR (qt.company_id = qualifications.company_id))))))
  );

alter policy qualifications_select on public.qualifications
  using (
    (company_id = public.current_company_id())
  );

alter policy qualifications_update on public.qualifications
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  )
  with check (
    ((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
    FROM public.qualification_types qt
    WHERE ((qt.id = qualifications.type_id) AND ((qt.company_id IS NULL) OR (qt.company_id = qualifications.company_id))))))
  );

alter policy record_conflicts_insert on public.record_conflicts
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role]) AND (author_id = app.current_user_id()) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = record_conflicts.company_id) AND (r.id = record_conflicts.record_id)))))
  );

alter policy record_conflicts_select on public.record_conflicts
  using (
    ((company_id = public.current_company_id()) AND ((author_id = app.current_user_id()) OR public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role])))
  );

alter policy record_participants_insert on public.record_participants
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role]) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = record_participants.company_id) AND (r.id = record_participants.record_id) AND (r.author_id = app.current_user_id()) AND (r.status = 'submitted'::public.record_status) AND (r.created_at = now())))))
  );

alter policy record_types_select on public.record_types
  using (
    ((company_id IS NULL) OR (company_id = public.current_company_id()))
  );

alter policy records_insert on public.records
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role]) AND (status = 'submitted'::public.record_status) AND (author_id = app.current_user_id()) AND (EXISTS ( SELECT 1
    FROM public.record_types rt
    WHERE ((rt.id = records.record_type_id) AND ((rt.company_id IS NULL) OR (rt.company_id = records.company_id))))) AND ((task_type_id IS NULL) OR (EXISTS ( SELECT 1
    FROM public.task_types tt
    WHERE ((tt.id = records.task_type_id) AND ((tt.company_id IS NULL) OR (tt.company_id = records.company_id)))))))
  );

alter policy records_select on public.records
  using (
    ((company_id = public.current_company_id()) AND ((author_id = app.current_user_id()) OR ((NOT public.current_user_is_guest()) AND public.has_role(ARRAY['hse'::public.member_role, 'manager'::public.member_role, 'admin'::public.member_role]))))
  );

alter policy signatures_insert on public.signatures
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['supervisor'::public.member_role, 'hse'::public.member_role, 'admin'::public.member_role]) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = signatures.company_id) AND (r.id = signatures.record_id) AND (r.author_id = app.current_user_id()) AND (r.status = 'submitted'::public.record_status) AND (r.created_at = now())))))
  );

alter policy task_requirements_delete on public.task_requirements
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy task_requirements_insert on public.task_requirements
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]) AND (EXISTS ( SELECT 1
    FROM public.task_types tt
    WHERE ((tt.id = task_requirements.task_type_id) AND ((tt.company_id IS NULL) OR (tt.company_id = task_requirements.company_id))))) AND (EXISTS ( SELECT 1
    FROM public.qualification_types qt
    WHERE ((qt.id = task_requirements.qualification_type_id) AND ((qt.company_id IS NULL) OR (qt.company_id = task_requirements.company_id))))))
  );

alter policy task_requirements_select on public.task_requirements
  using (
    ((company_id IS NULL) OR (company_id = public.current_company_id()))
  );

alter policy task_requirements_update on public.task_requirements
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  )
  with check (
    ((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
    FROM public.task_types tt
    WHERE ((tt.id = task_requirements.task_type_id) AND ((tt.company_id IS NULL) OR (tt.company_id = task_requirements.company_id))))) AND (EXISTS ( SELECT 1
    FROM public.qualification_types qt
    WHERE ((qt.id = task_requirements.qualification_type_id) AND ((qt.company_id IS NULL) OR (qt.company_id = task_requirements.company_id))))))
  );

alter policy task_types_delete on public.task_types
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy task_types_insert on public.task_types
  with check (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  );

alter policy task_types_select on public.task_types
  using (
    ((company_id IS NULL) OR (company_id = public.current_company_id()))
  );

alter policy task_types_update on public.task_types
  using (
    ((company_id = public.current_company_id()) AND public.has_role(ARRAY['hse'::public.member_role, 'admin'::public.member_role]))
  )
  with check (
    (company_id = public.current_company_id())
  );

alter policy user_settings_select on public.user_settings
  using (
    (user_id = app.current_user_id())
  );

alter policy attachments_select on public.attachments
  using (
    ((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = attachments.company_id) AND (r.id = attachments.record_id)))))
  );

alter policy record_participants_select on public.record_participants
  using (
    ((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = record_participants.company_id) AND (r.id = record_participants.record_id)))))
  );

alter policy signatures_select on public.signatures
  using (
    ((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
    FROM public.records r
    WHERE ((r.company_id = signatures.company_id) AND (r.id = signatures.record_id)))))
  );
