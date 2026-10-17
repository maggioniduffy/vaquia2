import { describe, expect, it } from "vitest";
import { createUser, ids, twoCompanies, withRollback, type TestDb } from "./helpers";

const invitee = "dddddddd-0000-7000-8000-000000000001";
const stranger = "dddddddd-0000-7000-8000-000000000002";
const persona = "dddddddd-0000-7000-8000-0000000000a1";

async function setup(db: TestDb) {
  await twoCompanies(db);
  await createUser(db, invitee, "invitee@test.local");
  await createUser(db, stranger, "stranger@test.local");
  await db.query(
    "insert into personas (id, company_id, full_name, dni) values ($1, $2, 'Ana', '30111222')",
    [persona, ids.companyB],
  );
}

async function invite(db: TestDb, as: string, email = "invitee@test.local") {
  await db.as(as);
  return db.errorCode(
    "insert into invitations (company_id, email, role, persona_id) values (public.current_company_id(), $1, 'hse', $2)",
    [email, persona],
  );
}

describe("invitations", () => {
  it("only admins of the company can invite; duplicates pending are rejected", () =>
    withRollback(async (db) => {
      await setup(db);
      expect(await invite(db, ids.userA)).toBe("42501"); // hse in company A (and persona is in B)
      expect(await invite(db, ids.userB)).toBeNull();
      expect(await invite(db, ids.userB, "other@test.local")).toBe("23505"); // same persona
    }));

  it("invitee sees, accepts and becomes a member; others cannot", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB);
      const inv = await db.one<{ id: string }>("select id from invitations");

      await db.as(stranger);
      expect(await db.query("select * from public.my_invitations()")).toHaveLength(0);
      expect(await db.errorCode("select public.accept_invitation($1)", [inv.id])).toBe("P0002");

      await db.as(invitee);
      const mine = await db.query<{ company_name: string; role: string }>(
        "select company_name, role from public.my_invitations()",
      );
      expect(mine).toEqual([{ company_name: "Company B", role: "hse" }]);
      expect(await db.errorCode("select public.accept_invitation($1)", [inv.id])).toBeNull();

      const m = await db.one<{ company_id: string; role: string; persona_id: string }>(
        "select company_id, role, persona_id from memberships where user_id = $1",
        [invitee],
      );
      expect(m).toEqual({ company_id: ids.companyB, role: "hse", persona_id: persona });
      expect((await db.one<{ id: string }>("select public.current_company_id() as id")).id).toBe(
        ids.companyB,
      );
      expect(await db.query("select * from public.my_invitations()")).toHaveLength(0);
      expect(await db.errorCode("select public.accept_invitation($1)", [inv.id])).toBe("P0002");
    }));

  it("decline and revoke leave no membership", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB);
      const inv = await db.one<{ id: string }>("select id from invitations");
      await db.as(invitee);
      expect(await db.errorCode("select public.decline_invitation($1)", [inv.id])).toBeNull();
      await db.as(null);
      expect(
        await db.query("select 1 from memberships where user_id = $1", [invitee]),
      ).toHaveLength(0);

      // After a decline a new pending invitation is possible; the admin can revoke it.
      expect(await invite(db, ids.userB)).toBeNull();
      expect(
        await db.errorCode("update invitations set status = 'revoked' where status = 'pending'"),
      ).toBeNull();
      await db.as(invitee);
      expect(await db.query("select * from public.my_invitations()")).toHaveLength(0);
    }));

  it("RLS: other companies' admins cannot read or touch invitations; delete is not granted", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB);
      await db.as(ids.userA);
      expect(await db.query("select * from invitations")).toHaveLength(0);
      await db.as(ids.userB);
      expect(await db.query("select * from invitations")).toHaveLength(1);
      expect(await db.errorCode("delete from invitations")).toBe("42501");
      expect(await db.errorCode("update invitations set status = 'accepted'")).toBe("42501");
    }));

  it("anonymous users cannot accept", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB);
      const inv = await db.one<{ id: string }>("select id from invitations");
      await db.as(null);
      await db.query("update users set is_anonymous = true where id = $1", [invitee]);
      await db.as(invitee);
      expect(await db.errorCode("select public.accept_invitation($1)", [inv.id])).toBe("P0002");
    }));
});
