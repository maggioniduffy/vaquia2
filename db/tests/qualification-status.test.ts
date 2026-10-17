import { describe, expect, it } from "vitest";
import { ids, twoCompanies, withRollback, type TestDb } from "./helpers";

// Status views (security_invoker: read as the tenant). Dates are relative to today_art(), the
// Argentina calendar date that the views use, so the assertions do not depend on the wall clock.
const QT_INDUCCION = "90000000-0000-7000-8000-000000000201"; // 12 months
const QT_ALTURA = "90000000-0000-7000-8000-000000000202";
const QT_CONFINADO = "90000000-0000-7000-8000-000000000203";
const QT_MANEJO = "90000000-0000-7000-8000-000000000204";
const TT_ALTURA = "90000000-0000-7000-8000-000000000302"; // requires QT_ALTURA (global)

async function persona(db: TestDb, dni: string): Promise<string> {
  const row = await db.one(
    "insert into personas (company_id, full_name, dni) values ($1, $2, $2) returning id",
    [ids.companyA, dni],
  );
  return row.id as string;
}

// issued/expires as SQL day offsets from today_art(); expires null = no expiry.
async function qualification(
  db: TestDb,
  personaId: string,
  typeId: string,
  issuedOffset: number,
  expiresOffset: number | null,
  createdDaysAgo?: number,
): Promise<string> {
  const row = await db.one(
    `insert into qualifications (company_id, persona_id, type_id, issued_on, expires_on, created_at)
     values ($1, $2, $3, public.today_art() + $4::int, public.today_art() + $5::int,
       case when $6::int is null then now() else now() - ($6::int * interval '1 day') end)
     returning id`,
    [ids.companyA, personaId, typeId, issuedOffset, expiresOffset, createdDaysAgo ?? null],
  );
  return row.id as string;
}

async function nullableQualification(
  db: TestDb,
  personaId: string,
  typeId: string,
): Promise<string> {
  const row = await db.one(
    `insert into qualifications (company_id, persona_id, type_id, issued_on, expires_on)
     values ($1, $2, $3, public.today_art() - 10, null) returning id`,
    [ids.companyA, personaId, typeId],
  );
  return row.id as string;
}

type Current = { type_id: string; status: string; days_left: number | null };

async function currentStatuses(db: TestDb, personaId: string): Promise<Record<string, Current>> {
  const rows = await db.query<Current>(
    "select type_id, status, days_left from current_qualifications where persona_id = $1",
    [personaId],
  );
  return Object.fromEntries(rows.map((r) => [r.type_id, r]));
}

describe("current_qualifications status edge cases", () => {
  it("expires today is expired; yesterday expired; 1 day left is expiring", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const p = await persona(db, "S-1");
      await qualification(db, p, QT_INDUCCION, -400, 0);
      await qualification(db, p, QT_ALTURA, -400, -1);
      await qualification(db, p, QT_CONFINADO, -10, 1);
      await db.as(ids.userA);
      const st = await currentStatuses(db, p);
      expect(st[QT_INDUCCION]).toMatchObject({ status: "expired", days_left: 0 });
      expect(st[QT_ALTURA]).toMatchObject({ status: "expired", days_left: -1 });
      expect(st[QT_CONFINADO]).toMatchObject({ status: "expiring", days_left: 1 });
    }));

  it("expires in exactly 30 days is expiring; 31 days is valid", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const p = await persona(db, "S-2");
      await qualification(db, p, QT_INDUCCION, -10, 30);
      await qualification(db, p, QT_ALTURA, -10, 31);
      await db.as(ids.userA);
      const st = await currentStatuses(db, p);
      expect(st[QT_INDUCCION]).toMatchObject({ status: "expiring", days_left: 30 });
      expect(st[QT_ALTURA]).toMatchObject({ status: "valid", days_left: 31 });
    }));

  it("no expiry (expires_on null) is valid with null days_left", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const p = await persona(db, "S-3");
      await nullableQualification(db, p, QT_INDUCCION);
      await db.as(ids.userA);
      expect((await currentStatuses(db, p))[QT_INDUCCION]).toMatchObject({
        status: "valid",
        days_left: null,
      });
    }));

  it("renewal: the latest issued_on is current and the older row is kept", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const p = await persona(db, "S-4");
      const old = await qualification(db, p, QT_INDUCCION, -400, -35); // expired
      const renewed = await qualification(db, p, QT_INDUCCION, -30, 335); // valid
      await db.as(ids.userA);
      const current = await db.one(
        "select qualification_id, status from current_qualifications where persona_id = $1 and type_id = $2",
        [p, QT_INDUCCION],
      );
      expect(current).toEqual({ qualification_id: renewed, status: "valid" });
      const history = await db.query<{ id: string }>(
        "select id from qualifications where persona_id = $1 and type_id = $2 order by issued_on",
        [p, QT_INDUCCION],
      );
      expect(history.map((h) => h.id)).toEqual([old, renewed]);
    }));

  it("renewal tie on issued_on: the latest created_at wins", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const p = await persona(db, "S-5");
      // Same issued_on; the row inserted later (now) must win over the one back-dated a day.
      const earlier = await qualification(db, p, QT_MANEJO, -10, -1, 1);
      const later = await qualification(db, p, QT_MANEJO, -10, 700);
      await db.as(ids.userA);
      const current = await db.one(
        "select qualification_id from current_qualifications where persona_id = $1 and type_id = $2",
        [p, QT_MANEJO],
      );
      expect(current.qualification_id).toBe(later);
      expect((await db.one("select count(*)::int as n from qualifications where id = any($1::uuid[])", [[earlier, later]])).n).toBe(2);
    }));
});

describe("qualification_status (persona x required type)", () => {
  it("a required type with no qualification is missing; with a valid one it is valid", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const none = await persona(db, "S-6");
      const ok = await persona(db, "S-7");
      await qualification(db, ok, QT_ALTURA, -10, 300);
      await db.as(ids.userA);
      const rows = await db.query<{ persona_id: string; qualification_type_id: string; status: string; qualification_id: string | null }>(
        "select persona_id, qualification_type_id, status, qualification_id from qualification_status where task_type_id = $1 and persona_id = any($2::uuid[])",
        [TT_ALTURA, [none, ok]],
      );
      const byPersona = Object.fromEntries(rows.map((r) => [r.persona_id, r]));
      expect(byPersona[none]).toMatchObject({ qualification_type_id: QT_ALTURA, status: "missing", qualification_id: null });
      expect(byPersona[ok]).toMatchObject({ qualification_type_id: QT_ALTURA, status: "valid" });
    }));
});

describe("persona_task_fitness for a task type requiring two qualification types", () => {
  // Company task type that needs two types (company rows add to the global defaults).
  async function twoRequirementTask(db: TestDb): Promise<string> {
    const tt = await db.one(
      "insert into task_types (company_id, code, name) values ($1, 'dos_quals', 'Dos capacitaciones') returning id",
      [ids.companyA],
    );
    await db.query(
      `insert into task_requirements (company_id, task_type_id, qualification_type_id) values
         ($1, $2, $3), ($1, $2, $4)`,
      [ids.companyA, tt.id, QT_ALTURA, QT_CONFINADO],
    );
    return tt.id as string;
  }

  it("both valid -> apto", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const tt = await twoRequirementTask(db);
      const p = await persona(db, "F-1");
      await qualification(db, p, QT_ALTURA, -10, 300);
      await qualification(db, p, QT_CONFINADO, -10, 300);
      await db.as(ids.userA);
      expect(
        await db.one(
          "select apto, required_count, missing_count, expired_count from persona_task_fitness where persona_id = $1 and task_type_id = $2",
          [p, tt],
        ),
      ).toEqual({ apto: true, required_count: 2, missing_count: 0, expired_count: 0 });
    }));

  it("one valid and one expired -> not apto, and the expired type is identified", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const tt = await twoRequirementTask(db);
      const p = await persona(db, "F-2");
      await qualification(db, p, QT_ALTURA, -10, 300);
      await qualification(db, p, QT_CONFINADO, -400, -1);
      await db.as(ids.userA);
      expect(
        await db.one(
          "select apto, expired_count, missing_count from persona_task_fitness where persona_id = $1 and task_type_id = $2",
          [p, tt],
        ),
      ).toEqual({ apto: false, expired_count: 1, missing_count: 0 });
      const expired = await db.query<{ qualification_type_id: string }>(
        "select qualification_type_id from qualification_status where persona_id = $1 and task_type_id = $2 and status = 'expired'",
        [p, tt],
      );
      expect(expired).toEqual([{ qualification_type_id: QT_CONFINADO }]);
    }));

  it("one required type missing -> not apto", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const tt = await twoRequirementTask(db);
      const p = await persona(db, "F-3");
      await qualification(db, p, QT_ALTURA, -10, 300);
      await db.as(ids.userA);
      expect(
        await db.one(
          "select apto, missing_count from persona_task_fitness where persona_id = $1 and task_type_id = $2",
          [p, tt],
        ),
      ).toEqual({ apto: false, missing_count: 1 });
    }));

  it("a renewal that replaces an expired row makes the persona apto again", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      const tt = await twoRequirementTask(db);
      const p = await persona(db, "F-4");
      await qualification(db, p, QT_ALTURA, -10, 300);
      await qualification(db, p, QT_CONFINADO, -400, -1);
      await qualification(db, p, QT_CONFINADO, -5, 360); // renewal
      await db.as(ids.userA);
      expect(
        await db.one("select apto from persona_task_fitness where persona_id = $1 and task_type_id = $2", [p, tt]),
      ).toEqual({ apto: true });
    }));
});
