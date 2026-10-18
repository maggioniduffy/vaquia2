import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { commitImport, previewImport } from "@/lib/people/import-db";
import { ids, twoCompanies, withRollback, type TestDb } from "./helpers";

// CSV import end to end against the DB, as the hse user of company A (userA). Fixtures are in
// db/tests/fixtures: 200 personas rows (7 bad) and 200 capacitaciones rows (8 bad + 1 duplicate).

const fixture = (name: string) =>
  readFileSync(path.resolve(process.cwd(), "db/tests/fixtures", name), "utf8");

const PERSONAS = fixture("personas-200.csv");
const CAPACITACIONES = fixture("capacitaciones-200.csv");

const QT_ALTURA = "90000000-0000-7000-8000-000000000202";
const PERSONA_B_DNI = "20000411"; // same DNI as line 5 of the personas fixture, but in company B

// import.ts only uses `db.query(...).rows`, which is the shape of a pg client.
function asDb(db: TestDb): Db {
  return {
    query: async (sql: string, params?: unknown[]) => ({ rows: await db.query(sql, params) }),
  } as unknown as Db;
}

async function count(db: TestDb, sql: string, params: unknown[] = []): Promise<number> {
  return (await db.one(`select count(*)::int as n from (${sql}) as q`, params)).n as number;
}

// Company A: hse user, two crews referenced by the personas file. Company B: one persona whose
// DNI also appears in the file; the import must never touch it.
async function setup(db: TestDb) {
  await twoCompanies(db);
  await db.query(
    "insert into crews (company_id, name) values ($1, 'Cuadrilla Norte'), ($1, 'Cuadrilla Sur')",
    [ids.companyA],
  );
  await db.query(
    "insert into personas (company_id, full_name, dni) values ($1, 'Persona de B', $2)",
    [ids.companyB, PERSONA_B_DNI],
  );
  await db.as(ids.userA);
}

describe("personas import (200 rows, 7 bad)", () => {
  it("preview reports each bad row by line and writes nothing", () =>
    withRollback(async (db) => {
      await setup(db);
      const preview = await previewImport(asDb(db), "personas", PERSONAS);

      expect(preview.headerErrors).toEqual([]);
      expect(preview.counts).toMatchObject({ valid: 193, errors: 7, created: 193, updated: 0 });
      const invalid = preview.rows.filter((r) => r.action === "invalid");
      expect(invalid.map((r) => r.line)).toEqual([10, 20, 30, 40, 50, 60, 70]);
      for (const row of invalid) {
        expect(row.errors.length).toBeGreaterThan(0);
        expect(row.errors[0]).toMatch(new RegExp(`^Fila ${row.line}: `));
      }
      expect(await count(db, "select id from personas")).toBe(0);
    }));

  it("commit inserts only the valid rows and never touches company B", () =>
    withRollback(async (db) => {
      await setup(db);
      const committed = await commitImport(asDb(db), "personas", PERSONAS);
      expect(committed.counts).toMatchObject({ created: 193, errors: 7 });

      expect(await count(db, "select id from personas")).toBe(193);
      expect(await count(db, "select id from personas where dni in ('1234', '12.ABC.345')")).toBe(
        0,
      );
      // Dotted DNI "20.000.274" (line 4) is stored normalized.
      expect(await count(db, "select id from personas where dni = '20000274'")).toBe(1);

      await db.as(null);
      expect(
        (
          await db.one("select full_name from personas where company_id = $1 and dni = $2", [
            ids.companyB,
            PERSONA_B_DNI,
          ])
        ).full_name,
      ).toBe("Persona de B");
      expect(await count(db, "select id from personas where company_id = $1", [ids.companyB])).toBe(
        1,
      );
    }));

  it("re-running the same file updates the existing rows and creates no duplicates", () =>
    withRollback(async (db) => {
      await setup(db);
      await commitImport(asDb(db), "personas", PERSONAS);

      const again = await previewImport(asDb(db), "personas", PERSONAS);
      expect(again.counts).toMatchObject({ created: 0, updated: 193, errors: 7 });

      await commitImport(asDb(db), "personas", PERSONAS);
      expect(await count(db, "select id from personas")).toBe(193);
      expect(await count(db, "select dni from personas group by dni having count(*) > 1")).toBe(0);
    }));
});

describe("capacitaciones import (200 rows, 8 bad, 1 duplicate)", () => {
  async function setupWithPersonas(db: TestDb) {
    await setup(db);
    await commitImport(asDb(db), "personas", PERSONAS);
  }

  it("preview reports bad rows by line and the in-file duplicate as skipped", () =>
    withRollback(async (db) => {
      await setupWithPersonas(db);
      const preview = await previewImport(asDb(db), "capacitaciones", CAPACITACIONES);

      expect(preview.headerErrors).toEqual([]);
      expect(preview.counts).toMatchObject({ inserted: 191, valid: 191, errors: 8, skipped: 1 });
      expect(preview.rows.filter((r) => r.action === "invalid").map((r) => r.line)).toEqual([
        5, 12, 18, 25, 26, 33, 40, 45,
      ]);
      const skipped = preview.rows.filter((r) => r.action === "skip");
      expect(skipped.map((r) => r.line)).toEqual([50]);
      expect(skipped[0]?.note).toBeTruthy();
      expect(await count(db, "select id from qualifications")).toBe(0);
    }));

  it("commit inserts only valid rows and fills the default validity", () =>
    withRollback(async (db) => {
      await setupWithPersonas(db);
      await commitImport(asDb(db), "capacitaciones", CAPACITACIONES);

      expect(await count(db, "select id from qualifications")).toBe(191);
      // Line 40 (expires before issued) and the impossible date row must not land.
      expect(
        await count(
          db,
          "select id from qualifications where issued_on = '2025-06-01' and expires_on = '2025-05-01'",
        ),
      ).toBe(0);
      // Line 2: altura, issued 2025-01-01, no vence -> 12 months later.
      const line2 = await db.one(
        `select q.expires_on::text as expires from qualifications q
         join personas p on p.id = q.persona_id
         where p.dni = '20000000' and q.type_id = $1 and q.issued_on = '2025-01-01'`,
        [QT_ALTURA],
      );
      expect(line2.expires).toBe("2026-01-01");
    }));

  it("re-running skips every row already imported and writes nothing", () =>
    withRollback(async (db) => {
      await setupWithPersonas(db);
      await commitImport(asDb(db), "capacitaciones", CAPACITACIONES);

      const again = await previewImport(asDb(db), "capacitaciones", CAPACITACIONES);
      expect(again.counts).toMatchObject({ inserted: 0, valid: 0, errors: 8, skipped: 192 });

      await commitImport(asDb(db), "capacitaciones", CAPACITACIONES);
      expect(await count(db, "select id from qualifications")).toBe(191);
    }));

  it("company B cannot see the imported rows", () =>
    withRollback(async (db) => {
      await setupWithPersonas(db);
      await commitImport(asDb(db), "capacitaciones", CAPACITACIONES);

      await db.as(ids.userB);
      expect(await count(db, "select id from qualifications")).toBe(0);
      expect(await count(db, "select id from personas")).toBe(1); // only its own "Persona de B"
    }));
});
