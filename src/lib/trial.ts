import "server-only";
import { cache } from "react";
import { withUser } from "@/lib/db";

export type TrialInfo = { daysLeft: number; expired: boolean };

/** SQLSTATE raised by the read-only trigger on expired trials. */
export function isReadOnlyError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "VQ001";
}

/** Trial status of the active company; null unless plan = 'trial'. One lookup per request. */
export const getTrialInfo = cache(async (userId: string): Promise<TrialInfo | null> => {
  const row = await withUser(userId, async (db) => {
    const res = await db.query<{ plan: string; ms_left: string | null }>(
      `select plan, (extract(epoch from (trial_ends_at - now())) * 1000)::bigint as ms_left
         from public.companies where id = public.current_company_id()`,
    );
    return res.rows[0];
  });
  if (!row || row.plan !== "trial" || row.ms_left === null) return null;
  const ms = Number(row.ms_left);
  return { daysLeft: Math.max(0, Math.ceil(ms / 86_400_000)), expired: ms <= 0 };
});
