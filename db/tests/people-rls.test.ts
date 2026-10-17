import { describe, expect, it } from "vitest";
import { createUser, ids, twoCompanies, withRollback, type TestDb } from "./helpers";

// RLS for the phase 1 tables: isolation (company A never sees or writes company B rows),
// write permissions (hse/admin only), and global rows (company_id null: readable, never writable).
const INSUFFICIENT_PRIVILEGE = "42501";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

const supA = "aaaaaaaa-0000-7000-8000-000000000003"; // supervisor in A
const adminA = "aaaaaaaa-0000-7000-8000-000000000004"; // admin in A
const memberX = "aaaaaaaa-0000-7000-8000-000000000005"; // worker in A, linked to persona p1
const memberY = "aaaaaaaa-0000-7000-8000-000000000006"; // worker in A, used for the 23505 test
const managerA = "aaaaaaaa-0000-7000-8000-000000000007"; // manager in A (read-only), created per test
const OPERATOR_YPF = "90000000-0000-7000-8000-000000000101";
const QTYPE_GLOBAL = "90000000-0000-7000-8000-000000000201";
const TTYPE_GLOBAL = "90000000-0000-7000-8000-000000000301";
const TREQ_GLOBAL = "90000000-0000-7000-8000-000000000401";

type Seeded = {
  personaA: string;
  qtypeA: string;
  ttypeA: string;
  qtypeB: string;
  ttypeB: string;
};

// Owner-side fixtures (RLS bypassed). Company B owns one row per tenant table; company A owns
// the personas/types that the write tests reference.
async function seed(db: TestDb): Promise<Seeded> {
  await twoCompanies(db);
  await createUser(db, supA, "a-supervisor@test.local");
  await createUser(db, adminA, "a-admin@test.local");
  await createUser(db, memberX, "a-member-x@test.local");
  await createUser(db, memberY, "a-member-y@test.local");
  await db.query(
    `insert into memberships (company_id, user_id, role) values
       ($1, $2, 'supervisor'), ($1, $3, 'admin'), ($1, $4, 'worker'), ($1, $5, 'worker')`,
    [ids.companyA, supA, adminA, memberX, memberY],
  );

  const locB = await db.one(
    "insert into locations (company_id, name) values ($1, 'Loc B') returning id",
    [ids.companyB],
  );
  const crewB = await db.one(
    "insert into crews (company_id, name, location_id) values ($1, 'Crew B', $2) returning id",
    [ids.companyB, locB.id],
  );
  const personaB = await db.one(
    "insert into personas (company_id, full_name, dni, crew_id) values ($1, 'Persona B', 'B-1', $2) returning id",
    [ids.companyB, crewB.id],
  );
  await db.query(
    "insert into qualifications (company_id, persona_id, type_id, issued_on) values ($1, $2, $3, '2026-01-01')",
    [ids.companyB, personaB.id, QTYPE_GLOBAL],
  );
  const qtypeB = await db.one(
    "insert into qualification_types (company_id, name) values ($1, 'Tipo B') returning id",
    [ids.companyB],
  );
  const ttypeB = await db.one(
    "insert into task_types (company_id, code, name) values ($1, 'tarea_b', 'Tarea B') returning id",
    [ids.companyB],
  );
  await db.query(
    "insert into task_requirements (company_id, task_type_id, qualification_type_id) values ($1, $2, $3)",
    [ids.companyB, ttypeB.id, qtypeB.id],
  );
  // Company A rows of the tables that have none yet (so "own rows are visible" is checkable).
  await db.query("insert into locations (company_id, name) values ($1, 'Loc A')", [ids.companyA]);
  await db.query("insert into crews (company_id, name) values ($1, 'Crew A')", [ids.companyA]);

  // Company A: one persona, one qualification type and one task type to reference from writes.
  const personaA = await db.one(
    "insert into personas (company_id, full_name, dni) values ($1, 'Persona A', 'A-1') returning id",
    [ids.companyA],
  );
  const qtypeA = await db.one(
    "insert into qualification_types (company_id, name) values ($1, 'Tipo A') returning id",
    [ids.companyA],
  );
  const ttypeA = await db.one(
    "insert into task_types (company_id, code, name) values ($1, 'tarea_a', 'Tarea A') returning id",
    [ids.companyA],
  );
  await db.query(
    "insert into qualifications (company_id, persona_id, type_id, issued_on) values ($1, $2, $3, '2026-01-01')",
    [ids.companyA, personaA.id, QTYPE_GLOBAL],
  );
  await db.query(
    "insert into task_requirements (company_id, task_type_id, qualification_type_id) values ($1, $2, $3)",
    [ids.companyA, ttypeA.id, QTYPE_GLOBAL],
  );
  return {
    personaA: personaA.id as string,
    qtypeA: qtypeA.id as string,
    ttypeA: ttypeA.id as string,
    qtypeB: qtypeB.id as string,
    ttypeB: ttypeB.id as string,
  };
}

type TenantSpec = {
  table: string;
  // Insert statement for `company_id = $1`; `label` keeps unique columns distinct per call.
  insert: (company: string, label: string, s: Seeded) => { sql: string; params: unknown[] };
};

const TENANT_TABLES: TenantSpec[] = [
  {
    table: "locations",
    insert: (c, l) => ({ sql: "insert into locations (company_id, name) values ($1, $2)", params: [c, l] }),
  },
  {
    table: "crews",
    insert: (c, l) => ({ sql: "insert into crews (company_id, name) values ($1, $2)", params: [c, l] }),
  },
  {
    table: "personas",
    insert: (c, l) => ({
      sql: "insert into personas (company_id, full_name, dni) values ($1, $2, $2)",
      params: [c, l],
    }),
  },
  {
    table: "qualification_types",
    insert: (c, l) => ({
      sql: "insert into qualification_types (company_id, name) values ($1, $2)",
      params: [c, l],
    }),
  },
  {
    table: "qualifications",
    insert: (c, _l, s) => ({
      sql: "insert into qualifications (company_id, persona_id, type_id, issued_on) values ($1, $2, $3, '2026-02-01')",
      params: [c, s.personaA, QTYPE_GLOBAL],
    }),
  },
  {
    table: "task_types",
    insert: (c, l) => ({
      sql: "insert into task_types (company_id, code, name) values ($1, $2, 'Tarea')",
      params: [c, `t_${l}`],
    }),
  },
  {
    table: "task_requirements",
    insert: (c, _l, s) => ({
      sql: "insert into task_requirements (company_id, task_type_id, qualification_type_id) values ($1, $2, $3)",
      // Company B uses the global pair: the ref trigger passes, so RLS is what rejects the row.
      params: c === ids.companyB ? [c, TTYPE_GLOBAL, QTYPE_GLOBAL] : [c, s.ttypeA, s.qtypeA],
    }),
  },
];

// The seed has no manager: created inside each test that needs one (never in the seed).
async function addManagerA(db: TestDb) {
  await createUser(db, managerA, "a-manager@test.local");
  await db.query("insert into memberships (company_id, user_id, role) values ($1, $2, 'manager')", [
    ids.companyA,
    managerA,
  ]);
}

// Owner-side count of the company B row of each table (to prove tenant A changed nothing).
async function countB(db: TestDb, table: string): Promise<number> {
  await db.as(null);
  const n = (await db.one(`select count(*)::int as n from ${table} where company_id = $1`, [ids.companyB])).n as number;
  return n;
}

describe("people RLS: tenant tables", () => {
  for (const spec of TENANT_TABLES) {
    describe(spec.table, () => {
      it("company A cannot read, update or delete company B rows", () =>
        withRollback(async (db) => {
          await seed(db);
          await db.as(ids.userA);
          expect((await db.one(`select count(*)::int as n from ${spec.table} where company_id = $1`, [ids.companyB])).n).toBe(0);
          expect((await db.one(`select count(*)::int as n from ${spec.table}`)).n).toBeGreaterThan(0);
          expect(await db.query(`select 1 from ${spec.table} where company_id <> $1 and company_id is not null`, [ids.companyA])).toEqual([]);

          expect(await db.query(`update ${spec.table} set created_at = created_at where company_id = $1 returning 1`, [ids.companyB])).toEqual([]);
          expect(await db.query(`delete from ${spec.table} where company_id = $1 returning 1`, [ids.companyB])).toEqual([]);
          expect(await countB(db, spec.table)).toBe(1);
        }));

      it("company A cannot insert a row with company B's company_id", () =>
        withRollback(async (db) => {
          const s = await seed(db);
          await db.as(ids.userA);
          const { sql, params } = spec.insert(ids.companyB, "iso", s);
          expect(await db.errorCode(sql, params)).toBe(INSUFFICIENT_PRIVILEGE);
          expect(await countB(db, spec.table)).toBe(1);
        }));

      it("hse of company A can write its own company rows", () =>
        withRollback(async (db) => {
          const s = await seed(db);
          await db.as(ids.userA);
          const { sql, params } = spec.insert(ids.companyA, "hse", s);
          expect(await db.errorCode(sql, params)).toBeNull();
        }));

      it("read-only roles (worker, supervisor, manager) of company A cannot write", () =>
        withRollback(async (db) => {
          const s = await seed(db);
          await addManagerA(db);
          for (const user of [ids.workerA, supA, managerA]) {
            await db.as(user);
            const { sql, params } = spec.insert(ids.companyA, `ro_${user.slice(0, 8)}`, s);
            expect(await db.errorCode(sql, params)).toBe(INSUFFICIENT_PRIVILEGE);
          }
          // ...but a worker can still read own company rows.
          await db.as(ids.workerA);
          expect((await db.one(`select count(*)::int as n from ${spec.table} where company_id = $1`, [ids.companyA])).n).toBeGreaterThan(0);
        }));
    });
  }

  it("task_requirements: company A cannot reference company B's task type (ref trigger)", () =>
    withRollback(async (db) => {
      const s = await seed(db);
      await db.as(ids.userA);
      // The trigger looks the referenced row up under RLS, so B's type is invisible: 23503.
      expect(
        await db.errorCode(
          "insert into task_requirements (company_id, task_type_id, qualification_type_id) values ($1, $2, $3)",
          [ids.companyA, s.ttypeB, s.qtypeA],
        ),
      ).toBe(FOREIGN_KEY_VIOLATION);
    }));

  it("personas: a crew from company B cannot be referenced by company A (composite FK)", () =>
    withRollback(async (db) => {
      await seed(db);
      const crewB = await db.one("select id from crews where company_id = $1", [ids.companyB]);
      await db.as(ids.userA);
      expect(
        await db.errorCode(
          "insert into personas (company_id, full_name, dni, crew_id) values ($1, 'X', 'X-9', $2)",
          [ids.companyA, crewB.id],
        ),
      ).toBe(FOREIGN_KEY_VIOLATION);
    }));

  it("qualifications: a persona of company B cannot be referenced by company A", () =>
    withRollback(async (db) => {
      const s = await seed(db);
      const personaB = await db.one("select id from personas where company_id = $1", [ids.companyB]);
      await db.as(ids.userA);
      expect(
        await db.errorCode(
          "insert into qualifications (company_id, persona_id, type_id, issued_on) values ($1, $2, $3, '2026-02-01')",
          [ids.companyA, personaB.id, s.qtypeA],
        ),
      ).toBe(FOREIGN_KEY_VIOLATION);
    }));
});

describe("people RLS: global rows (company_id null)", () => {
  it("everyone reads the global qualification types, task types and requirements", () =>
    withRollback(async (db) => {
      await seed(db);
      await db.as(ids.userA);
      expect((await db.one("select count(*)::int as n from qualification_types where company_id is null")).n).toBe(10);
      expect((await db.one("select count(*)::int as n from task_types where company_id is null")).n).toBe(6);
      expect((await db.one("select count(*)::int as n from task_requirements where company_id is null")).n).toBe(5);
      await db.as(ids.workerA);
      expect(await db.query("select id from qualification_types where id = $1", [QTYPE_GLOBAL])).toHaveLength(1);
    }));

  it("tenants cannot insert, update or delete global rows, even as hse/admin", () =>
    withRollback(async (db) => {
      await seed(db);
      await db.as(ids.userA); // hse
      expect(
        await db.errorCode("insert into qualification_types (company_id, name) values (null, 'Global X')"),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await db.errorCode("insert into task_types (company_id, code, name) values (null, 'x_global', 'X')"),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await db.errorCode(
          "insert into task_requirements (company_id, task_type_id, qualification_type_id) values (null, $1, $2)",
          [TTYPE_GLOBAL, QTYPE_GLOBAL],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);

      expect(
        await db.query("update qualification_types set name = 'hacked' where id = $1 returning id", [QTYPE_GLOBAL]),
      ).toEqual([]);
      expect(await db.query("delete from task_types where id = $1 returning id", [TTYPE_GLOBAL])).toEqual([]);
      expect(await db.query("delete from task_requirements where id = $1 returning id", [TREQ_GLOBAL])).toEqual([]);

      await db.as(null);
      expect((await db.one("select name from qualification_types where id = $1", [QTYPE_GLOBAL])).name).toBe(
        "Inducción de operadora",
      );
      expect((await db.one("select count(*)::int as n from task_requirements where id = $1", [TREQ_GLOBAL])).n).toBe(1);
    }));
});

describe("people RLS: operators (global catalog, no company_id)", () => {
  it("every authenticated user reads the operators", () =>
    withRollback(async (db) => {
      await seed(db);
      await db.as(ids.workerA);
      expect((await db.one("select count(*)::int as n from operators")).n).toBe(8);
    }));

  it("no tenant role can insert, update or delete operators", () =>
    withRollback(async (db) => {
      await seed(db);
      await db.as(ids.userA);
      expect(await db.errorCode("insert into operators (name, code) values ('X', 'X')")).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await db.errorCode("update operators set name = 'X' where id = $1", [OPERATOR_YPF])).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(await db.errorCode("delete from operators where id = $1", [OPERATOR_YPF])).toBe(INSUFFICIENT_PRIVILEGE);
    }));
});

describe("people RLS: memberships and persona link", () => {
  it("company A cannot see or insert company B memberships", () =>
    withRollback(async (db) => {
      await seed(db);
      await db.as(ids.userA);
      expect(await db.query("select 1 from memberships where company_id = $1", [ids.companyB])).toEqual([]);
      expect(
        await db.errorCode(
          "insert into memberships (company_id, user_id, role) values ($1, $2, 'worker')",
          [ids.companyB, ids.workerA],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("the partial unique index rejects a second link of the same persona in a company", () =>
    withRollback(async (db) => {
      const s = await seed(db);
      await db.query(
        "update memberships set persona_id = $1 where company_id = $2 and user_id = $3",
        [s.personaA, ids.companyA, memberX],
      );
      expect(
        await db.errorCode(
          "update memberships set persona_id = $1 where company_id = $2 and user_id = $3",
          [s.personaA, ids.companyA, memberY],
        ),
      ).toBe(UNIQUE_VIOLATION);
      expect(
        await db.errorCode(
          "insert into memberships (company_id, user_id, role, persona_id) values ($1, $2, 'worker', $3)",
          [ids.companyA, ids.userB, s.personaA],
        ),
      ).toBe(UNIQUE_VIOLATION);
    }));

  it("non-admins cannot insert or re-link memberships; admins can", () =>
    withRollback(async (db) => {
      const s = await seed(db);
      await db.query(
        "update memberships set persona_id = $1 where company_id = $2 and user_id = $3",
        [s.personaA, ids.companyA, memberX],
      );
      // hse (userA) and worker cannot insert a membership.
      for (const user of [ids.userA, ids.workerA]) {
        await db.as(user);
        expect(
          await db.errorCode(
            "insert into memberships (company_id, user_id, role) values ($1, $2, 'worker')",
            [ids.companyA, ids.userB],
          ),
        ).toBe(INSUFFICIENT_PRIVILEGE);
      }
      // hse cannot unlink the persona (update affects no rows).
      await db.as(ids.userA);
      expect(
        await db.query(
          "update memberships set persona_id = null where company_id = $1 and user_id = $2 returning id",
          [ids.companyA, memberX],
        ),
      ).toEqual([]);

      await db.as(adminA);
      expect(
        await db.query(
          "update memberships set persona_id = null where company_id = $1 and user_id = $2 returning id",
          [ids.companyA, memberX],
        ),
      ).toHaveLength(1);
    }));
});

describe("people RLS: status views (security_invoker, cross-tenant)", () => {
  const VIEWS = ["current_qualifications", "qualification_status", "persona_task_fitness"] as const;

  for (const view of VIEWS) {
    it(`${view}: company A users never see company B rows, but see their own`, () =>
      withRollback(async (db) => {
        const s = await seed(db);
        const personaB = await db.one("select id from personas where company_id = $1", [ids.companyB]);
        await addManagerA(db);

        // Owner-side: company B has rows in the view, so the isolation check below is not vacuous.
        await db.as(null);
        expect(
          (await db.one(`select count(*)::int as n from ${view} where company_id = $1`, [ids.companyB])).n,
        ).toBeGreaterThan(0);

        for (const user of [ids.userA, ids.workerA, managerA]) {
          await db.as(user);
          expect(
            (await db.one(`select count(*)::int as n from ${view} where company_id = $1`, [ids.companyB])).n,
          ).toBe(0);
          expect(await db.query(`select 1 from ${view} where persona_id = $1`, [personaB.id])).toEqual([]);
          expect(
            await db.query(`select 1 from ${view} where company_id is not null and company_id <> $1`, [ids.companyA]),
          ).toEqual([]);
          // Own rows are visible (persona A is linked to a qualification and to every task type).
          expect(
            (await db.one(`select count(*)::int as n from ${view} where persona_id = $1`, [s.personaA])).n,
          ).toBeGreaterThan(0);
        }
      }));
  }
});
