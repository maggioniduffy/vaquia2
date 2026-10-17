import "server-only";
import { pool } from "@/lib/db";
import { CLEANUP_SQL, HIT_SQL } from "@/lib/rate-limit-sql";

export type RateLimit = { limit: number; windowSeconds: number };
export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

// Test-only switch; never honoured on Vercel.
function disabled(): boolean {
  return process.env.AUTH_RATE_LIMIT_DISABLED === "true" && !process.env.VERCEL;
}

/** Counts one hit for `key` in the current fixed window. Uses the owner pool (no tenant yet). */
export async function hit(
  key: string,
  { limit, windowSeconds }: RateLimit,
): Promise<RateLimitResult> {
  if (disabled()) return { ok: true, retryAfterSeconds: 0 };
  const { rows } = await pool.query<{ hits: number; retry_after: number }>(HIT_SQL, [
    key,
    windowSeconds,
  ]);
  // Opportunistic cleanup of old windows, ~1% of calls; failures are irrelevant.
  if (Math.random() < 0.01) void pool.query(CLEANUP_SQL).catch(() => {});
  const row = rows[0]!;
  return { ok: row.hits <= limit, retryAfterSeconds: Math.max(row.retry_after, 1) };
}
