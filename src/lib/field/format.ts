const ART = "America/Argentina/Buenos_Aires";

/** `vie 16/10` in Argentina time. */
export function weekdayDayMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: ART,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday").replace(".", "")} ${get("day")}/${get("month")}`;
}
