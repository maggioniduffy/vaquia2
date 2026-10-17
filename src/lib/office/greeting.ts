import { t } from "@/i18n/es-AR";

const ART = "America/Argentina/Buenos_Aires";

export function greetingFor(name: string, now: Date = new Date()): string {
  const hour =
    Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: ART, hour: "2-digit", hourCycle: "h23" }).format(
        now,
      ),
    ) % 24;
  if (hour < 6 || hour >= 20) return t.greeting.evening(name);
  if (hour < 13) return t.greeting.morning(name);
  return t.greeting.afternoon(name);
}

/** "Viernes 16 de octubre de 2026" (ART). */
export function longDateAr(now: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("es-AR", {
    timeZone: ART,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(now)
    .replace(",", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** First name guess from an email local part ("carolina.mendez@x" -> "Carolina"). */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._\-+\d]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function initials(text: string, max = 2): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}
