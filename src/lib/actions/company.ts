"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function switchCompany(companyId: string): Promise<{ ok: boolean }> {
  const { userId } = await getUserId();
  try {
    await withUser(userId, (db) => db.query("select public.set_active_company($1)", [companyId]));
  } catch {
    return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
