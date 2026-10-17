import { describe, expect, it } from "vitest";
import { createUser, withRollback, type TestDb } from "./helpers";

// Expired trial = read-only, enforced by the `assert_company_writable` trigger (SQLSTATE VQ001) on
// every business tenant table. Covers the trial/paid/demo matrix, ops reactivation and the
// companies-level rules from migration 20261017181933_company_plan_trial.sql.

const READ_ONLY = "VQ001";
const CHECK_VIOLATION = "23514";

const companyT = "dddddddd-0000-7000-8000-00000000000d"; // the company under test
const adminT = "eeeeeeee-0000-7000-8000-000000000001"; // admin of companyT (authenticated writes)
const workerT = "eeeeeeee-0000-7000-8000-000000000002"; // worker, membership role gets updated
const userDel = "eeeeeeee-0000-7000-8000-000000000003"; // worker, membership gets deleted
const newMember = "eeeeeeee-0000-7000-8000-000000000004"; // no membership yet, gets one inserted

const TRIGGERED_TABLES = [
  "companies",
  "crews",
  "locations",
  "memberships",
  "personas",
  "qualification_types",
  "qualifications",
  "task_requirements",
  "task_types",
];

type Fx = {
  loc: string;
  locDel: string;
  crew: string;
  crewDel: string;
  personaKeep: string;
  personaDel: string;
  qtype: string;
  qtypeUnused: string;
  qtypeReq: string;
  ttype: string;
  ttypeUnused: string;
  treqKeep: string;
  treqDel: string;
  qualKeep: string;
  qualDel: string;
  memberWorker: string;
  memberDel: string;
};

type Write = { label: string; sql: string; params: unknown[] };

async function id(db: TestDb, sql: string, params: unknown[] = []): Promise<string> {
  return (await db.one(sql, params)).id as string;
}

// Owner-side fixtures, all written while the company is still a live trial.
async function seedTrial(db: TestDb, plan: "trial" | "paid" | "demo" = "trial"): Promise<Fx> {
  await createUser(db, adminT, "t-admin@test.local");
  await createUser(db, workerT, "t-worker@test.local");
  await createUser(db, userDel, "t-del@test.local");
  await createUser(db, newMember, "t-new@test.local");
  await db.query(
    "insert into companies (id, name, plan, trial_ends_at) values ($1, 'Trial Co', $2, now() + interval '30 days')",
    [companyT, plan],
  );
  await db.query(
    "insert into memberships (company_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'worker'), ($1, $4, 'worker')",
    [companyT, adminT, workerT, userDel],
  );
  const memberWorker = await id(
    db,
    "select id from memberships where company_id = $1 and user_id = $2",
    [companyT, workerT],
  );
  const memberDel = await id(
    db,
    "select id from memberships where company_id = $1 and user_id = $2",
    [companyT, userDel],
  );

  const loc = await id(
    db,
    "insert into locations (company_id, name) values ($1, 'Loc keep') returning id",
    [companyT],
  );
  const locDel = await id(
    db,
    "insert into locations (company_id, name) values ($1, 'Loc del') returning id",
    [companyT],
  );
  const crew = await id(
    db,
    "insert into crews (company_id, name) values ($1, 'Crew keep') returning id",
    [companyT],
  );
  const crewDel = await id(
    db,
    "insert into crews (company_id, name) values ($1, 'Crew del') returning id",
    [companyT],
  );

  const personaKeep = await id(
    db,
    "insert into personas (company_id, full_name, dni) values ($1, 'Persona keep', 'T-1') returning id",
    [companyT],
  );
  const personaDel = await id(
    db,
    "insert into personas (company_id, full_name, dni) values ($1, 'Persona del', 'T-2') returning id",
    [companyT],
  );

  const qtype = await id(
    db,
    "insert into qualification_types (company_id, name) values ($1, 'Tipo keep') returning id",
    [companyT],
  );
  const qtypeUnused = await id(
    db,
    "insert into qualification_types (company_id, name) values ($1, 'Tipo sin uso') returning id",
    [companyT],
  );
  const qtypeReq = await id(
    db,
    "insert into qualification_types (company_id, name) values ($1, 'Tipo req') returning id",
    [companyT],
  );
  const ttype = await id(
    db,
    "insert into task_types (company_id, code, name) values ($1, 'tarea_keep', 'Tarea keep') returning id",
    [companyT],
  );
  const ttypeUnused = await id(
    db,
    "insert into task_types (company_id, code, name) values ($1, 'tarea_unused', 'Tarea sin uso') returning id",
    [companyT],
  );
  const ttypeDel = await id(
    db,
    "insert into task_types (company_id, code, name) values ($1, 'tarea_del', 'Tarea del') returning id",
    [companyT],
  );

  const treqKeep = await id(
    db,
    "insert into task_requirements (company_id, task_type_id, qualification_type_id) values ($1, $2, $3) returning id",
    [companyT, ttype, qtype],
  );
  const treqDel = await id(
    db,
    "insert into task_requirements (company_id, task_type_id, qualification_type_id) values ($1, $2, $3) returning id",
    [companyT, ttypeDel, qtype],
  );

  const qualKeep = await id(
    db,
    "insert into qualifications (company_id, persona_id, type_id, issued_on) values ($1, $2, $3, '2026-01-01') returning id",
    [companyT, personaKeep, qtype],
  );
  const qualDel = await id(
    db,
    "insert into qualifications (company_id, persona_id, type_id, issued_on) values ($1, $2, $3, '2026-01-02') returning id",
    [companyT, personaKeep, qtype],
  );

  return {
    loc,
    locDel,
    crew,
    crewDel,
    personaKeep,
    personaDel,
    qtype,
    qtypeUnused,
    qtypeReq,
    ttype,
    ttypeUnused,
    treqKeep,
    treqDel,
    qualKeep,
    qualDel,
    memberWorker,
    memberDel,
  };
}

// One insert, update and delete per business tenant table. Each targets a pre-seeded row, so the
// statement reaches the trigger (RLS USING matches) and FK rules cannot mask the result.
function writes(f: Fx): Write[] {
  return [
    {
      label: "locations insert",
      sql: "insert into locations (company_id, name) values ($1, 'Loc new')",
      params: [companyT],
    },
    {
      label: "locations update",
      sql: "update locations set name = 'Loc renamed' where id = $1",
      params: [f.loc],
    },
    { label: "locations delete", sql: "delete from locations where id = $1", params: [f.locDel] },
    {
      label: "crews insert",
      sql: "insert into crews (company_id, name) values ($1, 'Crew new')",
      params: [companyT],
    },
    {
      label: "crews update",
      sql: "update crews set name = 'Crew renamed' where id = $1",
      params: [f.crew],
    },
    { label: "crews delete", sql: "delete from crews where id = $1", params: [f.crewDel] },
    {
      label: "personas insert",
      sql: "insert into personas (company_id, full_name, dni) values ($1, 'Nueva', 'N-9')",
      params: [companyT],
    },
    {
      label: "personas update",
      sql: "update personas set full_name = 'Renamed' where id = $1",
      params: [f.personaKeep],
    },
    { label: "personas delete", sql: "delete from personas where id = $1", params: [f.personaDel] },
    {
      label: "qualification_types insert",
      sql: "insert into qualification_types (company_id, name) values ($1, 'Tipo nuevo')",
      params: [companyT],
    },
    {
      label: "qualification_types update",
      sql: "update qualification_types set name = 'Tipo renamed' where id = $1",
      params: [f.qtype],
    },
    {
      label: "qualification_types delete",
      sql: "delete from qualification_types where id = $1",
      params: [f.qtypeUnused],
    },
    {
      label: "task_types insert",
      sql: "insert into task_types (company_id, code, name) values ($1, 'tarea_new', 'Tarea nueva')",
      params: [companyT],
    },
    {
      label: "task_types update",
      sql: "update task_types set name = 'Tarea renamed' where id = $1",
      params: [f.ttype],
    },
    {
      label: "task_types delete",
      sql: "delete from task_types where id = $1",
      params: [f.ttypeUnused],
    },
    {
      label: "task_requirements insert",
      sql: "insert into task_requirements (company_id, task_type_id, qualification_type_id) values ($1, $2, $3)",
      params: [companyT, f.ttype, f.qtypeReq],
    },
    {
      label: "task_requirements update",
      sql: "update task_requirements set qualification_type_id = qualification_type_id where id = $1",
      params: [f.treqKeep],
    },
    {
      label: "task_requirements delete",
      sql: "delete from task_requirements where id = $1",
      params: [f.treqDel],
    },
    {
      label: "qualifications insert",
      sql: "insert into qualifications (company_id, persona_id, type_id, issued_on) values ($1, $2, $3, '2026-02-01')",
      params: [companyT, f.personaKeep, f.qtype],
    },
    {
      label: "qualifications update",
      sql: "update qualifications set issued_on = '2026-03-01' where id = $1",
      params: [f.qualKeep],
    },
    {
      label: "qualifications delete",
      sql: "delete from qualifications where id = $1",
      params: [f.qualDel],
    },
    {
      label: "memberships insert",
      sql: "insert into memberships (company_id, user_id, role) values ($1, $2, 'worker')",
      params: [companyT, newMember],
    },
    {
      label: "memberships update",
      sql: "update memberships set role = 'supervisor' where id = $1",
      params: [f.memberWorker],
    },
    {
      label: "memberships delete",
      sql: "delete from memberships where id = $1",
      params: [f.memberDel],
    },
  ];
}

// Simulates the trial running out: a plain UPDATE of trial_ends_at (plan/trial_ends_at-only updates
// are always allowed by the trigger).
async function expireTrial(db: TestDb) {
  await db.query(
    "update companies set plan = 'trial', trial_ends_at = now() - interval '1 day' where id = $1",
    [companyT],
  );
}

describe("trial read-only trigger", () => {
  it("is installed on every business tenant table", () =>
    withRollback(async (db) => {
      const rows = await db.query<{ relname: string }>(
        `select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where t.tgname = 'assert_company_writable' and not t.tgisinternal order by c.relname`,
      );
      expect(rows.map((r) => r.relname)).toEqual([...TRIGGERED_TABLES].sort());
    }));

  it("trial in the future: writes to every business table succeed (authenticated)", () =>
    withRollback(async (db) => {
      const f = await seedTrial(db);
      await db.as(adminT);
      for (const w of writes(f)) {
        expect(await db.errorCode(w.sql, w.params), `authenticated: ${w.label}`).toBeNull();
      }
    }));

  it("trial in the future: writes to every business table succeed (owner)", () =>
    withRollback(async (db) => {
      const f = await seedTrial(db);
      await db.as(null);
      for (const w of writes(f)) {
        expect(await db.errorCode(w.sql, w.params), `owner: ${w.label}`).toBeNull();
      }
    }));

  it("expired trial: every write fails with VQ001 (authenticated and owner), reads still work", () =>
    withRollback(async (db) => {
      const f = await seedTrial(db);
      await expireTrial(db);
      const all = writes(f);

      await db.as(adminT);
      for (const w of all) {
        expect(await db.errorCode(w.sql, w.params), `authenticated: ${w.label}`).toBe(READ_ONLY);
      }
      const visibleAsAdmin = await db.one(
        "select count(*)::int as n from personas where company_id = $1",
        [companyT],
      );
      expect(visibleAsAdmin.n).toBe(2);

      await db.as(null);
      for (const w of all) {
        expect(await db.errorCode(w.sql, w.params), `owner: ${w.label}`).toBe(READ_ONLY);
      }
      const ownerRead = await db.one(
        "select count(*)::int as n from locations where company_id = $1",
        [companyT],
      );
      expect(ownerRead.n).toBe(2);
    }));

  it("paid is never blocked, even with a past trial_ends_at", () =>
    withRollback(async (db) => {
      const f = await seedTrial(db, "trial");
      await db.query(
        "update companies set plan = 'paid', trial_ends_at = now() - interval '1 day' where id = $1",
        [companyT],
      );
      await db.as(adminT);
      for (const w of writes(f)) {
        expect(await db.errorCode(w.sql, w.params), `paid authenticated: ${w.label}`).toBeNull();
      }
    }));

  it("demo is never blocked, even with a past trial_ends_at", () =>
    withRollback(async (db) => {
      const f = await seedTrial(db, "trial");
      await db.query(
        "update companies set plan = 'demo', trial_ends_at = now() - interval '1 day' where id = $1",
        [companyT],
      );
      await db.as(adminT);
      for (const w of writes(f)) {
        expect(await db.errorCode(w.sql, w.params), `demo authenticated: ${w.label}`).toBeNull();
      }
    }));

  it("ops reactivation: setting plan = 'paid' on an expired trial succeeds", () =>
    withRollback(async (db) => {
      await seedTrial(db);
      await expireTrial(db);
      expect(
        await db.errorCode("update companies set plan = 'paid' where id = $1", [companyT]),
      ).toBeNull();
    }));

  it("ops reactivation: extending trial_ends_at on an expired trial succeeds", () =>
    withRollback(async (db) => {
      await seedTrial(db);
      await expireTrial(db);
      expect(
        await db.errorCode(
          "update companies set trial_ends_at = now() + interval '30 days' where id = $1",
          [companyT],
        ),
      ).toBeNull();
    }));

  it("an update of name on an expired trial fails with VQ001 (authenticated admin and owner)", () =>
    withRollback(async (db) => {
      await seedTrial(db);
      await expireTrial(db);

      await db.as(adminT);
      expect(
        await db.errorCode("update companies set name = 'Renamed' where id = $1", [companyT]),
      ).toBe(READ_ONLY);

      await db.as(null);
      expect(
        await db.errorCode("update companies set name = 'Renamed' where id = $1", [companyT]),
      ).toBe(READ_ONLY);
    }));

  it("an update of settings on an expired trial fails with VQ001", () =>
    withRollback(async (db) => {
      await seedTrial(db);
      await expireTrial(db);
      expect(
        await db.errorCode(
          `update companies set settings = '{"report_day": 3}'::jsonb where id = $1`,
          [companyT],
        ),
      ).toBe(READ_ONLY);
    }));

  it("setting trial_ends_at into the past via UPDATE works", () =>
    withRollback(async (db) => {
      await seedTrial(db);
      expect(
        await db.errorCode(
          "update companies set trial_ends_at = now() - interval '2 days' where id = $1",
          [companyT],
        ),
      ).toBeNull();
      expect(
        await db.errorCode("insert into locations (company_id, name) values ($1, 'x')", [companyT]),
      ).toBe(READ_ONLY);
    }));

  it("audit_log inserts are not blocked on an expired trial, global rows are unaffected", () =>
    withRollback(async (db) => {
      await seedTrial(db);
      await expireTrial(db);
      expect(
        await db.errorCode(
          "insert into audit_log (company_id, entity, entity_id, action) values ($1, 'x', gen_random_uuid(), 'insert')",
          [companyT],
        ),
      ).toBeNull();
      expect(
        await db.errorCode(
          "insert into qualification_types (company_id, name) values (null, 'Global expired')",
        ),
      ).toBeNull();
      expect(
        await db.errorCode(
          "insert into task_types (company_id, code, name) values (null, 'global_expired', 'Global')",
        ),
      ).toBeNull();
    }));

  it("deleting an expired-trial company is not blocked by the trigger", () =>
    withRollback(async (db) => {
      // audit_log.company_id is ON DELETE RESTRICT and the company insert is audited, so the delete
      // ends in a restrict violation (23001) after the trigger passed; it must never be VQ001.
      await seedTrial(db);
      await expireTrial(db);
      const code = await db.errorCode("delete from companies where id = $1", [companyT]);
      expect(code).not.toBe(READ_ONLY);
    }));

  it("plan outside (trial, paid, demo) is rejected", () =>
    withRollback(async (db) => {
      expect(
        await db.errorCode("insert into companies (name, plan) values ('Bad plan', 'pilot')"),
      ).toBe(CHECK_VIOLATION);
      await seedTrial(db, "paid");
      expect(
        await db.errorCode("update companies set plan = 'pilot' where id = $1", [companyT]),
      ).toBe(CHECK_VIOLATION);
    }));

  it("plan = 'trial' with null trial_ends_at is rejected", () =>
    withRollback(async (db) => {
      expect(
        await db.errorCode("insert into companies (name, plan) values ('No end', 'trial')"),
      ).toBe(CHECK_VIOLATION);
      await seedTrial(db, "paid");
      expect(
        await db.errorCode(
          "update companies set plan = 'trial', trial_ends_at = null where id = $1",
          [companyT],
        ),
      ).toBe(CHECK_VIOLATION);
    }));
});
