import { describe, expect, it } from "vitest";
import {
  MAX_FIELDS,
  MAX_GROUP_DEPTH,
  MAX_OPTIONS,
  MAX_PHOTOS,
  MAX_SCHEMA_BYTES,
  mergeSchemas,
  type Field,
  type FormSchema,
  type TextField,
} from "./dsl";
import { checkLimits, validateExtension, validateFormSchema } from "./meta";

function textField(key: string, extra: Partial<TextField> = {}): TextField {
  return { key, type: "text", label: key, ...extra };
}

function groupField(key: string, fields: Field[]): Field {
  return { key, type: "group", label: key, fields };
}

function form(fields: Field[]): FormSchema {
  return { title: "Form", sections: [{ key: "main", title: "Main", fields }] };
}

function manyFields(count: number): Field[] {
  return Array.from({ length: count }, (_, i) => textField(`f${i}`));
}

/** Issues of a failed validation, as formatted by `validateFormSchema`. */
function issuesOf(doc: unknown): string[] {
  const result = validateFormSchema(doc);
  return result.ok ? [] : result.issues;
}

function hasIssue(issues: string[], fragment: string): boolean {
  return issues.some((issue) => issue.includes(fragment));
}

/** A document whose serialized JSON is exactly `totalBytes` bytes (ASCII labels). */
function sizedDoc(totalBytes: number): FormSchema {
  const skeleton = form([textField("pad")]);
  const skeletonBytes = new TextEncoder().encode(JSON.stringify(skeleton)).length;
  const labelLength = "pad".length + (totalBytes - skeletonBytes);
  return form([textField("pad", { label: "x".repeat(labelLength) })]);
}

describe("meta-schema: field count limit (forms.md#Limits)", () => {
  it("accepts exactly 100 fields", () => {
    expect(validateFormSchema(form(manyFields(MAX_FIELDS))).ok).toBe(true);
  });

  it("rejects 101 fields", () => {
    const issues = issuesOf(form(manyFields(MAX_FIELDS + 1)));
    expect(hasIssue(issues, `more than ${MAX_FIELDS} fields (101)`)).toBe(true);
  });

  it("counts nested group fields toward the 100 field limit", () => {
    // 98 top level + the group itself + 1 nested field = 100 fields.
    const withOneNested = form([
      ...manyFields(MAX_FIELDS - 2),
      groupField("g", [textField("nested")]),
    ]);
    expect(validateFormSchema(withOneNested).ok).toBe(true);
    const withTwoNested = form([
      ...manyFields(MAX_FIELDS - 2),
      groupField("g", [textField("n1"), textField("n2")]),
    ]);
    expect(hasIssue(issuesOf(withTwoNested), `more than ${MAX_FIELDS} fields (101)`)).toBe(true);
  });
});

describe("meta-schema: group depth limit (forms.md#Limits)", () => {
  it("accepts 2 levels of nested groups", () => {
    const doc = form([groupField("outer", [groupField("inner", [textField("leaf")])])]);
    expect(validateFormSchema(doc).ok).toBe(true);
  });

  it("rejects a 3rd level of nested groups", () => {
    const doc = form([
      groupField("outer", [groupField("inner", [groupField("too_deep", [textField("leaf")])])]),
    ]);
    const issues = issuesOf(doc);
    expect(hasIssue(issues, `group "too_deep" exceeds nesting depth ${MAX_GROUP_DEPTH}`)).toBe(
      true,
    );
  });
});

describe("meta-schema: options limit (forms.md#Limits)", () => {
  function selectField(count: number): Field {
    return {
      key: "select",
      type: "select",
      label: "Select",
      options: Array.from({ length: count }, (_, i) => ({ key: `o${i}`, label: `Option ${i}` })),
    };
  }

  it("accepts exactly 50 options", () => {
    expect(validateFormSchema(form([selectField(MAX_OPTIONS)])).ok).toBe(true);
  });

  it("rejects 51 options", () => {
    const issues = issuesOf(form([selectField(MAX_OPTIONS + 1)]));
    expect(hasIssue(issues, `expected array to have <=${MAX_OPTIONS} items`)).toBe(true);
  });
});

describe("meta-schema: photos limit (forms.md#Limits)", () => {
  it("accepts a photos field with max 20", () => {
    const doc = form([{ key: "fotos", type: "photos", label: "Fotos", min: 0, max: MAX_PHOTOS }]);
    expect(validateFormSchema(doc).ok).toBe(true);
  });

  it("rejects a photos field with max above 20", () => {
    const doc = form([
      { key: "fotos", type: "photos", label: "Fotos", min: 0, max: MAX_PHOTOS + 1 },
    ]);
    expect(hasIssue(issuesOf(doc), `expected number to be <=${MAX_PHOTOS}`)).toBe(true);
  });
});

describe("meta-schema: schema size limit (forms.md#Limits)", () => {
  it("accepts a schema of exactly 64 KB", () => {
    const doc = sizedDoc(MAX_SCHEMA_BYTES);
    expect(new TextEncoder().encode(JSON.stringify(doc)).length).toBe(MAX_SCHEMA_BYTES);
    expect(checkLimits(doc)).toEqual([]);
  });

  it("rejects a schema one byte over 64 KB", () => {
    const doc = sizedDoc(MAX_SCHEMA_BYTES + 1);
    expect(new TextEncoder().encode(JSON.stringify(doc)).length).toBe(MAX_SCHEMA_BYTES + 1);
    expect(checkLimits(doc).map((i) => i.message)).toContain(
      `schema JSON exceeds ${MAX_SCHEMA_BYTES} bytes`,
    );
  });

  it("rejects an oversized schema through validateFormSchema", () => {
    const issues = issuesOf(sizedDoc(MAX_SCHEMA_BYTES + 1));
    expect(hasIssue(issues, `schema JSON exceeds ${MAX_SCHEMA_BYTES} bytes`)).toBe(true);
  });
});

describe("meta-schema: key format", () => {
  it.each(["a", "a_b", "a_1", "x_custom", "field_2b", "t0"])("accepts snake_case key %s", (key) => {
    expect(validateFormSchema(form([textField(key)])).ok).toBe(true);
  });

  it.each(["A", "aB", "a-b", "a__b", "a_", "_a", "1a", "a b", "x-1"])(
    "rejects non snake_case key %s",
    (key) => {
      expect(hasIssue(issuesOf(form([textField(key)])), "key must be snake_case")).toBe(true);
    },
  );

  it("rejects a non snake_case nested key", () => {
    const doc = form([groupField("g", [textField("bad-key")])]);
    expect(hasIssue(issuesOf(doc), "key must be snake_case")).toBe(true);
  });
});

describe("meta-schema: unique keys", () => {
  it("rejects a duplicated field key in the same section", () => {
    const issues = issuesOf(form([textField("dup"), textField("dup")]));
    expect(hasIssue(issues, 'duplicate field key "dup"')).toBe(true);
  });

  it("rejects a duplicated field key across sections", () => {
    const doc: FormSchema = {
      title: "Form",
      sections: [
        { key: "a", title: "A", fields: [textField("same")] },
        { key: "b", title: "B", fields: [textField("same")] },
      ],
    };
    expect(hasIssue(issuesOf(doc), 'duplicate field key "same"')).toBe(true);
  });

  it("rejects a duplicated nested field key", () => {
    const doc = form([
      groupField("g1", [textField("child")]),
      groupField("g2", [textField("child")]),
    ]);
    expect(hasIssue(issuesOf(doc), 'duplicate field key "child"')).toBe(true);
  });

  it("rejects a nested field key that repeats a top level key", () => {
    const doc = form([textField("dup"), groupField("g", [textField("dup")])]);
    expect(hasIssue(issuesOf(doc), 'duplicate field key "dup"')).toBe(true);
  });

  it("rejects a duplicated section key", () => {
    const doc: FormSchema = {
      title: "Form",
      sections: [
        { key: "same", title: "A", fields: [textField("a")] },
        { key: "same", title: "B", fields: [textField("b")] },
      ],
    };
    expect(hasIssue(issuesOf(doc), 'duplicate section key "same"')).toBe(true);
  });
});

describe("validateExtension", () => {
  const base: FormSchema = form([textField("topic"), textField("x_shared")]);

  function extension(sections: FormSchema["sections"]): FormSchema {
    return { title: "Extension", sections };
  }

  it("accepts an extension whose section and field keys start with x_", () => {
    const result = validateExtension(
      base,
      extension([{ key: "x_extra", title: "Extra", fields: [textField("x_note")] }]),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an extension section key without the x_ prefix", () => {
    const result = validateExtension(
      base,
      extension([{ key: "extra", title: "Extra", fields: [textField("x_note")] }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('section "extra" must start with "x_"');
  });

  it("rejects an extension field key without the x_ prefix", () => {
    const result = validateExtension(
      base,
      extension([{ key: "x_extra", title: "Extra", fields: [textField("note")] }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('field "note" must start with "x_"');
  });

  it("rejects an extension nested field key without the x_ prefix", () => {
    const result = validateExtension(
      base,
      extension([
        { key: "x_extra", title: "Extra", fields: [groupField("x_group", [textField("child")])] },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('field "child" must start with "x_"');
  });

  it("rejects an extension that reuses a core field key", () => {
    const result = validateExtension(
      base,
      extension([{ key: "x_extra", title: "Extra", fields: [textField("x_shared")] }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('field "x_shared" reuses a core key');
  });

  it("rejects an extension that reuses a core section key", () => {
    const coreWithPrefixedSection: FormSchema = {
      title: "Form",
      sections: [{ key: "x_shared", title: "Main", fields: [textField("topic")] }],
    };
    const result = validateExtension(
      coreWithPrefixedSection,
      extension([{ key: "x_shared", title: "Extra", fields: [textField("x_note")] }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('section "x_shared" reuses a core key');
  });

  it("rejects duplicated keys inside the extension", () => {
    const result = validateExtension(
      base,
      extension([
        { key: "x_extra", title: "Extra", fields: [textField("x_note"), textField("x_note")] },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.some((i) => i.includes('duplicate field key "x_note"'))).toBe(true);
  });

  it("enforces the field limit on the merged base + extension", () => {
    const fullBase = form(manyFields(MAX_FIELDS));
    const result = validateExtension(
      fullBase,
      extension([{ key: "x_extra", title: "Extra", fields: [textField("x_note")] }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.some((i) => i.includes(`more than ${MAX_FIELDS} fields (101)`))).toBe(
        true,
      );
  });

  it("accepts a merged base + extension of exactly 100 fields", () => {
    const result = validateExtension(
      form(manyFields(MAX_FIELDS - 1)),
      extension([{ key: "x_extra", title: "Extra", fields: [textField("x_note")] }]),
    );
    expect(result.ok).toBe(true);
  });

  it("enforces the size limit on the merged base + extension", () => {
    const bigBase = form(
      Array.from({ length: MAX_FIELDS }, (_, i) => textField(`f${i}`, { label: "x".repeat(700) })),
    );
    const result = validateExtension(
      bigBase,
      extension([{ key: "x_extra", title: "Extra", fields: [textField("x_note")] }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(
        result.issues.some((i) => i.includes(`schema JSON exceeds ${MAX_SCHEMA_BYTES} bytes`)),
      ).toBe(true);
  });

  it("keeps the core fields and appends the extension sections", () => {
    const result = validateExtension(
      base,
      extension([{ key: "x_extra", title: "Extra", fields: [textField("x_note")] }]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const merged = mergeSchemas(base, result.schema);
      expect(merged.sections.map((s) => s.key)).toEqual(["main", "x_extra"]);
      expect(merged.sections[0]?.fields.map((f) => f.key)).toEqual(["topic", "x_shared"]);
    }
  });

  it("rejects an extension that is not a valid DSL document", () => {
    const result = validateExtension(base, { title: "Extension", sections: [] });
    expect(result.ok).toBe(false);
  });
});

describe("meta-schema: contradictory bounds", () => {
  it("rejects a group whose min is above its max", () => {
    const doc = form([
      {
        key: "pasos",
        type: "group",
        label: "Pasos",
        repeatable: true,
        min: 3,
        max: 2,
        fields: [textField("paso")],
      },
    ]);
    expect(hasIssue(issuesOf(doc), 'group "pasos": min > max')).toBe(true);
  });

  it("rejects a photos field whose min is above its max", () => {
    const doc = form([{ key: "fotos", type: "photos", label: "Fotos", min: 5, max: 2 }]);
    expect(hasIssue(issuesOf(doc), 'photos "fotos": min > max')).toBe(true);
  });
});
