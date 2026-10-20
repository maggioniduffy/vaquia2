import type { FormSchema, Section } from "@/forms/dsl";
import { mergeSchemas } from "@/forms/dsl";
import type { RefFormSchema, RefRecordType } from "@/lib/offline/reference-types";

/** The exact schema versions a draft renders and validates with (spec/forms.md#Versions). */
export type PinnedSchemas = {
  baseRow: RefFormSchema;
  extensionRow?: RefFormSchema;
  base: FormSchema;
  extension?: FormSchema;
  /** Core + extension sections as one document. */
  sections: Section[];
};

function pin(baseRow: RefFormSchema, extensionRow?: RefFormSchema): PinnedSchemas {
  const base = baseRow.schema as FormSchema;
  const extension = extensionRow ? (extensionRow.schema as FormSchema) : undefined;
  return {
    baseRow,
    extensionRow,
    base,
    extension,
    sections: mergeSchemas(base, extension).sections,
  };
}

function highest(rows: RefFormSchema[]): RefFormSchema | undefined {
  return rows.reduce<RefFormSchema | undefined>(
    (best, r) => (!best || r.version > best.version ? r : best),
    undefined,
  );
}

/** Newest cached base (+ extension) schema of a record type: used when a new draft starts. */
export function latestSchemas(
  formSchemas: RefFormSchema[],
  recordTypeCode: string,
): PinnedSchemas | undefined {
  const rows = formSchemas.filter((s) => s.record_type === recordTypeCode);
  const baseRow = highest(rows.filter((s) => s.kind === "base"));
  if (!baseRow) return undefined;
  return pin(baseRow, highest(rows.filter((s) => s.kind === "extension")));
}

/** The versions a draft was started with, never a newer one. */
export function pinnedSchemas(
  formSchemas: RefFormSchema[],
  draft: { record_type: string; schema_version: number; extension_version?: number },
): PinnedSchemas | undefined {
  const rows = formSchemas.filter((s) => s.record_type === draft.record_type);
  const baseRow = rows.find((s) => s.kind === "base" && s.version === draft.schema_version);
  if (!baseRow) return undefined;
  const extensionRow =
    draft.extension_version == null
      ? undefined
      : rows.find((s) => s.kind === "extension" && s.version === draft.extension_version);
  if (draft.extension_version != null && !extensionRow) return undefined;
  return pin(baseRow, extensionRow);
}

/** Record types the user can capture: those with a cached base schema. */
export function capturableTypes(
  recordTypes: RefRecordType[],
  formSchemas: RefFormSchema[],
): { code: string; name: string; title: string }[] {
  const out: { code: string; name: string; title: string }[] = [];
  for (const rt of recordTypes) {
    const s = latestSchemas(formSchemas, rt.code);
    if (s) out.push({ code: rt.code, name: rt.name, title: s.base.title });
  }
  return out;
}
