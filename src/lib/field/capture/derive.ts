import type { Payload } from "@/forms/compile";
import { walkFields, type Field, type FieldType, type PersonaField, type Section } from "@/forms/dsl";
import type { FormReferences } from "@/forms/render";
import type {
  RefCrew,
  RefLocation,
  RefPersona,
  RefQualificationStatus,
  RefTaskType,
} from "@/lib/offline/reference-types";
import type { QualificationStatus } from "@/lib/offline/reference-keys";

/** Top-level field of a type (first one), or undefined. Keys are never hard-coded per form. */
export function findField<T extends FieldType>(
  sections: Section[],
  type: T,
): (Field & { type: T }) | undefined {
  const found: Field[] = [];
  for (const s of sections)
    walkFields(s.fields, (f, depth) => {
      if (depth === 0 && f.type === type) found.push(f);
    });
  return found[0] as (Field & { type: T }) | undefined;
}

export function personaFields(sections: Section[]): PersonaField[] {
  const out: PersonaField[] = [];
  for (const s of sections)
    walkFields(s.fields, (f, depth) => {
      if (depth === 0 && f.type === "persona") out.push(f);
    });
  return out;
}

const asIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];

/** Persona ids that must sign: every persona picked in a `signature: true` persona field. */
export function signerIds(sections: Section[], payload: Payload): string[] {
  const ids = new Set<string>();
  for (const f of personaFields(sections))
    if (f.signature) for (const id of asIds(payload[f.key])) ids.add(id);
  return [...ids];
}

/** Envelope participants from `persona` fields with a role (deduplicated by persona + role). */
export function participantsOf(sections: Section[], payload: Payload) {
  const seen = new Set<string>();
  const out: { persona_id: string; role: "attendee" | "signer" | "responsible" }[] = [];
  for (const f of personaFields(sections)) {
    if (!f.role) continue;
    for (const id of asIds(payload[f.key])) {
      const k = `${id}:${f.role}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ persona_id: id, role: f.role });
      }
    }
  }
  return out;
}

/** crew / location / task type ids the envelope needs, read from the form's reference fields. */
export function contextOf(sections: Section[], payload: Payload) {
  const read = (type: "crew" | "location" | "task_type") => {
    const f = findField(sections, type);
    const v = f ? payload[f.key] : undefined;
    return typeof v === "string" ? v : undefined;
  };
  return { crew_id: read("crew"), location_id: read("location"), task_type_id: read("task_type") };
}

/**
 * Derived values after an edit: choosing a crew fills the location from `crew.location_id`
 * (only when the crew actually changed, so a manual location change sticks).
 */
export function applyDerived(
  sections: Section[],
  prev: Payload,
  next: Payload,
  crews: RefCrew[],
  locations: RefLocation[],
): Payload {
  const crewField = findField(sections, "crew");
  const locationField = findField(sections, "location");
  if (!crewField || !locationField) return next;
  if (prev[crewField.key] === next[crewField.key]) return next;
  const crew = crews.find((c) => c.id === next[crewField.key]);
  if (!crew?.location_id || !locations.some((l) => l.id === crew.location_id)) return next;
  return { ...next, [locationField.key]: crew.location_id };
}

const SEVERITY: QualificationStatus[] = ["valid", "expiring", "missing", "expired"];

/** Worst qualification status per persona across all task types (informational only in phase 2). */
export function worstStatuses(rows: RefQualificationStatus[]): Record<string, QualificationStatus> {
  const out: Record<string, QualificationStatus> = {};
  for (const r of rows) {
    const cur = out[r.persona_id];
    if (!cur || SEVERITY.indexOf(r.status) > SEVERITY.indexOf(cur)) out[r.persona_id] = r.status;
  }
  return out;
}

export function buildReferences(input: {
  personas: RefPersona[];
  crews: RefCrew[];
  locations: RefLocation[];
  taskTypes: RefTaskType[];
  qualifications: RefQualificationStatus[];
  crewId?: string;
}): FormReferences {
  const status = worstStatuses(input.qualifications);
  return {
    personas: input.personas.map((p) => ({ key: p.id, label: p.full_name })),
    crews: input.crews.map((c) => ({ key: c.id, label: c.name })),
    locations: input.locations.map((l) => ({
      key: l.id,
      label: l.field ? `${l.field} – ${l.name}` : l.name,
    })),
    taskTypes: input.taskTypes.map((tt) => ({ key: tt.id, label: tt.name })),
    personaInfo: Object.fromEntries(
      input.personas.map((p) => [p.id, { dni: p.dni, crewId: p.crew_id, status: status[p.id] }]),
    ),
    crewId: input.crewId,
  };
}
