/** Forms DSL types (docs/spec/forms.md). Pure types and helpers: safe on client and server. */

/** json-logic expression evaluated over the record payload. */
export type JsonLogic = Record<string, unknown>;

export type PersonaRole = "attendee" | "signer" | "responsible";
export type FieldWidget = "attendees" | "steps_hazards_controls";

export type OptionItem = { key: string; label: string };

type FieldBase = {
  key: string;
  label: string;
  help?: string;
  required?: boolean;
  visibleIf?: JsonLogic;
};

export type TextField = FieldBase & { type: "text" | "textarea"; maxLength?: number };
export type NumberField = FieldBase & {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};
export type DateTimeField = FieldBase & { type: "date" | "time"; default?: "now" };
export type SelectField = FieldBase & { type: "select" | "multiselect"; options: OptionItem[] };
export type YesNoField = FieldBase & { type: "yesno"; allowNA?: boolean };
export type ChecklistField = FieldBase & { type: "checklist"; items: OptionItem[] };
export type PpeField = FieldBase & { type: "ppe" };
export type PersonaField = FieldBase & {
  type: "persona";
  multiple?: boolean;
  role?: PersonaRole;
  signature?: boolean;
  widget?: "attendees";
};
export type RefField = FieldBase & { type: "crew" | "location" | "task_type" };
export type SignatureField = FieldBase & { type: "signature" };
export type PhotosField = FieldBase & { type: "photos"; min?: number; max?: number };
export type GeoField = FieldBase & { type: "geo" };
export type GroupField = FieldBase & {
  type: "group";
  repeatable?: boolean;
  min?: number;
  max?: number;
  fields: Field[];
  widget?: "steps_hazards_controls";
};

export type Field =
  | TextField
  | NumberField
  | DateTimeField
  | SelectField
  | YesNoField
  | ChecklistField
  | PpeField
  | PersonaField
  | RefField
  | SignatureField
  | PhotosField
  | GeoField
  | GroupField;

export type FieldType = Field["type"];

export type Section = { key: string; title: string; fields: Field[] };

export type FormSchema = { title: string; sections: Section[] };

/** Extension documents share the DSL shape; they only append sections/fields with `x_` keys. */
export type FormExtension = FormSchema;

export const MAX_FIELDS = 100;
export const MAX_PHOTOS = 20;
export const MAX_GROUP_DEPTH = 2;
export const MAX_OPTIONS = 50;
export const MAX_SCHEMA_BYTES = 64 * 1024;
export const EXTENSION_PREFIX = "x_";

/** Depth-first walk over every field (groups included). `depth` = number of enclosing groups. */
export function walkFields(
  fields: readonly Field[],
  visit: (field: Field, depth: number) => void,
  depth = 0,
): void {
  for (const field of fields) {
    visit(field, depth);
    if (field.type === "group") walkFields(field.fields, visit, depth + 1);
  }
}

export function walkSchema(
  schema: Pick<FormSchema, "sections">,
  visit: (field: Field, depth: number) => void,
): void {
  for (const section of schema.sections) walkFields(section.fields, visit);
}

/** Core + extension sections as one document (extension sections are appended). */
export function mergeSchemas(base: FormSchema, extension?: FormExtension | null): FormSchema {
  if (!extension) return base;
  return { title: base.title, sections: [...base.sections, ...extension.sections] };
}
