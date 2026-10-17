-- migrate:up
-- One login per persona within a company.
drop index public.memberships_persona_idx;
create unique index memberships_persona_uniq on public.memberships (company_id, persona_id)
  where persona_id is not null;

-- migrate:down
drop index public.memberships_persona_uniq;
create index memberships_persona_idx on public.memberships (company_id, persona_id);
