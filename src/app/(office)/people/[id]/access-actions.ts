"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { t } from "@/i18n/es-AR";
import { pool, withUser } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

export type AccessResult =
  | { ok: true; emailSent?: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const e = t.access.errors;
const ROLES = ["worker", "supervisor", "hse", "manager", "admin"] as const;
const GUEST_DOMAIN = "@guest.vaquia.invalid";

const fail = (error: string): AccessResult => ({ ok: false, error });

const grantSchema = z.object({
  personaId: z.uuid(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: e.invalidEmail })),
  role: z.enum(ROLES, { error: e.invalidRole }),
});
const roleSchema = z.object({ personaId: z.uuid(), role: z.enum(ROLES, { error: e.invalidRole }) });
const removeSchema = z.object({ personaId: z.uuid() });

type Db = Parameters<Parameters<typeof withUser>[1]>[0];

async function isAdmin(db: Db): Promise<boolean> {
  const r = await db.query<{ ok: boolean }>(
    "select public.has_role(array['admin']::public.member_role[]) as ok",
  );
  return r.rows[0]?.ok === true;
}

/** Locks the company's admin rows (held until the transaction ends) and returns their count. */
async function lockAndCountAdmins(db: Db): Promise<number> {
  const r = await db.query(
    "select id from public.memberships where company_id = public.current_company_id() and role = 'admin' for update",
  );
  return r.rows.length;
}

function revalidate(personaId: string) {
  revalidatePath(`/people/${personaId}`);
  revalidatePath("/people");
}

function mapError(error: unknown): AccessResult {
  const code = (error as { code?: string } | null)?.code;
  if (code === "42501") return fail(e.noPermission);
  if (code === "23505") return fail(e.personaLinked);
  console.error("access action failed", error);
  return fail(e.generic);
}

export async function grantAccess(formData: FormData): Promise<AccessResult> {
  const parsed = grantSchema.safeParse({
    personaId: formData.get("personaId"),
    email: formData.get("email") ?? "",
    role: formData.get("role"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: fieldErrors.email ?? fieldErrors.role ?? e.generic, fieldErrors };
  }
  const { personaId, email, role } = parsed.data;
  if (email.endsWith(GUEST_DOMAIN))
    return { ok: false, error: e.guestEmail, fieldErrors: { email: e.guestEmail } };

  try {
    const session = await getSession();
    const company = session.active;
    if (!company) return fail(e.noPermission);

    // 1. Admin check and persona checks, as the caller (RLS).
    const precheck = await withUser(session.userId, async (db) => {
      if (!(await isAdmin(db))) return "noPermission" as const;
      const persona = await db.query<{ full_name: string }>(
        "select full_name from public.personas where id = $1",
        [personaId],
      );
      if (!persona.rows[0]) return "notFound" as const;
      const linked = await db.query(
        "select 1 from public.memberships where company_id = public.current_company_id() and persona_id = $1",
        [personaId],
      );
      if (linked.rows.length > 0) return "personaLinked" as const;
      return persona.rows[0].full_name;
    });
    if (precheck === "noPermission") return fail(e.noPermission);
    if (precheck === "notFound") return fail(e.notFound);
    if (precheck === "personaLinked") return fail(e.personaLinked);
    const fullName = precheck;

    // 2. Owner pool: find or create the user (auth-side provisioning), only after the admin check.
    const found = await pool.query<{ id: string }>("select id from users where lower(email) = $1", [
      email,
    ]);
    let targetId = found.rows[0]?.id;
    if (!targetId) {
      const created = await pool.query<{ id: string }>(
        `insert into users (name, email, email_verified) values ($1, $2, true)
         on conflict (email) do update set email = excluded.email returning id`,
        [fullName, email],
      );
      targetId = created.rows[0]!.id;
    }
    const userId = targetId;

    // 3. Membership as the admin (RLS).
    const outcome = await withUser(session.userId, async (db) => {
      const existing = await db.query<{ id: string; persona_id: string | null; role: string }>(
        "select id, persona_id, role from public.memberships where company_id = public.current_company_id() and user_id = $1",
        [userId],
      );
      const row = existing.rows[0];
      if (row) {
        if (row.persona_id && row.persona_id !== personaId) return "userLinkedOther" as const;
        if (row.role === "admin" && role !== "admin" && (await lockAndCountAdmins(db)) <= 1) {
          return "lastAdmin" as const;
        }
        await db.query("update public.memberships set persona_id = $1, role = $2 where id = $3", [
          personaId,
          role,
          row.id,
        ]);
        return "ok" as const;
      }
      await db.query(
        `insert into public.memberships (company_id, user_id, role, persona_id)
         values (public.current_company_id(), $1, $2, $3)`,
        [userId, role, personaId],
      );
      return "ok" as const;
    });
    if (outcome === "userLinkedOther") {
      return { ok: false, error: e.userLinkedOther, fieldErrors: { email: e.userLinkedOther } };
    }
    if (outcome === "lastAdmin") return fail(e.lastAdminRole);
    revalidate(personaId);

    // 4. Invitation. A mail failure never rolls back the grant.
    let emailSent = true;
    try {
      await sendEmail({
        to: email,
        subject: t.access.invite.subject(company.name),
        text: t.access.invite.body(fullName, company.name, `${env.siteUrl}/login`),
      });
    } catch (error) {
      console.error("invitation email failed", error);
      emailSent = false;
    }
    return { ok: true, emailSent };
  } catch (error) {
    return mapError(error);
  }
}

/** Shared guard: loads the persona's membership and the admin count, as the caller. */
async function withMembership<T>(
  personaId: string,
  fn: (ctx: {
    db: Db;
    callerId: string;
    membership: { id: string; user_id: string; role: string };
    adminCount: number;
  }) => Promise<T>,
): Promise<T | AccessResult> {
  const session = await getSession();
  return withUser(session.userId, async (db) => {
    if (!(await isAdmin(db))) return fail(e.noPermission);
    const m = await db.query<{ id: string; user_id: string; role: string }>(
      "select id, user_id, role from public.memberships where company_id = public.current_company_id() and persona_id = $1",
      [personaId],
    );
    const membership = m.rows[0];
    if (!membership) return fail(e.notFound);
    const adminCount = await lockAndCountAdmins(db);
    return fn({
      db,
      callerId: session.userId,
      membership,
      adminCount,
    });
  });
}

export async function changeRole(formData: FormData): Promise<AccessResult> {
  const parsed = roleSchema.safeParse({
    personaId: formData.get("personaId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return fail(e.invalidRole);
  const { personaId, role } = parsed.data;
  try {
    const result = await withMembership<AccessResult>(
      personaId,
      async ({ db, membership, adminCount }) => {
        if (membership.role === "admin" && role !== "admin" && adminCount <= 1) {
          return fail(e.lastAdminRole);
        }
        await db.query("update public.memberships set role = $1 where id = $2", [
          role,
          membership.id,
        ]);
        return { ok: true };
      },
    );
    revalidate(personaId);
    return result;
  } catch (error) {
    return mapError(error);
  }
}

export async function removeAccess(formData: FormData): Promise<AccessResult> {
  const parsed = removeSchema.safeParse({ personaId: formData.get("personaId") });
  if (!parsed.success) return fail(e.generic);
  const { personaId } = parsed.data;
  try {
    const result = await withMembership<AccessResult>(
      personaId,
      async ({ db, callerId, membership, adminCount }) => {
        if (membership.user_id === callerId) return fail(e.removeSelf);
        if (membership.role === "admin" && adminCount <= 1) return fail(e.lastAdmin);
        await db.query("delete from public.memberships where id = $1", [membership.id]);
        return { ok: true };
      },
    );
    revalidate(personaId);
    return result;
  } catch (error) {
    return mapError(error);
  }
}
