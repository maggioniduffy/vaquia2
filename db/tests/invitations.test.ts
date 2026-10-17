import { describe, expect, it } from "vitest";
import { createUser, ids, twoCompanies, withRollback, type TestDb } from "./helpers";

// Access grants are pending invitations (spec/data-model.md#Tenancy). Writes are admin-only RLS on the
// table; the invitee side goes through security definer RPCs matched on users.email (non-anonymous only).
// SQLSTATE contract: 42501 = RLS / permission denied, 23503 = FK, 23505 = unique, P0002 = not found for
// the caller, VQ001 = read-only trial.
const RLS_DENIED = "42501";
const FK_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const NOT_FOUND = "P0002";
const READ_ONLY = "VQ001";

const adminA = "dddddddd-0000-7000-8000-0000000000a1"; // admin of company A (added by setup)
const invitee = "dddddddd-0000-7000-8000-0000000000b1"; // will be invited to company B
const stranger = "dddddddd-0000-7000-8000-0000000000b2"; // never invited
const anonInvitee = "dddddddd-0000-7000-8000-0000000000b3"; // invited, but anonymous
const personaA = "dddddddd-0000-7000-8000-0000000000c1"; // persona in company A
const personaB = "dddddddd-0000-7000-8000-0000000000c2"; // persona in company B
const personaB2 = "dddddddd-0000-7000-8000-0000000000c3"; // second persona in company B
const personaB3 = "dddddddd-0000-7000-8000-0000000000c4"; // persona in B for the "already member" case

const INVITEE_EMAIL = "invitee@test.local";
const VALID_CUIT_FORMATTED = "20-12345678-6";

async function setup(db: TestDb) {
  await twoCompanies(db);
  await createUser(db, adminA, "a-admin@test.local");
  await db.query("insert into memberships (company_id, user_id, role) values ($1, $2, 'admin')", [
    ids.companyA,
    adminA,
  ]);
  await createUser(db, invitee, INVITEE_EMAIL);
  await createUser(db, stranger, "stranger@test.local");
  await createUser(db, anonInvitee, "anon-invitee@test.local");
  await db.query(
    `insert into personas (id, company_id, full_name, dni) values
       ($1, $2, 'Ana A', '30111000'),
       ($3, $4, 'Ana B', '30111222'),
       ($5, $4, 'Bruno B', '30111333'),
       ($6, $4, 'Carla B', '30111444')`,
    [personaA, ids.companyA, personaB, ids.companyB, personaB2, personaB3],
  );
}

// Inserts as `as`, returns the SQLSTATE or null.
async function invite(
  db: TestDb,
  as: string,
  opts: { companyId: string; email?: string; personaId: string; role?: string; status?: string },
): Promise<string | null> {
  await db.as(as);
  const params = [
    opts.companyId,
    opts.email ?? INVITEE_EMAIL,
    opts.role ?? "hse",
    opts.personaId,
  ];
  if (opts.status) {
    return db.errorCode(
      "insert into invitations (company_id, email, role, persona_id, status) values ($1, $2, $3, $4, $5)",
      [...params, opts.status],
    );
  }
  return db.errorCode(
    "insert into invitations (company_id, email, role, persona_id) values ($1, $2, $3, $4)",
    params,
  );
}

// Owner read (RLS bypassed) of the single pending invitation for a company + email.
async function pendingId(db: TestDb, companyId: string, email = INVITEE_EMAIL): Promise<string> {
  await db.as(null);
  const row = await db.one<{ id: string }>(
    "select id from invitations where company_id = $1 and email = $2 and status = 'pending'",
    [companyId, email],
  );
  return row.id;
}

async function statusOf(db: TestDb, id: string): Promise<string> {
  await db.as(null);
  const row = await db.one<{ status: string }>("select status from invitations where id = $1", [id]);
  return row.status;
}

describe("invitations: admin-only writes (RLS)", () => {
  it("an admin of company A can create a pending invitation in company A", () =>
    withRollback(async (db) => {
      await setup(db);
      expect(await invite(db, adminA, { companyId: ids.companyA, personaId: personaA })).toBeNull();
      const id = await pendingId(db, ids.companyA);
      expect(await statusOf(db, id)).toBe("pending");
      const row = await db.one<{ invited_by: string }>(
        "select invited_by from invitations where id = $1",
        [id],
      );
      expect(row.invited_by).toBe(adminA);
    }));

  it("non-admins of the company cannot create invitations (hse and worker)", () =>
    withRollback(async (db) => {
      await setup(db);
      expect(
        await invite(db, ids.userA, { companyId: ids.companyA, personaId: personaA }),
        "hse",
      ).toBe(RLS_DENIED);
      expect(
        await invite(db, ids.workerA, { companyId: ids.companyA, personaId: personaA }),
        "worker",
      ).toBe(RLS_DENIED);
      await db.as(null);
      const n = await db.one<{ n: number }>("select count(*)::int as n from invitations");
      expect(n.n).toBe(0);
    }));

  it("an admin cannot create invitations for another company (both directions)", () =>
    withRollback(async (db) => {
      await setup(db);
      expect(
        await invite(db, adminA, { companyId: ids.companyB, personaId: personaB }),
        "A admin into B",
      ).toBe(RLS_DENIED);
      expect(
        await invite(db, ids.userB, { companyId: ids.companyA, personaId: personaA }),
        "B admin into A",
      ).toBe(RLS_DENIED);
    }));

  it("an admin cannot attach a persona from another company (composite FK)", () =>
    withRollback(async (db) => {
      await setup(db);
      expect(
        await invite(db, adminA, { companyId: ids.companyA, personaId: personaB }),
      ).toBe(FK_VIOLATION);
    }));

  it("insert accepts only status 'pending'", () =>
    withRollback(async (db) => {
      await setup(db);
      expect(
        await invite(db, adminA, {
          companyId: ids.companyA,
          personaId: personaA,
          status: "accepted",
        }),
      ).toBe(RLS_DENIED);
    }));

  it("duplicate pending invitations are rejected per (company, email) and per (company, persona)", () =>
    withRollback(async (db) => {
      await setup(db);
      expect(
        await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB }),
      ).toBeNull();
      expect(
        await invite(db, ids.userB, {
          companyId: ids.companyB,
          personaId: personaB2,
          email: INVITEE_EMAIL,
        }),
        "same email",
      ).toBe(UNIQUE_VIOLATION);
      expect(
        await invite(db, ids.userB, {
          companyId: ids.companyB,
          personaId: personaB,
          email: "other@test.local",
        }),
        "same persona",
      ).toBe(UNIQUE_VIOLATION);
    }));

  it("an admin of the company can revoke a pending invitation; it moves to 'revoked' only", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, adminA, { companyId: ids.companyA, personaId: personaA });
      const id = await pendingId(db, ids.companyA);

      await db.as(adminA);
      expect(
        await db.errorCode("update invitations set status = 'revoked' where id = $1", [id]),
      ).toBeNull();
      expect(await statusOf(db, id)).toBe("revoked");

      await db.as(adminA);
      expect(
        await db.errorCode("update invitations set status = 'accepted' where id = $1", [id]),
        "revoked rows are no longer updatable",
      ).toBeNull(); // no row matches USING (status = 'pending'): 0 rows, no error
      expect(await statusOf(db, id)).toBe("revoked");
    }));

  it("an admin cannot set a pending invitation to accepted or declined directly", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, adminA, { companyId: ids.companyA, personaId: personaA });
      const id = await pendingId(db, ids.companyA);

      await db.as(adminA);
      expect(
        await db.errorCode("update invitations set status = 'accepted' where id = $1", [id]),
      ).toBe(RLS_DENIED);
      expect(
        await db.errorCode("update invitations set status = 'declined' where id = $1", [id]),
      ).toBe(RLS_DENIED);
      expect(await statusOf(db, id)).toBe("pending");
    }));

  it("another company's admin and a non-admin cannot revoke (no rows match, status unchanged)", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, adminA, { companyId: ids.companyA, personaId: personaA });
      const id = await pendingId(db, ids.companyA);

      await db.as(ids.userB);
      expect(
        await db.errorCode("update invitations set status = 'revoked' where id = $1", [id]),
      ).toBeNull();
      await db.as(ids.userA); // hse of A
      expect(
        await db.errorCode("update invitations set status = 'revoked' where id = $1", [id]),
      ).toBeNull();
      expect(await statusOf(db, id)).toBe("pending");
    }));

  it("delete is not granted to any role", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, adminA, { companyId: ids.companyA, personaId: personaA });
      await db.as(adminA);
      expect(await db.errorCode("delete from invitations")).toBe(RLS_DENIED);
      await db.as(null);
      const privs = await db.one<{ select_: boolean; insert_: boolean; update_: boolean; delete_: boolean }>(
        `select has_table_privilege('authenticated', 'public.invitations', 'SELECT') as select_,
                has_table_privilege('authenticated', 'public.invitations', 'INSERT') as insert_,
                has_table_privilege('authenticated', 'public.invitations', 'UPDATE') as update_,
                has_table_privilege('authenticated', 'public.invitations', 'DELETE') as delete_`,
      );
      expect(privs).toEqual({ select_: true, insert_: true, update_: true, delete_: false });
    }));
});

describe("invitations: reads (RLS)", () => {
  it("another company's admin cannot read company A's invitations", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, adminA, { companyId: ids.companyA, personaId: personaA });
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });

      await db.as(ids.userB);
      const rows = await db.query<{ company_id: string }>("select company_id from invitations");
      expect(rows.map((r) => r.company_id)).toEqual([ids.companyB]);
    }));

  it("a non-admin member cannot read the company's invitations", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, adminA, { companyId: ids.companyA, personaId: personaA });
      await db.as(ids.userA);
      expect(await db.query("select id from invitations")).toHaveLength(0);
    }));

  it("the invitee cannot read the invitations table directly", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });
      await db.as(invitee);
      expect(await db.query("select id from invitations")).toHaveLength(0);
    }));
});

describe("invitations: invitee side (my_invitations)", () => {
  it("lists only pending invitations addressed to the caller's email, with name and role only", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB, role: "hse" });
      await invite(db, adminA, {
        companyId: ids.companyA,
        personaId: personaA,
        email: "someone-else@test.local",
      });

      await db.as(invitee);
      const rows = await db.query<Record<string, unknown>>("select * from public.my_invitations()");
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]!).sort()).toEqual(["company_name", "id", "invited_at", "role"]);
      expect(rows[0]).toMatchObject({ company_name: "Company B", role: "hse" });
    }));

  it("a stranger with no invitation sees nothing", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });
      await db.as(stranger);
      expect(await db.query("select * from public.my_invitations()")).toHaveLength(0);
    }));

  it("an anonymous user sees nothing even when the email matches", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, {
        companyId: ids.companyB,
        personaId: personaB,
        email: "anon-invitee@test.local",
      });
      // Non-vacuous: visible while not anonymous, hidden once anonymous.
      await db.as(anonInvitee);
      expect(await db.query("select * from public.my_invitations()")).toHaveLength(1);
      await db.as(null);
      await db.query("update users set is_anonymous = true where id = $1", [anonInvitee]);
      await db.as(anonInvitee);
      expect(await db.query("select * from public.my_invitations()")).toHaveLength(0);
    }));
});

describe("invitations: accept_invitation", () => {
  it("creates the membership with the persona link, marks accepted and sets the active company", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB, role: "hse" });
      const id = await pendingId(db, ids.companyB);

      await db.as(invitee);
      const accepted = await db.one<{ id: string }>(
        "select public.accept_invitation($1) as id",
        [id],
      );
      expect(accepted.id).toBe(ids.companyB);

      await db.as(null);
      const membership = await db.one<{
        company_id: string;
        role: string;
        persona_id: string;
        created_by: string;
      }>(
        "select company_id, role::text as role, persona_id, created_by from memberships where user_id = $1",
        [invitee],
      );
      expect(membership).toEqual({
        company_id: ids.companyB,
        role: "hse",
        persona_id: personaB,
        created_by: ids.userB,
      });

      const inv = await db.one<{ status: string; responded_at: Date | null }>(
        "select status, responded_at from invitations where id = $1",
        [id],
      );
      expect(inv.status).toBe("accepted");
      expect(inv.responded_at).not.toBeNull();

      const settings = await db.one<{ active_company_id: string }>(
        "select active_company_id from user_settings where user_id = $1",
        [invitee],
      );
      expect(settings.active_company_id).toBe(ids.companyB);

      await db.as(invitee);
      expect((await db.one<{ id: string }>("select public.current_company_id() as id")).id).toBe(
        ids.companyB,
      );
    }));

  it("an accepted invitation cannot be accepted again (P0002) and is no longer listed", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });
      const id = await pendingId(db, ids.companyB);
      await db.as(invitee);
      expect(await db.errorCode("select public.accept_invitation($1)", [id])).toBeNull();
      expect(await db.errorCode("select public.accept_invitation($1)", [id])).toBe(NOT_FOUND);
      expect(await db.query("select * from public.my_invitations()")).toHaveLength(0);
    }));

  it("a user with another email cannot accept (P0002) and the invitation stays pending", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });
      const id = await pendingId(db, ids.companyB);
      await db.as(stranger);
      expect(await db.errorCode("select public.accept_invitation($1)", [id])).toBe(NOT_FOUND);
      expect(await statusOf(db, id)).toBe("pending");
      await db.as(null);
      expect(
        await db.query("select 1 from memberships where user_id = $1", [stranger]),
      ).toHaveLength(0);
    }));

  it("an anonymous user cannot accept (P0002), even when the email matches", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, {
        companyId: ids.companyB,
        personaId: personaB,
        email: "anon-invitee@test.local",
      });
      const id = await pendingId(db, ids.companyB, "anon-invitee@test.local");
      await db.query("update users set is_anonymous = true where id = $1", [anonInvitee]);
      await db.as(anonInvitee);
      expect(await db.errorCode("select public.accept_invitation($1)", [id])).toBe(NOT_FOUND);
      expect(await statusOf(db, id)).toBe("pending");
    }));

  it("a request with no authenticated user cannot accept (42501)", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });
      const id = await pendingId(db, ids.companyB);
      await db.as(null);
      expect(await db.errorCode("select public.accept_invitation($1)", [id])).toBe(RLS_DENIED);
    }));

  it("a revoked invitation cannot be accepted (P0002)", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });
      const id = await pendingId(db, ids.companyB);
      await db.as(ids.userB);
      expect(
        await db.errorCode("update invitations set status = 'revoked' where id = $1", [id]),
      ).toBeNull();
      await db.as(invitee);
      expect(await db.query("select * from public.my_invitations()")).toHaveLength(0);
      expect(await db.errorCode("select public.accept_invitation($1)", [id])).toBe(NOT_FOUND);
    }));

  it("accepting when already a member of the company fails with 23505 and the invitation stays pending", () =>
    withRollback(async (db) => {
      await setup(db);
      // `both` is already admin of company B (see twoCompanies).
      await invite(db, ids.userB, {
        companyId: ids.companyB,
        personaId: personaB3,
        email: "both@test.local",
      });
      const id = await pendingId(db, ids.companyB, "both@test.local");
      await db.as(ids.both);
      expect(await db.errorCode("select public.accept_invitation($1)", [id])).toBe(UNIQUE_VIOLATION);
      expect(await statusOf(db, id)).toBe("pending");
    }));
});

describe("invitations: decline and pending state", () => {
  it("decline marks the invitation declined, creates no membership and hides it", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });
      const id = await pendingId(db, ids.companyB);

      await db.as(invitee);
      expect(await db.errorCode("select public.decline_invitation($1)", [id])).toBeNull();
      expect(await db.query("select * from public.my_invitations()")).toHaveLength(0);
      expect(await statusOf(db, id)).toBe("declined");

      await db.as(null);
      expect(
        await db.query("select 1 from memberships where user_id = $1", [invitee]),
      ).toHaveLength(0);

      await db.as(invitee);
      expect(await db.errorCode("select public.accept_invitation($1)", [id])).toBe(NOT_FOUND);
    }));

  it("a stranger cannot decline someone else's invitation (P0002)", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });
      const id = await pendingId(db, ids.companyB);
      await db.as(stranger);
      expect(await db.errorCode("select public.decline_invitation($1)", [id])).toBe(NOT_FOUND);
      expect(await statusOf(db, id)).toBe("pending");
    }));

  it("a pending invitation does not block the invitee from creating their own company", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, ids.userB, { companyId: ids.companyB, personaId: personaB });
      const pending = await pendingId(db, ids.companyB);

      await db.as(invitee);
      const created = await db.one<{ id: string }>(
        "select public.create_company('Mi Empresa', $1, 'Ana Perez', '12345678') as id",
        [VALID_CUIT_FORMATTED],
      );
      expect(created.id).toBeTruthy();
      expect(created.id).not.toBe(ids.companyB);

      await db.as(null);
      const role = await db.one<{ role: string }>(
        "select role::text as role from memberships where user_id = $1 and company_id = $2",
        [invitee, created.id],
      );
      expect(role.role).toBe("admin");
      expect(await statusOf(db, pending)).toBe("pending");
    }));
});

describe("invitations: trial and grants", () => {
  it("an expired trial blocks creating invitations (VQ001) and revoking them", () =>
    withRollback(async (db) => {
      await setup(db);
      await invite(db, adminA, { companyId: ids.companyA, personaId: personaA });
      const id = await pendingId(db, ids.companyA);

      await db.as(null);
      await db.query(
        "update companies set plan = 'trial', trial_ends_at = now() - interval '1 day' where id = $1",
        [ids.companyA],
      );

      expect(
        await invite(db, adminA, {
          companyId: ids.companyA,
          personaId: personaA,
          email: "new@test.local",
        }),
      ).toBe(READ_ONLY);

      await db.as(adminA);
      expect(
        await db.errorCode("update invitations set status = 'revoked' where id = $1", [id]),
      ).toBe(READ_ONLY);
      expect(await statusOf(db, id)).toBe("pending");
    }));

  it("grants are explicit: authenticated only, no PUBLIC privileges, no default ACL", () =>
    withRollback(async (db) => {
      await db.as(null);
      const tableGrantees = await db.query<{ grantee: string; privilege: string }>(
        `select coalesce(r.rolname, 'PUBLIC') as grantee, a.privilege_type as privilege
         from pg_class c
         cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
         left join pg_roles r on r.oid = a.grantee
         where c.oid = 'public.invitations'::regclass and a.grantee <> c.relowner`,
      );
      const byGrantee = new Set(tableGrantees.map((g) => g.grantee));
      expect([...byGrantee].sort()).toEqual(["authenticated"]);

      for (const fn of [
        "public.my_invitations()",
        "public.accept_invitation(uuid)",
        "public.decline_invitation(uuid)",
      ]) {
        const exec = await db.one<{ authenticated: boolean; public_exec: boolean }>(
          `select has_function_privilege('authenticated', '${fn}', 'EXECUTE') as authenticated,
                  exists (
                    select 1 from pg_proc p
                    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where p.oid = '${fn}'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
                  ) as public_exec`,
        );
        expect(exec, fn).toEqual({ authenticated: true, public_exec: false });
      }
    }));
});
