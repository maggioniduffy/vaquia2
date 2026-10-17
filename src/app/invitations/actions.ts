"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { t } from "@/i18n/es-AR";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";

export type InvitationResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

async function respond(
  id: unknown,
  fn: "accept_invitation" | "decline_invitation",
): Promise<InvitationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: t.invitations.errors.generic };
  try {
    const session = await getSession();
    if (session.isGuest) return { ok: false, error: t.invitations.errors.generic };
    await withUser(session.userId, (db) => db.query(`select public.${fn}($1)`, [parsed.data]));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    const { code, message } = (error as { code?: string; message?: string } | null) ?? {};
    if (code === "P0001" && message === "persona_taken") {
      return { ok: false, error: t.invitations.errors.personaTaken };
    }
    if (code === "P0002") return { ok: false, error: t.invitations.errors.notFound };
    if (code === "23505") return { ok: false, error: t.invitations.errors.alreadyMember };
    if (code === "VQ001") return { ok: false, error: t.trial.readOnly };
    console.error("invitation response failed", error);
    return { ok: false, error: t.invitations.errors.generic };
  }
}

export async function acceptInvitation(id: string): Promise<InvitationResult> {
  return respond(id, "accept_invitation");
}

export async function declineInvitation(id: string): Promise<InvitationResult> {
  return respond(id, "decline_invitation");
}
