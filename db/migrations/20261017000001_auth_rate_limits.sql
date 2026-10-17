-- migrate:up
-- Fixed-window counters for login server actions (src/lib/rate-limit.ts). Owner-only on purpose,
-- like the Better Auth tables: not granted to `authenticated`.
create table public.auth_rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
create index auth_rate_limits_window_idx on public.auth_rate_limits (window_start);
alter table public.auth_rate_limits enable row level security;

-- migrate:down
drop table public.auth_rate_limits;
