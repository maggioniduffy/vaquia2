// Date helpers. Dates travel as ISO `YYYY-MM-DD` strings; the business day is the ART date.
const ART = "America/Argentina/Buenos_Aires";

/** Today's date in Argentina (YYYY-MM-DD), regardless of the server/browser timezone. */
export function todayInArt(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ART,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toIso(y: number, m: number, d: number): string | null {
  if (!isRealDate(y, m, d)) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `2026-10-16` -> `16/10/2026`. Returns the input unchanged if it is not an ISO date. */
export function formatDateAr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Accepts `dd/mm/yyyy` or `yyyy-mm-dd`; returns ISO `YYYY-MM-DD`, or null when invalid. */
export function parseDateInput(input: string): string | null {
  const s = input.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return toIso(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}
