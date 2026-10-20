import { describe, expect, it } from "vitest";
import { compileForm, type Payload } from "./compile";
import { walkSchema, type Field, type FormSchema } from "./dsl";
import { validateFormSchema } from "./meta";
import atsSeed from "./seeds/ats.v1.json";
import toolboxTalkSeed from "./seeds/toolbox_talk.v1.json";

const toolboxTalk = toolboxTalkSeed as unknown as FormSchema;
const ats = atsSeed as unknown as FormSchema;

/** Field types documented in docs/spec/forms.md#Field types. */
const DOCUMENTED_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "time",
  "select",
  "multiselect",
  "yesno",
  "checklist",
  "ppe",
  "persona",
  "crew",
  "location",
  "task_type",
  "signature",
  "photos",
  "geo",
  "group",
]);

const toolboxTalkPayload: Payload = {
  topic: "Uso del arnés de seguridad",
  crew: "crew-1",
  location: "loc-1",
  attendees: ["persona-1", "persona-2"],
  notes: "Recordatorio de uso",
  geo: { lat: -34.6, lng: -58.4, accuracy: 5 },
};

const atsPayload: Payload = {
  task_type: "tt-1",
  steps: [
    {
      step: "Aislar la energía",
      hazards: [{ hazard: "Electrocución", controls: "Bloquear y etiquetar" }],
    },
  ],
  ppe: { casco: true, arnes: true },
  participants: ["persona-1"],
  geo: { lat: -34.6, lng: -58.4, accuracy: 5 },
};

function issues(result: ReturnType<ReturnType<typeof compileForm>["safeParse"]>): string[] {
  if (result.success) return [];
  return result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

/** Required top level fields of a seed. */
function requiredKeys(schema: FormSchema): string[] {
  const keys: string[] = [];
  walkSchema(schema, (field, depth) => {
    if (depth === 0 && field.required) keys.push(field.key);
  });
  return keys;
}

function without(payload: Payload, key: string): Payload {
  const copy = { ...payload };
  delete copy[key];
  return copy;
}

/** The seed plus a field that only a hypothetical v2 would have. */
function withV2Field(schema: FormSchema, key: string): FormSchema {
  return {
    ...schema,
    sections: schema.sections.map((section, index) =>
      index === schema.sections.length - 1
        ? {
            ...section,
            fields: [
              ...section.fields,
              { key, type: "text", label: "Campo de la v2", required: true } as Field,
            ],
          }
        : section,
    ),
  };
}

describe("seeds: toolbox_talk@1", () => {
  it("validates against the meta-schema", () => {
    const result = validateFormSchema(toolboxTalk);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.schema.sections).toHaveLength(toolboxTalk.sections.length);
  });

  it("only uses field types documented in forms.md", () => {
    const types: string[] = [];
    walkSchema(toolboxTalk, (field) => types.push(field.type));
    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((t) => !DOCUMENTED_TYPES.has(t))).toEqual([]);
  });

  it("accepts a valid payload", () => {
    const result = compileForm(toolboxTalk).safeParse(toolboxTalkPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(toolboxTalkPayload);
  });

  it.each(requiredKeys(toolboxTalk))("fails when the required field %s is missing", (key) => {
    const result = compileForm(toolboxTalk).safeParse(without(toolboxTalkPayload, key));
    expect(result.success).toBe(false);
    expect(issues(result).some((i) => i.startsWith(`${key}:`))).toBe(true);
  });
});

describe("seeds: ats@1", () => {
  it("validates against the meta-schema", () => {
    const result = validateFormSchema(ats);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.schema.sections).toHaveLength(ats.sections.length);
  });

  it("only uses field types documented in forms.md", () => {
    const types: string[] = [];
    walkSchema(ats, (field) => types.push(field.type));
    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((t) => !DOCUMENTED_TYPES.has(t))).toEqual([]);
  });

  it("accepts a valid payload", () => {
    const result = compileForm(ats).safeParse(atsPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(atsPayload);
  });

  it.each(requiredKeys(ats))("fails when the required field %s is missing", (key) => {
    const result = compileForm(ats).safeParse(without(atsPayload, key));
    expect(result.success).toBe(false);
    expect(issues(result).some((i) => i.startsWith(`${key}:`))).toBe(true);
  });

  it("fails when a required field inside a group item is missing", () => {
    const payload = {
      ...atsPayload,
      steps: [{ step: "Aislar la energía", hazards: [{ controls: "Bloquear y etiquetar" }] }],
    };
    const result = compileForm(ats).safeParse(payload);
    expect(result.success).toBe(false);
    expect(issues(result)).toContain("steps.0.hazards.0.hazard: required");
  });
});

describe("seeds: version pinning (forms.md#Versions)", () => {
  it("the v1 compiler ignores a field that only v2 adds", () => {
    const v2 = withV2Field(toolboxTalk, "v2_only_field");
    const result = compileForm(toolboxTalk).safeParse({
      ...toolboxTalkPayload,
      v2_only_field: "valor de la v2",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("v2_only_field");
    const lastSection = v2.sections[v2.sections.length - 1];
    expect(lastSection?.fields.some((f) => f.key === "v2_only_field")).toBe(true);
  });

  it("a v1 record stays valid even when v2 makes a new field required", () => {
    const v2 = withV2Field(toolboxTalk, "v2_only_field");
    const v1Result = compileForm(toolboxTalk).safeParse(toolboxTalkPayload);
    expect(v1Result.success).toBe(true);
    const v2Result = compileForm(v2).safeParse(toolboxTalkPayload);
    expect(v2Result.success).toBe(false);
    expect(issues(v2Result)).toContain("v2_only_field: required");
  });

  it("the ats v1 compiler ignores a field that only v2 adds", () => {
    const result = compileForm(ats).safeParse({ ...atsPayload, v2_only_field: "valor de la v2" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("v2_only_field");
  });

  it("a v1 record keeps its own payload when a newer version exists", () => {
    const v2 = withV2Field(ats, "v2_only_field");
    const result = compileForm(ats).safeParse(atsPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(atsPayload);
    expect(compileForm(v2).safeParse(atsPayload).success).toBe(false);
  });
});
