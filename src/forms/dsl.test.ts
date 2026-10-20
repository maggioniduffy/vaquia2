import { describe, expect, it } from "vitest";
import {
  EXTENSION_PREFIX,
  MAX_FIELDS,
  MAX_GROUP_DEPTH,
  MAX_OPTIONS,
  MAX_PHOTOS,
  MAX_SCHEMA_BYTES,
  mergeSchemas,
  walkFields,
  walkSchema,
  type Field,
  type FormSchema,
  type GroupField,
  type TextField,
} from "./dsl";

function textField(key: string): TextField {
  return { key, type: "text", label: key };
}

function groupField(key: string, fields: Field[]): GroupField {
  return { key, type: "group", label: key, fields };
}

describe("dsl: limits constants (forms.md#Limits)", () => {
  it("matches the documented limits", () => {
    expect(MAX_FIELDS).toBe(100);
    expect(MAX_PHOTOS).toBe(20);
    expect(MAX_GROUP_DEPTH).toBe(2);
    expect(MAX_OPTIONS).toBe(50);
    expect(MAX_SCHEMA_BYTES).toBe(64 * 1024);
    expect(EXTENSION_PREFIX).toBe("x_");
  });
});

describe("dsl: walkFields", () => {
  it("visits nested group fields with the depth of enclosing groups", () => {
    const seen: { key: string; depth: number }[] = [];
    const outer = groupField("outer", [
      textField("leaf"),
      groupField("inner", [textField("deep")]),
    ]);
    walkFields([outer], (field, depth) => seen.push({ key: field.key, depth }));
    expect(seen).toEqual([
      { key: "outer", depth: 0 },
      { key: "leaf", depth: 1 },
      { key: "inner", depth: 1 },
      { key: "deep", depth: 2 },
    ]);
  });
});

describe("dsl: walkSchema", () => {
  it("visits the fields of every section", () => {
    const schema: FormSchema = {
      title: "Form",
      sections: [
        { key: "a", title: "A", fields: [textField("one")] },
        { key: "b", title: "B", fields: [groupField("two", [textField("three")])] },
      ],
    };
    const keys: string[] = [];
    walkSchema(schema, (field) => keys.push(field.key));
    expect(keys).toEqual(["one", "two", "three"]);
  });
});

describe("dsl: mergeSchemas", () => {
  const base: FormSchema = {
    title: "Base",
    sections: [{ key: "core", title: "Core", fields: [textField("one")] }],
  };
  const extension: FormSchema = {
    title: "Extension",
    sections: [{ key: "x_extra", title: "Extra", fields: [textField("x_two")] }],
  };

  it("appends the extension sections and keeps the base title", () => {
    const merged = mergeSchemas(base, extension);
    expect(merged.title).toBe("Base");
    expect(merged.sections.map((s) => s.key)).toEqual(["core", "x_extra"]);
  });

  it("returns the base untouched when there is no extension", () => {
    expect(mergeSchemas(base, null)).toBe(base);
    expect(mergeSchemas(base, undefined)).toBe(base);
  });
});
