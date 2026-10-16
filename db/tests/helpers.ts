import pg from "pg";

export type Row = Record<string, unknown>;

// One connection per test, everything rolled back at the end. Fixtures are written as the owner
// (RLS bypassed); `as(userId)` switches to the app role exactly like src/lib/db#withUser.
export class TestDb {
  private savepoints = 0;

  constructor(private client: pg.Client) {}

  async as(userId: string | null) {
    if (userId === null) {
      await this.client.query("set local role none");
      await this.client.query("select set_config('app.user_id', '', true)");
      return;
    }
    await this.client.query(
      "select set_config('role', 'authenticated', true), set_config('app.user_id', $1, true)",
      [userId],
    );
  }

  async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.client.query<T>(sql, params)).rows;
  }

  async one<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T> {
    const rows = await this.query<T>(sql, params);
    if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
    return rows[0]!;
  }

  // Returns the SQLSTATE of the error the statement raised, or null if it succeeded.
  async errorCode(sql: string, params: unknown[] = []): Promise<string | null> {
    const name = `sp_${++this.savepoints}`;
    await this.client.query(`savepoint ${name}`);
    try {
      await this.client.query(sql, params);
      await this.client.query(`release savepoint ${name}`);
      return null;
    } catch (error) {
      await this.client.query(`rollback to savepoint ${name}`);
      return (error as { code?: string }).code ?? "unknown";
    }
  }
}

export async function withRollback(fn: (db: TestDb) => Promise<void>) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await fn(new TestDb(client));
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

export const ids = {
  userA: "aaaaaaaa-0000-7000-8000-000000000001",
  workerA: "aaaaaaaa-0000-7000-8000-000000000002",
  userB: "bbbbbbbb-0000-7000-8000-000000000001",
  both: "cccccccc-0000-7000-8000-000000000001",
  companyA: "aaaaaaaa-0000-7000-8000-00000000000a",
  companyB: "bbbbbbbb-0000-7000-8000-00000000000b",
};

export async function createUser(db: TestDb, id: string, email: string) {
  await db.query("insert into users (id, name, email, email_verified) values ($1, $2, $2, true)", [
    id,
    email,
  ]);
}

// Company A: hse + worker. Company B: admin. `both`: worker in A (older), admin in B.
export async function twoCompanies(db: TestDb) {
  await createUser(db, ids.userA, "a-hse@test.local");
  await createUser(db, ids.workerA, "a-worker@test.local");
  await createUser(db, ids.userB, "b-admin@test.local");
  await createUser(db, ids.both, "both@test.local");
  await db.query("insert into companies (id, name) values ($1, 'Company A'), ($2, 'Company B')", [
    ids.companyA,
    ids.companyB,
  ]);
  await db.query(
    `insert into memberships (company_id, user_id, role, created_at) values
       ($1, $3, 'hse', now()),
       ($1, $4, 'worker', now()),
       ($2, $5, 'admin', now()),
       ($1, $6, 'worker', now() - interval '1 day'),
       ($2, $6, 'admin', now())`,
    [ids.companyA, ids.companyB, ids.userA, ids.workerA, ids.userB, ids.both],
  );
}
