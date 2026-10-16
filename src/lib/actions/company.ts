"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function switchCompany(companyId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_company", { target: companyId });
  if (error) return { ok: false };
  revalidatePath("/", "layout");
  return { ok: true };
}
