import { z } from "zod";
import { t } from "@/i18n/es-AR";

// Server-side validation for the people/crews/locations forms. Client validation is UX only.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Empty string / missing → null; otherwise a uuid. */
const optionalUuid = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine((v) => v === null || UUID.test(v));

const uuid = z.string().regex(UUID);

/** DNI: dots, spaces and dashes are dropped; only 7–8 digits remain valid. */
export function normalizeDni(raw: string): string {
  return raw.replace(/[.\s-]/g, "");
}

export const personaSchema = z.object({
  id: uuid.optional(),
  fullName: z
    .string()
    .trim()
    .min(1, t.people.errors.fullNameRequired)
    .max(200, t.people.errors.fullNameTooLong),
  dni: z
    .string()
    .transform(normalizeDni)
    .refine((v) => /^\d{7,8}$/.test(v), t.people.errors.dniInvalid),
  crewId: optionalUuid,
  active: z.boolean(),
});

export const crewSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, t.crews.errors.nameRequired).max(120, t.crews.errors.nameTooLong),
  supervisorPersonaId: optionalUuid,
  locationId: optionalUuid,
});

function coordinate(max: number, message: string) {
  return z
    .string()
    .nullish()
    .transform((v) => (v ?? "").trim().replace(",", "."))
    .refine((v) => v === "" || (/^-?\d+(\.\d+)?$/.test(v) && Math.abs(Number(v)) <= max), message)
    .transform((v) => (v === "" ? null : Number(v)));
}

export const locationSchema = z.object({
  id: uuid.optional(),
  name: z
    .string()
    .trim()
    .min(1, t.locations.errors.nameRequired)
    .max(120, t.locations.errors.nameTooLong),
  field: z
    .string()
    .nullish()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length <= 120, t.locations.errors.fieldTooLong)
    .transform((v) => (v === "" ? null : v)),
  operatorId: optionalUuid,
  lat: coordinate(90, t.locations.errors.latInvalid),
  lng: coordinate(180, t.locations.errors.lngInvalid),
});

export const idSchema = uuid;

export type PersonaInput = z.infer<typeof personaSchema>;
export type CrewInput = z.infer<typeof crewSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
