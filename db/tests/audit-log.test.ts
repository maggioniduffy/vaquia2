import { describe, expect, it } from "vitest";
import { ids, twoCompanies, withRollback } from "./helpers";

describe("audit_log", () => {
  it("records inserts and updates with a column diff", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.query("update companies set name = 'Company A2' where id = $1", [ids.companyA]);

      const rows = await db.query<{ action: string; diff: Record<string, unknown> }>(
        "select action, diff from audit_log where entity = 'companies' and entity_id = $1 order by at, id",
        [ids.companyA],
      );
      expect(rows.map((r) => r.action)).toEqual(["insert", "update"]);
      expect(rows[1]!.diff).toEqual({ name: { old: "Company A", new: "Company A2" } });

      const memberships = await db.one(
        "select count(*)::int as n from audit_log where entity = 'memberships' and company_id in ($1, $2)",
        [ids.companyA, ids.companyB],
      );
      expect(memberships.n).toBe(5);
    }));

  it("stores the acting user", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      await db.as(ids.userB); // admin of B
      await db.query(
        "update memberships set role = 'manager' where user_id = $1 and company_id = $2",
        [ids.both, ids.companyB],
      );
      await db.as(null);
      const entry = await db.one(
        "select actor_id from audit_log where entity = 'memberships' and action = 'update'",
      );
      expect(entry.actor_id).toBe(ids.userB);
    }));

  it("is append-only, even for the table owner", () =>
    withRollback(async (db) => {
      await twoCompanies(db);
      expect(await db.errorCode("update audit_log set action = 'delete'")).toBe("P0001");
      expect(await db.errorCode("delete from audit_log")).toBe("P0001");
      expect(await db.errorCode("truncate audit_log")).toBe("P0001");
    }));

  it("is readable only by hse/manager/admin of the same company, and never writable", () =>
    withRollback(async (db) => {
      await twoCompanies(db);

      await db.as(ids.userA); // hse of A
      const foreign = await db.one(
        "select count(*)::int as n from audit_log where company_id <> $1",
        [ids.companyA],
      );
      expect(foreign.n).toBe(0);
      expect((await db.one("select count(*)::int as n from audit_log")).n).toBeGreaterThan(0);
      expect(
        await db.errorCode(
          "insert into audit_log (company_id, entity, entity_id, action) values ($1, 'x', gen_random_uuid(), 'insert')",
          [ids.companyA],
        ),
      ).toBe("42501");

      await db.as(ids.workerA);
      expect(await db.query("select 1 from audit_log")).toEqual([]);
    }));
});
