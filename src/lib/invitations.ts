import "server-only";
import { cache } from "react";
import { withUser } from "@/lib/db";
import type { Role, Session } from "@/lib/session";

export type MyInvitation = { id: string; companyName: string; role: Role; invitedAt: Date };

/** Pending invitations addressed to the caller's email (one lookup per request). */
export const listMyInvitations = cache(async (userId: string): Promise<MyInvitation[]> => {
  const rows = await withUser(userId, async (db) => {
    const result = await db.query<{
      id: string;
      company_name: string;
      role: Role;
      invited_at: Date;
    }>("select id, company_name, role, invited_at from public.my_invitations()");
    return result.rows;
  });
  return rows.map((r) => ({
    id: r.id,
    companyName: r.company_name,
    role: r.role,
    invitedAt: r.invited_at,
  }));
});

/** Where a signed-in, non-guest user without an active company should go. */
export async function noCompanyPath(session: Session): Promise<"/invitations" | "/onboarding"> {
  const pending = await listMyInvitations(session.userId);
  return pending.length > 0 ? "/invitations" : "/onboarding";
}
