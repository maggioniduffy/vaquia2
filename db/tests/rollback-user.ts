import pg from "pg";
import { TestDb } from "./helpers";

// For tests that call app code going through `withUser` (src/lib/db) while keeping everything
// inside one transaction that is rolled back at the end. The test file mocks `@/lib/db` with
// `withUserInRollback`, so the app's own queries run in the same transaction as the fixtures.

const state: { client: pg.Client | null } = { client: null };

/** Same role/setting switch as src/lib/db#withUser, wrapped in a savepoint so a failing statement can be undone. */
export async function withUserInRollback<T>(
  userId: string,
  fn: (db: pg.Client) => Promise<T>,
): Promise<T> {
  const client = state.client;
  if (!client) throw new Error("withUserInRollback called outside withTxForUser");
  await client.query("savepoint with_user");
  try {
    await client.query(
      "select set_config('role', 'authenticated', true), set_config('app.user_id', $1, true)",
      [userId],
    );
    const result = await fn(client);
    await client.query("release savepoint with_user");
    return result;
  } catch (error) {
    await client.query("rollback to savepoint with_user");
    throw error;
  }
}

/** Runs `fn` with a fixtures handle and the app's withUser both bound to one rolled-back transaction. */
export async function withTxForUser(fn: (db: TestDb) => Promise<void>) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  state.client = client;
  try {
    await client.query("begin");
    await fn(new TestDb(client));
  } finally {
    state.client = null;
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}
