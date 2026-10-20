import jsonLogic from "json-logic-js";
import { z } from "zod";
import {
  MAX_PHOTOS,
  mergeSchemas,
  type Field,
  type FormExtension,
  type FormSchema,
  type GroupField,
} from "./dsl";

/**
 * DSL -> Zod validator for a record payload. Same code on client and server: no server-only imports.
 * Payload shapes follow docs/spec/forms.md#Field types. A field whose `visibleIf` is false is never
 * required and is stripped from the output. Unknown keys are stripped too.
 */

export type Payload = Record<string, unknown>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const id = z.string().min(1);

/** True when the field is visible for `data` (json-logic truthiness; no `visibleIf` = visible). */
export function isVisible(field: Pick<Field, "visibleIf">, data: Payload): boolean {
  if (!field.visibleIf) return true;
  try {
    return Boolean(jsonLogic.apply(field.visibleIf as never, data));
  } catch {
    return true;
  }
}

/**
 * The data `visibleIf` sees for `fields`: `scope` (record root / enclosing items) plus `data`, with
 * checklist items defaulted to `false` so an unchecked item compares as false, not undefined.
 */
export function visibilityView(fields: readonly Field[], data: Payload, scope: Payload = {}): Payload {
  const view: Payload = { ...scope, ...data };
  for (const field of fields) {
    if (field.type !== "checklist") continue;
    const current = data[field.key];
    const items = current && typeof current === "object" ? (current as Payload) : {};
    view[field.key] = {
      ...Object.fromEntries(field.items.map((item) => [item.key, false])),
      ...items,
    };
  }
  return view;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Zod schema for a single (non-group) field value, `required` handled by the caller. */
export function compileFieldValue(field: Exclude<Field, GroupField>): z.ZodType {
  switch (field.type) {
    case "text":
    case "textarea":
      return field.maxLength ? z.string().max(field.maxLength) : z.string();
    case "number": {
      let n = z.number().finite();
      if (field.min != null) n = n.min(field.min);
      if (field.max != null) n = n.max(field.max);
      const { step } = field;
      if (step == null) return n;
      const origin = field.min ?? 0;
      return n.refine((v) => {
        const q = (v - origin) / step;
        return Math.abs(q - Math.round(q)) < 1e-9;
      }, `must be a multiple of ${step}`);
    }
    case "date":
      return z.iso.date();
    case "time":
      return z.string().regex(TIME);
    case "select":
      return z.enum(field.options.map((o) => o.key) as [string, ...string[]]);
    case "multiselect":
      return z
        .array(z.enum(field.options.map((o) => o.key) as [string, ...string[]]))
        .refine((a) => new Set(a).size === a.length, "duplicate options");
    case "yesno":
      return field.allowNA ? z.enum(["yes", "no", "na"]) : z.enum(["yes", "no"]);
    case "checklist": {
      const shape: Record<string, z.ZodType> = {};
      for (const item of field.items) shape[item.key] = z.boolean().default(false);
      return z.strictObject(shape);
    }
    case "ppe":
      return z.record(z.string().min(1), z.boolean());
    case "persona":
      return field.multiple
        ? z.array(id).refine((a) => new Set(a).size === a.length, "duplicate ids")
        : id;
    case "crew":
    case "location":
    case "task_type":
    case "signature":
      return id;
    case "photos": {
      let a = z.array(id).max(Math.min(field.max ?? MAX_PHOTOS, MAX_PHOTOS));
      if (field.min) a = a.min(field.min);
      return a;
    }
    case "geo":
      return z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().min(0),
      });
  }
}

type Issue = { path: (string | number)[]; message: string };
type State = { issues: Issue[]; photos: number };

function validateFields(
  fields: readonly Field[],
  data: Payload,
  scope: Payload,
  path: (string | number)[],
  st: State,
): Payload {
  const out: Payload = {};
  // Inside a group item, visibleIf sees the item's own fields plus the record root.
  const view = visibilityView(fields, data, scope);
  for (const field of fields) {
    if (!isVisible(field, view)) continue;
    const p = [...path, field.key];
    const value = data[field.key];
    if (field.type === "group") {
      const res = validateGroup(field, value, view, p, st);
      if (res !== undefined) out[field.key] = res;
      continue;
    }
    if (isEmpty(value)) {
      if (field.required) st.issues.push({ path: p, message: "required" });
      continue;
    }
    const parsed = compileFieldValue(field).safeParse(value);
    if (!parsed.success) {
      for (const i of parsed.error.issues)
        st.issues.push({ path: [...p, ...(i.path as (string | number)[])], message: i.message });
      continue;
    }
    if (field.type === "photos") st.photos += (parsed.data as unknown[]).length;
    out[field.key] = parsed.data;
  }
  return out;
}

function validateGroup(
  field: GroupField,
  value: unknown,
  scope: Payload,
  p: (string | number)[],
  st: State,
): unknown {
  if (field.repeatable) {
    if (value === undefined || value === null) value = [];
    if (!Array.isArray(value)) {
      st.issues.push({ path: p, message: "expected a list" });
      return undefined;
    }
    const min = Math.max(field.min ?? 0, field.required ? 1 : 0);
    if (value.length < min) st.issues.push({ path: p, message: `at least ${min} required` });
    if (field.max != null && value.length > field.max)
      st.issues.push({ path: p, message: `at most ${field.max} allowed` });
    const items: Payload[] = [];
    value.forEach((item, i) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        st.issues.push({ path: [...p, i], message: "expected an object" });
        return;
      }
      items.push(validateFields(field.fields, item as Payload, scope, [...p, i], st));
    });
    return items.length || field.required ? items : undefined;
  }
  if (value === undefined || value === null) {
    if (field.required) st.issues.push({ path: p, message: "required" });
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    st.issues.push({ path: p, message: "expected an object" });
    return undefined;
  }
  return validateFields(field.fields, value as Payload, scope, p, st);
}

/** Compile a base schema (plus optional extension) into a Zod validator for the record payload. */
export function compileForm(
  base: FormSchema,
  extension?: FormExtension | null,
): z.ZodType<Payload> {
  const doc = mergeSchemas(base, extension);
  return z.record(z.string(), z.unknown()).transform((raw, ctx) => {
    const st: State = { issues: [], photos: 0 };
    const out: Payload = {};
    for (const section of doc.sections)
      Object.assign(out, validateFields(section.fields, raw, raw, [], st));
    if (st.photos > MAX_PHOTOS)
      st.issues.push({ path: [], message: `at most ${MAX_PHOTOS} photos per record` });
    if (st.issues.length) {
      for (const i of st.issues)
        ctx.issues.push({ code: "custom", message: i.message, path: i.path, input: raw });
      return z.NEVER;
    }
    return out;
  });
}
