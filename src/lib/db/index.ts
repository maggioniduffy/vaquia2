import "server-only";
import { Pool, type PoolClient } from "pg";
import { env } from "@/lib/env";

// One pool per server instance (reused across hot reloads in dev). On Neon use the pooled URL.
const globalForDb = globalThis as unknown as { vaquiaPool?: Pool };

function createPool() {
  return new Pool({ connectionString: env.databaseUrl, max: 5 });
}

export const pool: Pool = globalForDb.vaquiaPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.vaquiaPool = pool;

export type Db = PoolClient;

/**
 * Runs `fn` in a transaction as the `authenticated` role with `app.user_id` set, so every query
 * goes through RLS. All tenant data access must go through here — the bare pool is the table
 * owner and bypasses RLS (reserved for Better Auth and scripts).
 */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let failure: Error | undefined;
  try {
    await client.query("begin");
    await client.query(
      "select set_config('role', 'authenticated', true), set_config('app.user_id', $1, true)",
      [userId],
    );
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    // Never let a failed rollback mask the original error; drop the connection only if
    // the rollback itself failed (connection state unknown).
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      failure = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(failure);
  }
}
