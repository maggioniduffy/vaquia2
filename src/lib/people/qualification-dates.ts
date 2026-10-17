// Pure date helpers for qualifications (shared by server and client).

/** Adds calendar months to an ISO date, clamping the day (31/01 + 1 month = 28/02). */
export function addMonthsIso(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const total = mo + months;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(ty, tm, Math.min(d, lastDay)));
  return out.toISOString().slice(0, 10);
}

/** `2026-10-16` -> `16/10` (used in "Vencida el dd/mm"). */
export function formatDayMonth(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[1]}` : iso;
}
