import { t } from "@/i18n/es-AR";

const fmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO instant -> "dd/mm/yyyy, hh:mm" in ART. */
export function formatArt(iso: string): string {
  return fmt.format(new Date(iso));
}

/**
 * `users` is not readable under RLS, so the office has no name for other authors: show the caller
 * as "Vos" and anyone else by a short id suffix.
 */
export function authorLabel(authorId: string, currentUserId: string): string {
  return authorId === currentUserId
    ? t.records.author.me
    : t.records.author.other(authorId.slice(-4));
}
