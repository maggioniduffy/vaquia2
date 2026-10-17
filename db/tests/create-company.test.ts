import { describe, expect, it } from "vitest";
import { createUser, ids, twoCompanies, withRollback, type TestDb } from "./helpers";

// public.create_company(name, cuit, full_name, dni): security definer, atomic, first company only.
// SQLSTATE contract: 42501 = not allowed for this caller, 22023 = invalid input, 23505 = duplicate CUIT.
const NOT_ALLOWED = "42501";
const INVALID_INPUT = "22023";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

const newUser = "ffffffff-0000-7000-8000-000000000001"; // zero memberships, not anonymous
const secondUser = "ffffffff-0000-7000-8000-000000000002"; // zero memberships, used for the "twice" test
const anonUser = "ffffffff-0000-7000-8000-000000000003"; // anonymous, zero memberships
const VALID_CUIT = "20123456786";
const OTHER_VALID_CUIT = "23123456785";

async function createFor(db: TestDb, userId: string) {
  await db.as(userId);
  return db.errorCode(
    "select public.create_company('Mi Empresa', '20-12345678-6', 'Ana Perez', '12.345.678')",
  );
}

describe("create_company: happy path", () => {
  it("creates a trial company, persona, admin membership and active company for a new user", () =>
    withRollback(async (db) => {
      await createUser(db, newUser, "new@test.local");
      await db.as(newUser);
      const created = await db.one<{ id: string }>(
        "select public.create_company('Mi Empresa', '20-12345678-6', 'Ana Perez', '12.345.678') as id",
      );
      const companyId = created.id;

      // Current company (RLS helper) is already resolvable as the caller.
      const current = await db.one<{ id: string }>("select public.current_company_id() as id");
      expect(current.id).toBe(companyId);

      await db.as(null);
      const company = await db.one<{
        name: string;
        cuit: string;
        plan: string;
        trial_is_30d: boolean;
        created_by: string;
      }>(
        `select name, cuit, plan, trial_ends_at = now() + interval '30 days' as trial_is_30d, created_by
         from companies where id = $1`,
        [companyId],
      );
      expect(company).toEqual({
        name: "Mi Empresa",
        cuit: VALID_CUIT, // dashes stripped before storing
        plan: "trial",
        trial_is_30d: true,
        created_by: newUser,
      });

      const persona = await db.one<{ id: string; full_name: string; dni: string }>(
        "select id, full_name, dni from personas where company_id = $1",
        [companyId],
      );
      expect(persona).toMatchObject({ full_name: "Ana Perez", dni: "12345678" });

      const membership = await db.one<{ role: string; persona_id: string; user_id: string }>(
        "select role::text as role, persona_id, user_id from memberships where company_id = $1",
        [companyId],
      );
      expect(membership).toEqual({ role: "admin", persona_id: persona.id, user_id: newUser });

      const settings = await db.one<{ active_company_id: string }>(
        "select active_company_id from user_settings where user_id = $1",
        [newUser],
      );
      expect(settings.active_company_id).toBe(companyId);
    }));

  it("accepts an unformatted CUIT and a 7-digit DNI", () =>
    withRollback(async (db) => {
      await createUser(db, newUser, "new@test.local");
      await db.as(newUser);
      await db.query("select public.create_company('Sin Guiones', $1, 'Juan Lopez', '1234567')", [
        OTHER_VALID_CUIT,
      ]);
      await db.as(null);
      const row = await db.one<{ cuit: string; dni: string }>(
        `select c.cuit, p.dni from companies c join personas p on p.company_id = c.id
         where c.cuit = $1`,
        [OTHER_VALID_CUIT],
      );
      expect(row).toEqual({ cuit: OTHER_VALID_CUIT, dni: "1234567" });
    }));

  it("refuses a second call by the same user (42501) and leaves one membership", () =>
    withRollback(async (db) => {
      await createUser(db, secondUser, "second@test.local");
      expect(await createFor(db, secondUser)).toBeNull();
      await db.as(secondUser);
      expect(
        await db.errorCode(
          "select public.create_company('Otra Empresa', $1, 'Ana Perez', '12345678')",
          [OTHER_VALID_CUIT],
        ),
      ).toBe(NOT_ALLOWED);

      await db.as(null);
      const n = await db.one<{ n: number }>(
        "select count(*)::int as n from memberships where user_id = $1",
        [secondUser],
      );
      expect(n.n).toBe(1);
    }));
});

describe("create_company: caller checks", () => {
  it("42501 when the caller already has a membership", () =>
    withRollback(async (db) => {
      await twoCompanies(db); // userA is hse in company A
      expect(await createFor(db, ids.userA)).toBe(NOT_ALLOWED);
    }));

  it("42501 when the caller is anonymous (users.is_anonymous)", () =>
    withRollback(async (db) => {
      await createUser(db, anonUser, "anon@test.local");
      await db.query("update users set is_anonymous = true where id = $1", [anonUser]);
      expect(await createFor(db, anonUser)).toBe(NOT_ALLOWED);
    }));

  it("42501 when there is no user at all", () =>
    withRollback(async (db) => {
      await db.as(null);
      expect(
        await db.errorCode(
          "select public.create_company('Mi Empresa', $1, 'Ana Perez', '12345678')",
          [VALID_CUIT],
        ),
      ).toBe(NOT_ALLOWED);
    }));
});

describe("create_company: input validation (22023) and atomicity", () => {
  const invalid: { label: string; args: [unknown, unknown, unknown, unknown] }[] = [
    { label: "empty CUIT", args: ["Mi Empresa", "", "Ana Perez", "12345678"] },
    { label: "null CUIT", args: ["Mi Empresa", null, "Ana Perez", "12345678"] },
    { label: "non-numeric CUIT", args: ["Mi Empresa", "abc", "Ana Perez", "12345678"] },
    { label: "10-digit CUIT", args: ["Mi Empresa", "2012345678", "Ana Perez", "12345678"] },
    { label: "bad check digit", args: ["Mi Empresa", "20123456787", "Ana Perez", "12345678"] },
    {
      label: "prefix outside AFIP list",
      args: ["Mi Empresa", "21123456782", "Ana Perez", "12345678"],
    },
    { label: "empty name", args: ["   ", VALID_CUIT, "Ana Perez", "12345678"] },
    { label: "empty full_name", args: ["Mi Empresa", VALID_CUIT, "  ", "12345678"] },
    { label: "DNI with letters", args: ["Mi Empresa", VALID_CUIT, "Ana Perez", "abcdefgh"] },
    { label: "DNI too short", args: ["Mi Empresa", VALID_CUIT, "Ana Perez", "123"] },
    { label: "DNI too long", args: ["Mi Empresa", VALID_CUIT, "Ana Perez", "123456789"] },
    { label: "empty DNI", args: ["Mi Empresa", VALID_CUIT, "Ana Perez", ""] },
  ];

  it.each(invalid)("22023 for $label, and nothing is created", ({ args }) =>
    withRollback(async (db) => {
      await createUser(db, newUser, "new@test.local");
      await db.as(newUser);
      expect(await db.errorCode("select public.create_company($1, $2, $3, $4)", args)).toBe(
        INVALID_INPUT,
      );

      await db.as(null);
      const leftovers = await db.one<{
        companies: number;
        personas: number;
        memberships: number;
        settings: number;
      }>(
        `select
           (select count(*) from companies where created_by = $1)::int as companies,
           (select count(*) from personas where created_by = $1)::int as personas,
           (select count(*) from memberships where user_id = $1)::int as memberships,
           (select count(*) from user_settings where user_id = $1)::int as settings`,
        [newUser],
      );
      expect(leftovers).toEqual({ companies: 0, personas: 0, memberships: 0, settings: 0 });
    }),
  );

  it("23505 on a duplicate CUIT, and nothing partially created", () =>
    withRollback(async (db) => {
      await db.query("insert into companies (name, cuit, plan) values ('Ya existe', $1, 'paid')", [
        VALID_CUIT,
      ]);
      await createUser(db, newUser, "new@test.local");

      await db.as(newUser);
      expect(
        await db.errorCode(
          "select public.create_company('Mi Empresa', '20-12345678-6', 'Ana Perez', '12345678')",
        ),
      ).toBe(UNIQUE_VIOLATION);

      await db.as(null);
      const leftovers = await db.one<{
        companies: number;
        personas: number;
        memberships: number;
        settings: number;
      }>(
        `select
           (select count(*) from companies where name = 'Mi Empresa')::int as companies,
           (select count(*) from personas where created_by = $1)::int as personas,
           (select count(*) from memberships where user_id = $1)::int as memberships,
           (select count(*) from user_settings where user_id = $1)::int as settings`,
        [newUser],
      );
      expect(leftovers).toEqual({ companies: 0, personas: 0, memberships: 0, settings: 0 });
    }));
});

describe("companies.cuit check constraint", () => {
  it("rejects an invalid CUIT on direct insert, accepts a valid one and null", () =>
    withRollback(async (db) => {
      expect(
        await db.errorCode("insert into companies (name, cuit) values ('Mala', '20123456787')"),
      ).toBe(CHECK_VIOLATION);
      expect(
        await db.errorCode("insert into companies (name, cuit) values ('Corta', '2012345678')"),
      ).toBe(CHECK_VIOLATION);
      expect(
        await db.errorCode(
          "insert into companies (name, cuit, plan, trial_ends_at) values ('Buena', $1, 'paid', null)",
          [VALID_CUIT],
        ),
      ).toBeNull();
      expect(
        await db.errorCode("insert into companies (name, plan) values ('Sin CUIT', 'paid')"),
      ).toBeNull();
    }));
});
