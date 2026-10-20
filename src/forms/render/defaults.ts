import type { Payload } from "../compile";
import { walkFields, type Section } from "../dsl";

/** Initial values for fields with `default: "now"` (ART date / HH:mm). */
export function defaultValues(sections: Section[], now = new Date()): Payload {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const out: Payload = {};
  for (const section of sections)
    walkFields(section.fields, (f, depth) => {
      if (depth > 0) return;
      if (f.type === "date" && f.default === "now")
        out[f.key] = `${get("year")}-${get("month")}-${get("day")}`;
      if (f.type === "time" && f.default === "now") out[f.key] = `${get("hour")}:${get("minute")}`;
    });
  return out;
}
