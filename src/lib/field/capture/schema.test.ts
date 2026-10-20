import { describe, expect, it } from "vitest";
import type { FormSchema } from "@/forms/dsl";
import type { RefFormSchema } from "@/lib/offline/reference-types";
import { capturableTypes, latestSchemas, pinnedSchemas } from "./schema";

// Phase 2.2/2.5 — a draft keeps the schema versions it was started with; a newer published version
// never changes an open draft (spec/forms.md#Versions, Offline capture).

const schema = (title: string): FormSchema => ({
  title,
  sections: [
    { key: "main", title: "Main", fields: [{ key: "topic", type: "text", label: "Tema" }] },
  ],
});

// An extension only contributes x_ sections; mergeSchemas appends them to the base document.
const extensionSchema = (title: string): FormSchema => ({
  title,
  sections: [
    {
      key: "x_extra",
      title: "Extra",
      fields: [{ key: "x_note", type: "text", label: "Nota" }],
    },
  ],
});

let counter = 0;
function row(input: {
  code?: string;
  kind?: "base" | "extension";
  version: number;
  title: string;
  id?: string;
}): RefFormSchema {
  counter += 1;
  const code = input.code ?? "toolbox_talk";
  return {
    id: input.id ?? `schema-${counter}`,
    record_type_id: `type-${code}`,
    record_type: code,
    company_id: input.kind === "extension" ? "company-a" : null,
    kind: input.kind ?? "base",
    version: input.version,
    schema:
      input.kind === "extension" ? extensionSchema(input.title) : schema(input.title),
    published_at: "2026-10-19T10:00:00Z",
  };
}

const rows: RefFormSchema[] = [
  row({ version: 1, title: "toolbox v1" }),
  row({ version: 2, title: "toolbox v2" }),
  row({ kind: "extension", version: 1, title: "extension v1" }),
  row({ kind: "extension", version: 2, title: "extension v2" }),
  row({ code: "ats", version: 1, title: "ats v1" }),
];

describe("latestSchemas", () => {
  it("picks the highest base and extension version of the requested type", () => {
    const pinned = latestSchemas(rows, "toolbox_talk");
    expect(pinned?.baseRow.version).toBe(2);
    expect(pinned?.extensionRow?.version).toBe(2);
    expect(pinned?.base.title).toBe("toolbox v2");
    expect(pinned?.sections.map((s) => s.key)).toEqual(["main", "x_extra"]);
  });

  it("never mixes versions of another record type", () => {
    const pinned = latestSchemas(rows, "ats");
    expect(pinned?.baseRow.version).toBe(1);
    expect(pinned?.base.title).toBe("ats v1");
    expect(pinned?.extensionRow).toBeUndefined();
  });

  it("returns undefined when the type has no base schema", () => {
    expect(latestSchemas(rows, "unknown_type")).toBeUndefined();
    expect(latestSchemas(rows, "toolbox_talk")?.baseRow.company_id).toBeNull();
  });
});

describe("pinnedSchemas", () => {
  it("returns exactly the versions the draft started with", () => {
    const pinned = pinnedSchemas(rows, {
      record_type: "toolbox_talk",
      schema_version: 1,
      extension_version: 1,
    });
    expect(pinned?.baseRow.version).toBe(1);
    expect(pinned?.extensionRow?.version).toBe(1);
    expect(pinned?.base.title).toBe("toolbox v1");
  });

  it("does not fall back to a newer base or extension", () => {
    const pinned = pinnedSchemas(rows, {
      record_type: "toolbox_talk",
      schema_version: 3,
      extension_version: 1,
    });
    expect(pinned).toBeUndefined();

    const missingExtension = pinnedSchemas(rows, {
      record_type: "toolbox_talk",
      schema_version: 1,
      extension_version: 3,
    });
    expect(missingExtension).toBeUndefined();
  });

  it("leaves the extension out when the draft has none", () => {
    const pinned = pinnedSchemas(rows, { record_type: "toolbox_talk", schema_version: 2 });
    expect(pinned?.baseRow.version).toBe(2);
    expect(pinned?.extensionRow).toBeUndefined();
    expect(pinned?.sections.map((s) => s.key)).toEqual(["main"]);
  });
});

describe("capturableTypes", () => {
  const recordTypes = [
    { id: "type-toolbox_talk", company_id: null, code: "toolbox_talk", name: "Charla" },
    { id: "type-ats", company_id: null, code: "ats", name: "ATS" },
    { id: "type-empty", company_id: null, code: "sin_formulario", name: "Sin formulario" },
  ];

  it("lists the types that have a cached base schema, using its title", () => {
    expect(capturableTypes(recordTypes, rows)).toEqual([
      { code: "toolbox_talk", name: "Charla", title: "toolbox v2" },
      { code: "ats", name: "ATS", title: "ats v1" },
    ]);
  });

  it("returns nothing when no schema is cached", () => {
    expect(capturableTypes(recordTypes, [])).toEqual([]);
  });
});
