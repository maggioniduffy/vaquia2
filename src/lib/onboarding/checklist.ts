import "server-only";
import { withUser } from "@/lib/db";

export type ChecklistKey = "team" | "people" | "crews" | "locations";
export type Checklist = { items: Record<ChecklistKey, boolean>; doneCount: number };

/** Onboarding progress for the active company; null when dismissed or complete. RLS-scoped. */
export async function getChecklist(userId: string): Promise<Checklist | null> {
  const row = await withUser(userId, async (db) => {
    const res = await db.query<{
      dismissed: boolean;
      memberships: string;
      personas: string;
      crews: string;
      locations: string;
    }>(
      `select coalesce(c.settings->>'onboarding_dismissed' = 'true', false) as dismissed,
              (select count(*) from public.memberships where company_id = public.current_company_id()) as memberships,
              (select count(*) from public.personas where company_id = public.current_company_id()) as personas,
              (select count(*) from public.crews where company_id = public.current_company_id()) as crews,
              (select count(*) from public.locations where company_id = public.current_company_id()) as locations
         from public.companies c where c.id = public.current_company_id()`,
    );
    return res.rows[0];
  });
  if (!row || row.dismissed) return null;
  const items = {
    team: Number(row.memberships) > 1,
    people: Number(row.personas) > 1,
    crews: Number(row.crews) > 0,
    locations: Number(row.locations) > 0,
  };
  const doneCount = Object.values(items).filter(Boolean).length;
  return doneCount === 4 ? null : { items, doneCount };
}
