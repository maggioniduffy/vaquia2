import { describe, expect, it } from "vitest";
import { ids, twoCompanies, withRollback } from "./helpers";

const INSUFFICIENT_PRIVILEGE = "42501";

describe("tenancy RLS", () => {
  it("a company A user only sees company A", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userA);

      expect((await db.one("select public.current_company_id() as id")).id).toBe(ids.companyA);
      expect(await db.query("select id from companies")).toEqual([{ id: ids.companyA }]);
      expect(await db.query("select 1 from companies where id = $1", [ids.companyB])).toEqual([]);
      expect(
        await db.query("select 1 from memberships where company_id = $1", [ids.companyB]),
      ).toEqual([]);
      expect((await db.one("select count(*)::int as n from memberships")).n).toBe(3);
    }));

  it("a company A user cannot write company B rows", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userA);

      expect(
        await db.errorCode(
          "insert into memberships (company_id, user_id, role) values ($1, $2, 'admin')",
          [ids.companyB, ids.userA],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      await db.query("update companies set name = 'hacked' where id = $1", [ids.companyB]);
      expect(await db.errorCode("select public.set_active_company($1)", [ids.companyB])).toBe(
        INSUFFICIENT_PRIVILEGE,
      );

      await db.as(null);
      expect((await db.one("select name from companies where id = $1", [ids.companyB])).name).toBe(
        "Company B",
      );
    }));

  it("only admins write memberships, and only in their company", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userA); // hse, not admin
      expect(
        await db.errorCode(
          "insert into memberships (company_id, user_id, role) values ($1, $2, 'worker')",
          [ids.companyA, ids.userB],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await db.one("select public.has_role('{hse}') as ok")).ok).toBe(true);
      expect((await db.one("select public.has_role('{admin}') as ok")).ok).toBe(false);

      await db.as(ids.userB); // admin of B
      await db.query("update memberships set role = 'admin' where company_id = $1", [ids.companyA]);
      await db.as(null);
      expect(
        (
          await db.one(
            "select count(*)::int as n from memberships where company_id = $1 and role = 'admin'",
            [ids.companyA],
          )
        ).n,
      ).toBe(0);
    }));

  it("admins cannot insert memberships or change user_id, but can still change the role", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userB); // admin of B
      expect(
        await db.errorCode(
          "insert into memberships (company_id, user_id, role) values ($1, $2, 'worker')",
          [ids.companyB, ids.userA],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await db.errorCode("update memberships set user_id = $1 where company_id = $2", [
          ids.userA,
          ids.companyB,
        ]),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await db.errorCode("update memberships set role = 'hse' where company_id = $1", [
          ids.companyB,
        ]),
      ).toBeNull();
      await db.as(null);
      expect(
        (
          await db.one("select role from memberships where company_id = $1 and user_id = $2", [
            ids.companyB,
            ids.userB,
          ])
        ).role,
      ).toBe("hse");
    }));

  it("a member of two companies can switch, and then sees only the active one", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.both);

      expect((await db.one("select count(*)::int as n from public.my_companies()")).n).toBe(2);
      expect((await db.one("select public.current_company_id() as id")).id).toBe(ids.companyA);
      await db.query("select public.set_active_company($1)", [ids.companyB]);
      expect((await db.one("select public.current_company_id() as id")).id).toBe(ids.companyB);
      expect(await db.query("select id from companies")).toEqual([{ id: ids.companyB }]);
    }));

  it("without a user id the app role sees nothing", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userA);
      await db.query("select set_config('app.user_id', '', true)");
      expect(await db.query("select id from companies")).toEqual([]);
      expect(await db.query("select id from memberships")).toEqual([]);
    }));

  it("the app role cannot read auth tables", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userA);
      for (const table of ["users", "sessions", "accounts", "verifications", "auth_rate_limits"]) {
        expect(await db.errorCode(`select 1 from ${table}`)).toBe(INSUFFICIENT_PRIVILEGE);
      }
    }));
});

describe("user_settings RLS", () => {
  it("a user cannot read another user's settings row", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userA);
      await db.query("select public.set_active_company($1)", [ids.companyA]);
      await db.as(ids.userB);
      expect(await db.query("select 1 from user_settings where user_id = $1", [ids.userA])).toEqual(
        [],
      );
      await db.as(ids.userA);
      expect((await db.one("select count(*)::int as n from user_settings")).n).toBe(1);
    }));

  it("direct insert/update by authenticated is denied", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userA);
      expect(
        await db.errorCode(
          "insert into user_settings (user_id, active_company_id) values ($1, $2)",
          [ids.userA, ids.companyA],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await db.errorCode("update user_settings set active_company_id = $1", [ids.companyA]),
      ).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("set_active_company works only for own memberships", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.both);
      expect(await db.errorCode("select public.set_active_company($1)", [ids.companyB])).toBeNull();
      expect((await db.one("select public.current_company_id() as id")).id).toBe(ids.companyB);
      await db.as(ids.userA);
      expect(await db.errorCode("select public.set_active_company($1)", [ids.companyB])).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    }));

  it("tenants cannot update companies.plan but can update name", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userB);
      expect(await db.errorCode("update companies set plan = 'demo'")).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await db.errorCode("update companies set name = 'Renamed'")).toBeNull();
      await db.as(null);
      expect((await db.one("select name from companies where id = $1", [ids.companyB])).name).toBe(
        "Renamed",
      );
    }));
});
