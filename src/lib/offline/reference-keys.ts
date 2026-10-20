export type QualificationStatus = "valid" | "expiring" | "expired" | "missing";

/** Keys of the `reference` Dexie table (one row per company_id + key). */
export const REFERENCE_KEYS = [
  "personas",
  "crews",
  "locations",
  "task_types",
  "record_types",
  "qualification_status",
  "form_schemas",
] as const;

export type ReferenceKey = (typeof REFERENCE_KEYS)[number];
