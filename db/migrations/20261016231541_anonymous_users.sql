-- migrate:up
-- Better Auth anonymous plugin (temporary guest sessions for demos).
alter table users add column is_anonymous boolean not null default false;

-- migrate:down
alter table users drop column is_anonymous;
