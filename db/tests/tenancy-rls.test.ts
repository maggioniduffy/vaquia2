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
      for (const table of ["users", "sessions", "accounts", "verifications"]) {
        expect(await db.errorCode(`select 1 from ${table}`)).toBe(INSUFFICIENT_PRIVILEGE);
      }
    }));
});
