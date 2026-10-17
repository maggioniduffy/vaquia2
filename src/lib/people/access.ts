import "server-only";
import { pool, withUser } from "@/lib/db";
import type { Role } from "@/lib/session";

export type PersonaAccess = {
  membershipId: string;
  userId: string;
  role: Role;
  email: string;
};

/** Membership of the current company linked to this persona (RLS scoped), with the user's email. */
export async function getPersonaAccess(
  userId: string,
  personaId: string,
): Promise<PersonaAccess | null> {
  const row = await withUser(userId, async (db) => {
    const result = await db.query<{ id: string; user_id: string; role: Role }>(
      `select id, user_id, role from public.memberships
        where company_id = public.current_company_id() and persona_id = $1`,
      [personaId],
    );
    return result.rows[0] ?? null;
  });
  if (!row) return null;
  // `users` is not readable by `authenticated`; the membership above was already RLS-checked.
  const user = await pool.query<{ email: string }>("select email from users where id = $1", [
    row.user_id,
  ]);
  const email = user.rows[0]?.email;
  if (!email) return null;
  return { membershipId: row.id, userId: row.user_id, role: row.role, email };
}
