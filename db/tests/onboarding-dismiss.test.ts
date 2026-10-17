import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/i18n/es-AR";
import { dismissOnboarding } from "@/lib/onboarding/dismiss-action";
import type { Session } from "@/lib/session";
import { getSession } from "@/lib/session";
import { createUser, type TestDb } from "./helpers";
import { withTxForUser } from "./rollback-user";

// The action runs its real SQL through the rollback-aware withUser; session and cache are stubbed.
vi.mock("@/lib/db", async () => {
  const m = await import("./rollback-user");
  return { withUser: m.withUserInRollback };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const admin = "d1d1d1d1-0000-7000-8000-000000000001";
const worker = "d1d1d1d1-0000-7000-8000-000000000002";
const CUIT = "23123456785";

async function createCompanyWithAdmin(db: TestDb): Promise<string> {
  await createUser(db, admin, "dismiss-admin@test.local");
  await createUser(db, worker, "dismiss-worker@test.local");
  await db.as(admin);
  const created = await db.one<{ id: string }>(
    "select public.create_company('Empresa Dismiss', $1, 'Ana Perez', '12345678') as id",
    [CUIT],
  );
  await db.as(null);
  await db.query("insert into memberships (company_id, user_id, role) values ($1, $2, 'worker')", [
    created.id,
    worker,
  ]);
  return created.id;
}

// Simulates the trial running out (plan/trial_ends_at-only updates are always allowed).
async function expireTrial(db: TestDb, companyId: string) {
  await db.as(null);
  await db.query(
    "update companies set plan = 'trial', trial_ends_at = now() - interval '1 day' where id = $1",
    [companyId],
  );
}

async function dismissedFlag(db: TestDb, companyId: string): Promise<string | null> {
  await db.as(null);
  const row = await db.one<{ flag: string | null }>(
    "select settings->>'onboarding_dismissed' as flag from companies where id = $1",
    [companyId],
  );
  return row.flag;
}

function sessionFor(userId: string, role: "admin" | "worker" | null) {
  const active = role ? { companyId: "", name: "", role, isActive: true } : null;
  vi.mocked(getSession).mockResolvedValue({
    userId,
    email: "x@test.local",
    isGuest: false,
    companies: active ? [active] : [],
    active,
  } as Session);
}

beforeEach(() => {
  vi.mocked(getSession).mockReset();
});

describe("dismissOnboarding", () => {
  it("an admin hides the checklist: settings.onboarding_dismissed becomes true", () =>
    withTxForUser(async (db) => {
      const companyId = await createCompanyWithAdmin(db);
      sessionFor(admin, "admin");

      expect(await dismissOnboarding()).toEqual({});
      expect(await dismissedFlag(db, companyId)).toBe("true");
    }));

  it("a non-admin member cannot hide it (forbidden, settings untouched)", () =>
    withTxForUser(async (db) => {
      const companyId = await createCompanyWithAdmin(db);
      sessionFor(worker, "worker");

      expect(await dismissOnboarding()).toEqual({
        error: t.onboardingChecklist.errors.forbidden,
      });
      expect(await dismissedFlag(db, companyId)).toBeNull();
    }));

  it("a user with no active company is forbidden", () =>
    withTxForUser(async (db) => {
      await createCompanyWithAdmin(db);
      sessionFor(admin, null);

      expect(await dismissOnboarding()).toEqual({
        error: t.onboardingChecklist.errors.forbidden,
      });
    }));

  it("on an expired trial the write fails with VQ001 and the read-only message is returned", () =>
    withTxForUser(async (db) => {
      const companyId = await createCompanyWithAdmin(db);
      await expireTrial(db, companyId);
      sessionFor(admin, "admin");

      expect(await dismissOnboarding()).toEqual({ error: t.trial.readOnly });
      expect(await dismissedFlag(db, companyId)).toBeNull();
    }));

  it("on a paid company whose old trial date has passed, the dismiss still works", () =>
    withTxForUser(async (db) => {
      const companyId = await createCompanyWithAdmin(db);
      await db.query(
        "update companies set plan = 'paid', trial_ends_at = now() - interval '1 day' where id = $1",
        [companyId],
      );
      sessionFor(admin, "admin");

      expect(await dismissOnboarding()).toEqual({});
      expect(await dismissedFlag(db, companyId)).toBe("true");
    }));
});
