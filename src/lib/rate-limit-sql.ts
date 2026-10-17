// Atomic fixed-window counter. $1 = key, $2 = window length in seconds.
// Returns the hit count for the current window (including this hit).
export const HIT_SQL = `
  insert into public.auth_rate_limits (key, window_start, hits)
  values ($1, to_timestamp(floor(extract(epoch from now()) / $2::int) * $2::int), 1)
  on conflict (key, window_start) do update set hits = public.auth_rate_limits.hits + 1
  returning hits, extract(epoch from (window_start + make_interval(secs => $2::int) - now()))::int as retry_after`;

export const CLEANUP_SQL =
  "delete from public.auth_rate_limits where window_start < now() - interval '1 day'";
