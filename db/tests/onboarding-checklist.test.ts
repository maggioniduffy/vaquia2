import { describe, expect, it, vi } from "vitest";
import { getChecklist } from "@/lib/onboarding/checklist";
import { createUser, type TestDb } from "./helpers";
import { withTxForUser } from "./rollback-user";

// The app's withUser runs through the rollback helper so the checklist queries see the fixtures
// and go through RLS as the `authenticated` role, exactly like production.
vi.mock("@/lib/db", async () => {
  const m = await import("./rollback-user");
  return { withUser: m.withUserInRollback };
});

// Valid AFIP CUITs (check digit verified by app.cuit_valid inside create_company).
const CUIT_FRESH = "23123456785";
const CUIT_FULL = "27123456780";

const fresh = "f1f1f1f1-0000-7000-8000-000000000001"; // admin of a fresh company
const full = "f1f1f1f1-0000-7000-8000-000000000002"; // admin of a fully set-up company
const teammate = "f1f1f1f1-0000-7000-8000-000000000003"; // worker added to `full`
const stranger = "f1f1f1f1-0000-7000-8000-000000000004"; // no company at all

const ALL_OPEN = { team: false, people: false, crews: false, locations: false };

// Fresh company: create_company as the caller (admin + own persona, nothing else).
async function createFreshCompany(db: TestDb, userId: string, name: string, cuit: string) {
  await db.as(userId);
  await db.query("select public.create_company($1, $2, 'Admin Persona', '12345678')", [name, cuit]);
  await db.as(null);
}

async function populate(db: TestDb, companyId: string) {
  await db.as(null);
  await db.query("insert into memberships (company_id, user_id, role) values ($1, $2, 'worker')", [
    companyId,
    teammate,
  ]);
  await db.query("insert into personas (company_id, full_name, dni) values ($1, 'Second', 'P-2')", [
    companyId,
  ]);
  await db.query("insert into crews (company_id, name) values ($1, 'Cuadrilla 1')", [companyId]);
  await db.query("insert into locations (company_id, name) values ($1, 'Locación 1')", [companyId]);
}

async function companyIdOf(db: TestDb, userId: string): Promise<string> {
  await db.as(userId);
  const row = await db.one<{ id: string }>("select public.current_company_id() as id");
  await db.as(null);
  return row.id;
}

describe("getChecklist: counts for the active company", () => {
  it("fresh company: nothing is done yet (one admin, one persona, no crews or places)", () =>
    withTxForUser(async (db) => {
      await createUser(db, fresh, "fresh@test.local");
      await createFreshCompany(db, fresh, "Empresa Fresca", CUIT_FRESH);

      expect(await getChecklist(fresh)).toEqual({ items: ALL_OPEN, doneCount: 0 });
    }));

  it("company with data ticks each item as the data is added; complete company returns null", () =>
    withTxForUser(async (db) => {
      await createUser(db, full, "full@test.local");
      await createUser(db, teammate, "mate@test.local");
      await createFreshCompany(db, full, "Empresa Completa", CUIT_FULL);
      const companyId = await companyIdOf(db, full);

      await db.as(null);
      await db.query("insert into crews (company_id, name) values ($1, 'Cuadrilla 0')", [
        companyId,
      ]);
      expect(await getChecklist(full)).toEqual({
        items: { ...ALL_OPEN, crews: true },
        doneCount: 1,
      });

      await populate(db, companyId);
      expect(await getChecklist(full)).toBeNull();
    }));

  it("a company with some data shows the remaining items", () =>
    withTxForUser(async (db) => {
      await createUser(db, fresh, "fresh@test.local");
      await createFreshCompany(db, fresh, "Empresa Parcial", CUIT_FRESH);
      const companyId = await companyIdOf(db, fresh);

      await db.as(null);
      await db.query("insert into locations (company_id, name) values ($1, 'Locación A')", [
        companyId,
      ]);
      expect(await getChecklist(fresh)).toEqual({
        items: { ...ALL_OPEN, locations: true },
        doneCount: 1,
      });
    }));

  it("a dismissed checklist (settings.onboarding_dismissed) returns null", () =>
    withTxForUser(async (db) => {
      await createUser(db, fresh, "fresh@test.local");
      await createFreshCompany(db, fresh, "Empresa Oculta", CUIT_FRESH);
      const companyId = await companyIdOf(db, fresh);
      await db.as(null);
      await db.query(
        `update companies set settings = '{"onboarding_dismissed": true}'::jsonb where id = $1`,
        [companyId],
      );

      expect(await getChecklist(fresh)).toBeNull();
    }));

  it("a user with no company gets null, not a crash", () =>
    withTxForUser(async (db) => {
      await createUser(db, stranger, "stranger@test.local");
      expect(await getChecklist(stranger)).toBeNull();
    }));
});

describe("getChecklist: RLS scoping", () => {
  it("another company's rows never count toward this company's checklist", () =>
    withTxForUser(async (db) => {
      await createUser(db, fresh, "fresh@test.local");
      await createUser(db, full, "full@test.local");
      await createUser(db, teammate, "mate@test.local");
      await createFreshCompany(db, fresh, "Empresa Fresca", CUIT_FRESH);
      await createFreshCompany(db, full, "Empresa Completa", CUIT_FULL);
      await populate(db, await companyIdOf(db, full));

      // The fully populated company exists in the same tables; the fresh admin still sees zero.
      expect(await getChecklist(fresh)).toEqual({ items: ALL_OPEN, doneCount: 0 });

      // Raw counts as the fresh admin: RLS hides the other tenant's rows entirely.
      await db.as(fresh);
      const visible = await db.one<{
        memberships: number;
        personas: number;
        crews: number;
        locations: number;
      }>(
        `select (select count(*) from memberships)::int as memberships,
                (select count(*) from personas)::int as personas,
                (select count(*) from crews)::int as crews,
                (select count(*) from locations)::int as locations`,
      );
      expect(visible).toEqual({ memberships: 1, personas: 1, crews: 0, locations: 0 });
    }));

  it("the populated company's admin sees their own counts, not the fresh company's", () =>
    withTxForUser(async (db) => {
      await createUser(db, fresh, "fresh@test.local");
      await createUser(db, full, "full@test.local");
      await createUser(db, teammate, "mate@test.local");
      await createFreshCompany(db, fresh, "Empresa Fresca", CUIT_FRESH);
      await createFreshCompany(db, full, "Empresa Completa", CUIT_FULL);
      await populate(db, await companyIdOf(db, full));

      // Only the crew/location/second persona/teammate of `full` are visible to its admin.
      expect(await getChecklist(full)).toBeNull();
    }));
});
