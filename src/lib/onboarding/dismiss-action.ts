"use server";

import { revalidatePath } from "next/cache";
import { t } from "@/i18n/es-AR";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isReadOnlyError } from "@/lib/trial";

export type DismissResult = { error?: string };

export async function dismissOnboarding(): Promise<DismissResult> {
  const session = await getSession();
  if (session.active?.role !== "admin") return { error: t.onboardingChecklist.errors.forbidden };
  try {
    await withUser(session.userId, (db) =>
      db.query(
        `update public.companies
            set settings = settings || '{"onboarding_dismissed": true}'::jsonb
          where id = public.current_company_id()`,
      ),
    );
  } catch (error) {
    if (isReadOnlyError(error)) return { error: t.trial.readOnly };
    console.error("dismissOnboarding failed", error);
    return { error: t.onboardingChecklist.errors.generic };
  }
  revalidatePath("/dashboard");
  return {};
}
