import { z } from "zod";
import {
  EXTENSION_PREFIX,
  MAX_FIELDS,
  MAX_GROUP_DEPTH,
  MAX_OPTIONS,
  MAX_PHOTOS,
  MAX_SCHEMA_BYTES,
  mergeSchemas,
  walkSchema,
  type Field,
  type FormExtension,
  type FormSchema,
} from "./dsl";

/** Meta-schema: validates a DSL document before it can be saved or published (forms.md#Limits). */

const SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const key = z.string().regex(SNAKE_CASE, "key must be snake_case");
const text = z.string().min(1);
const logic = z.record(z.string(), z.unknown());

const option = z.strictObject({ key, label: text });
const uniqueKeys = (items: { key: string }[]) =>
  new Set(items.map((i) => i.key)).size === items.length;
const options = (max = MAX_OPTIONS) =>
  z.array(option).min(1).max(max).refine(uniqueKeys, "option keys must be unique");

const base = {
  key,
  label: text,
  help: z.string().optional(),
  required: z.boolean().optional(),
  visibleIf: logic.optional(),
};
const nonNegInt = z.number().int().min(0);

const fieldSchema: z.ZodType<Field> = z.lazy(
  () =>
    z.discriminatedUnion("type", [
      z.strictObject({
        ...base,
        type: z.enum(["text", "textarea"]),
        maxLength: z.number().int().positive().optional(),
      }),
      z.strictObject({
        ...base,
        type: z.literal("number"),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().positive().optional(),
        unit: z.string().optional(),
      }),
      z.strictObject({
        ...base,
        type: z.enum(["date", "time"]),
        default: z.literal("now").optional(),
      }),
      z.strictObject({ ...base, type: z.enum(["select", "multiselect"]), options: options() }),
      z.strictObject({ ...base, type: z.literal("yesno"), allowNA: z.boolean().optional() }),
      z.strictObject({ ...base, type: z.literal("checklist"), items: options() }),
      z.strictObject({ ...base, type: z.literal("ppe") }),
      z.strictObject({
        ...base,
        type: z.literal("persona"),
        multiple: z.boolean().optional(),
        role: z.enum(["attendee", "signer", "responsible"]).optional(),
        signature: z.boolean().optional(),
        widget: z.literal("attendees").optional(),
      }),
      z.strictObject({ ...base, type: z.enum(["crew", "location", "task_type"]) }),
      z.strictObject({ ...base, type: z.literal("signature") }),
      z.strictObject({
        ...base,
        type: z.literal("photos"),
        min: nonNegInt.max(MAX_PHOTOS).optional(),
        max: nonNegInt.max(MAX_PHOTOS).optional(),
      }),
      z.strictObject({ ...base, type: z.literal("geo") }),
      z.strictObject({
        ...base,
        type: z.literal("group"),
        repeatable: z.boolean().optional(),
        min: nonNegInt.optional(),
        max: nonNegInt.optional(),
        fields: z.array(fieldSchema).min(1),
        widget: z.literal("steps_hazards_controls").optional(),
      }),
    ]) as unknown as z.ZodType<Field>,
);

const section = z.strictObject({ key, title: text, fields: z.array(fieldSchema).min(1) });

/** Pure limit checks over an already shape-valid document. Returns human-readable issues. */
export function checkLimits(doc: FormSchema): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  const seen = new Set<string>();
  let count = 0;
  doc.sections.forEach((s, si) => {
    if (doc.sections.findIndex((o) => o.key === s.key) !== si)
      issues.push({ path: ["sections", si, "key"], message: `duplicate section key "${s.key}"` });
  });
  walkSchema(doc, (field, depth) => {
    count++;
    if (seen.has(field.key))
      issues.push({ path: ["sections"], message: `duplicate field key "${field.key}"` });
    seen.add(field.key);
    if (field.type === "group" && depth + 1 > MAX_GROUP_DEPTH)
      issues.push({
        path: ["sections"],
        message: `group "${field.key}" exceeds nesting depth ${MAX_GROUP_DEPTH}`,
      });
    if (field.type === "group" && field.min != null && field.max != null && field.min > field.max)
      issues.push({ path: ["sections"], message: `group "${field.key}": min > max` });
    if (field.type === "photos" && field.min != null && field.max != null && field.min > field.max)
      issues.push({ path: ["sections"], message: `photos "${field.key}": min > max` });
  });
  if (count > MAX_FIELDS)
    issues.push({ path: ["sections"], message: `more than ${MAX_FIELDS} fields (${count})` });
  const bytes = new TextEncoder().encode(JSON.stringify(doc)).length;
  if (bytes > MAX_SCHEMA_BYTES)
    issues.push({ path: [], message: `schema JSON exceeds ${MAX_SCHEMA_BYTES} bytes` });
  return issues;
}

export const formSchemaMeta = z
  .strictObject({ title: text, sections: z.array(section).min(1) })
  .superRefine((doc, ctx) => {
    for (const issue of checkLimits(doc as FormSchema)) ctx.addIssue({ code: "custom", ...issue });
  });

export type MetaResult = { ok: true; schema: FormSchema } | { ok: false; issues: string[] };

function toResult(r: z.ZodSafeParseResult<unknown>): MetaResult {
  if (r.success) return { ok: true, schema: r.data as FormSchema };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/** Validate a DSL document (base form or extension). */
export function validateFormSchema(doc: unknown): MetaResult {
  return toResult(formSchemaMeta.safeParse(doc));
}

/**
 * Validate an extension against its base: valid DSL, append-only (own `x_` keys for sections and
 * fields, nested included, no collision with any core key) and the merged form still within limits.
 */
export function validateExtension(baseDoc: FormSchema, extension: unknown): MetaResult {
  const parsed = formSchemaMeta.safeParse(extension);
  if (!parsed.success) return toResult(parsed);
  const ext = parsed.data as FormExtension;
  const issues: string[] = [];
  const coreKeys = new Set<string>(baseDoc.sections.map((s) => s.key));
  walkSchema(baseDoc, (f) => coreKeys.add(f.key));
  for (const s of ext.sections) {
    if (!s.key.startsWith(EXTENSION_PREFIX))
      issues.push(`section "${s.key}" must start with "${EXTENSION_PREFIX}"`);
    if (coreKeys.has(s.key)) issues.push(`section "${s.key}" reuses a core key`);
  }
  walkSchema(ext, (f) => {
    if (!f.key.startsWith(EXTENSION_PREFIX))
      issues.push(`field "${f.key}" must start with "${EXTENSION_PREFIX}"`);
    if (coreKeys.has(f.key)) issues.push(`field "${f.key}" reuses a core key`);
  });
  for (const i of checkLimits(mergeSchemas(baseDoc, ext))) issues.push(i.message);
  return issues.length ? { ok: false, issues } : { ok: true, schema: ext };
}
