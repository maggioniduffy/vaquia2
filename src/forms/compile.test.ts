import { describe, expect, it } from "vitest";
import { compileForm, type Payload } from "./compile";
import type { Field, FormExtension, FormSchema } from "./dsl";

function form(fields: Field[]): FormSchema {
  return { title: "Form", sections: [{ key: "main", title: "Main", fields }] };
}

type ParseResult = ReturnType<ReturnType<typeof compileForm>["safeParse"]>;

function issues(result: ParseResult): string[] {
  if (result.success) return [];
  return result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

function parse(fields: Field[], payload: Payload, extension?: FormExtension | null): ParseResult {
  return compileForm(form(fields), extension).safeParse(payload);
}

describe("compile: payload shape per field type (forms.md#Field types)", () => {
  it("text and textarea take a string and enforce maxLength", () => {
    const fields: Field[] = [
      { key: "dominio", type: "text", label: "Dominio", maxLength: 10 },
      { key: "observaciones", type: "textarea", label: "Observaciones", maxLength: 100 },
    ];
    const ok = parse(fields, { dominio: "AB 123", observaciones: "todo bien" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ dominio: "AB 123", observaciones: "todo bien" });
    expect(issues(parse(fields, { dominio: "01234567890" }))).toEqual([
      "dominio: Too big: expected string to have <=10 characters",
    ]);
  });

  it("number takes a number within min and max", () => {
    const fields: Field[] = [
      { key: "presion", type: "number", label: "Presión", min: 0, max: 100 },
    ];
    const ok = parse(fields, { presion: 50 });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ presion: 50 });
    expect(issues(parse(fields, { presion: 150 }))).toEqual([
      "presion: Too big: expected number to be <=100",
    ]);
    expect(issues(parse(fields, { presion: -1 }))).toEqual([
      "presion: Too small: expected number to be >=0",
    ]);
  });

  it("number enforces the step", () => {
    const fields: Field[] = [{ key: "presion", type: "number", label: "Presión", min: 0, step: 5 }];
    expect(parse(fields, { presion: 10 }).success).toBe(true);
    expect(issues(parse(fields, { presion: 12 }))).toEqual(["presion: must be a multiple of 5"]);
  });

  it("date takes an ISO date", () => {
    const fields: Field[] = [{ key: "fecha", type: "date", label: "Fecha" }];
    const ok = parse(fields, { fecha: "2026-10-19" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ fecha: "2026-10-19" });
    expect(issues(parse(fields, { fecha: "19/10/2026" }))).toEqual(["fecha: Invalid ISO date"]);
  });

  it("time takes HH:mm", () => {
    const fields: Field[] = [{ key: "hora", type: "time", label: "Hora" }];
    const ok = parse(fields, { hora: "10:30" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ hora: "10:30" });
    expect(issues(parse(fields, { hora: "24:00" })).length).toBe(1);
  });

  it("select takes one of the declared option keys", () => {
    const fields: Field[] = [
      {
        key: "estado",
        type: "select",
        label: "Estado",
        options: [
          { key: "ok", label: "OK" },
          { key: "fail", label: "Falla" },
        ],
      },
    ];
    const ok = parse(fields, { estado: "ok" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ estado: "ok" });
    expect(issues(parse(fields, { estado: "otro" })).length).toBe(1);
  });

  it("multiselect takes a list of option keys without duplicates", () => {
    const fields: Field[] = [
      {
        key: "riesgos",
        type: "multiselect",
        label: "Riesgos",
        options: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
      },
    ];
    const ok = parse(fields, { riesgos: ["a", "b"] });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ riesgos: ["a", "b"] });
    expect(issues(parse(fields, { riesgos: ["a", "a"] }))).toEqual(["riesgos: duplicate options"]);
  });

  it("yesno takes yes/no, and 'na' only when allowNA is set", () => {
    const withoutNA: Field[] = [{ key: "cumple", type: "yesno", label: "¿Cumple?" }];
    const withNA: Field[] = [{ key: "cumple", type: "yesno", label: "¿Cumple?", allowNA: true }];
    expect(parse(withoutNA, { cumple: "yes" }).success).toBe(true);
    expect(parse(withoutNA, { cumple: "no" }).success).toBe(true);
    expect(parse(withoutNA, { cumple: "na" }).success).toBe(false);
    const na = parse(withNA, { cumple: "na" });
    expect(na.success).toBe(true);
    if (na.success) expect(na.data).toEqual({ cumple: "na" });
  });

  it("checklist takes { itemKey: boolean } and defaults the missing items to false", () => {
    const fields: Field[] = [
      {
        key: "estado",
        type: "checklist",
        label: "Estado general",
        items: [
          { key: "luces", label: "Luces" },
          { key: "frenos", label: "Frenos" },
          { key: "matafuego", label: "Matafuego" },
        ],
      },
    ];
    const ok = parse(fields, { estado: { luces: true } });
    expect(ok.success).toBe(true);
    if (ok.success)
      expect(ok.data).toEqual({ estado: { luces: true, frenos: false, matafuego: false } });
    expect(issues(parse(fields, { estado: { luces: true, extra: true } })).length).toBe(1);
  });

  it("ppe takes { itemKey: boolean }", () => {
    const fields: Field[] = [{ key: "ppe", type: "ppe", label: "EPP" }];
    const ok = parse(fields, { ppe: { casco: true, arnes: false } });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ ppe: { casco: true, arnes: false } });
    expect(issues(parse(fields, { ppe: { casco: "yes" } }))).toEqual([
      "ppe.casco: Invalid input: expected boolean, received string",
    ]);
  });

  it("persona takes one id, or a list of ids when multiple", () => {
    const single: Field[] = [{ key: "conductor", type: "persona", label: "Conductor" }];
    const multiple: Field[] = [
      { key: "asistentes", type: "persona", label: "Asistentes", multiple: true },
    ];
    expect(parse(single, { conductor: "p1" }).success).toBe(true);
    expect(issues(parse(single, { conductor: 42 })).length).toBe(1);
    const many = parse(multiple, { asistentes: ["p1", "p2"] });
    expect(many.success).toBe(true);
    if (many.success) expect(many.data).toEqual({ asistentes: ["p1", "p2"] });
    expect(issues(parse(multiple, { asistentes: ["p1", "p1"] }))).toEqual([
      "asistentes: duplicate ids",
    ]);
  });

  it.each(["crew", "location", "task_type", "signature"])("%s takes an id", (type) => {
    const fields: Field[] = [{ key: "ref", type, label: "Ref" } as Field];
    const ok = parse(fields, { ref: "id-1" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ ref: "id-1" });
    expect(issues(parse(fields, { ref: 42 })).length).toBe(1);
  });

  it("photos takes attachment ids", () => {
    const fields: Field[] = [{ key: "fotos", type: "photos", label: "Fotos" }];
    const ok = parse(fields, { fotos: ["att-1", "att-2"] });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ fotos: ["att-1", "att-2"] });
    expect(issues(parse(fields, { fotos: [1] })).length).toBe(1);
  });

  it("geo takes { lat, lng, accuracy } within range", () => {
    const fields: Field[] = [{ key: "geo", type: "geo", label: "Ubicación" }];
    const ok = parse(fields, { geo: { lat: -34.6, lng: -58.4, accuracy: 5 } });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ geo: { lat: -34.6, lng: -58.4, accuracy: 5 } });
    expect(issues(parse(fields, { geo: { lat: 91, lng: 0, accuracy: 5 } }))).toEqual([
      "geo.lat: Too big: expected number to be <=90",
    ]);
    expect(issues(parse(fields, { geo: { lat: 0, lng: 0, accuracy: -1 } }))).toEqual([
      "geo.accuracy: Too small: expected number to be >=0",
    ]);
  });

  it("group takes an object, or a list of objects when repeatable", () => {
    const single: Field[] = [
      {
        key: "vehiculo",
        type: "group",
        label: "Vehículo",
        fields: [{ key: "dominio", type: "text", label: "Dominio" }],
      },
    ];
    const repeatable: Field[] = [
      {
        key: "vehiculo",
        type: "group",
        label: "Vehículo",
        repeatable: true,
        fields: [{ key: "dominio", type: "text", label: "Dominio" }],
      },
    ];
    const one = parse(single, { vehiculo: { dominio: "AB 123" } });
    expect(one.success).toBe(true);
    if (one.success) expect(one.data).toEqual({ vehiculo: { dominio: "AB 123" } });
    const many = parse(repeatable, { vehiculo: [{ dominio: "AB 123" }, { dominio: "CD 456" }] });
    expect(many.success).toBe(true);
    if (many.success)
      expect(many.data).toEqual({ vehiculo: [{ dominio: "AB 123" }, { dominio: "CD 456" }] });
  });
});

describe("compile: required fields", () => {
  it("fails with a 'required' issue when a required field is missing", () => {
    const fields: Field[] = [{ key: "dominio", type: "text", label: "Dominio", required: true }];
    expect(issues(parse(fields, {}))).toEqual(["dominio: required"]);
  });

  it("treats an empty string as missing for a required field", () => {
    const fields: Field[] = [{ key: "dominio", type: "text", label: "Dominio", required: true }];
    expect(issues(parse(fields, { dominio: "" }))).toEqual(["dominio: required"]);
  });

  it("leaves a missing optional field out of the output", () => {
    const fields: Field[] = [{ key: "notas", type: "text", label: "Notas" }];
    const ok = parse(fields, {});
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({});
  });
});

describe("compile: visibleIf", () => {
  const hiddenRequired: Field[] = [
    {
      key: "detalle",
      type: "text",
      label: "Detalle",
      required: true,
      visibleIf: { "==": [{ var: "mostrar" }, true] },
    },
  ];

  it("never requires a hidden field", () => {
    const ok = parse(hiddenRequired, {});
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({});
  });

  it("strips a hidden field from the output even when it has a value", () => {
    const ok = parse(hiddenRequired, { mostrar: false, detalle: "algo" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({});
  });

  it("keeps a visible field", () => {
    const ok = parse(hiddenRequired, { mostrar: true, detalle: "algo" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ detalle: "algo" });
  });

  it("strips a hidden group with its content", () => {
    const fields: Field[] = [
      {
        key: "vehiculo",
        type: "group",
        label: "Vehículo",
        visibleIf: { "==": [{ var: "mostrar" }, true] },
        fields: [{ key: "dominio", type: "text", label: "Dominio", required: true }],
      },
    ];
    const hidden = parse(fields, { mostrar: false, vehiculo: { dominio: "AB 123" } });
    expect(hidden.success).toBe(true);
    if (hidden.success) expect(hidden.data).toEqual({});
    const visible = parse(fields, { mostrar: true, vehiculo: { dominio: "AB 123" } });
    expect(visible.success).toBe(true);
    if (visible.success) expect(visible.data).toEqual({ vehiculo: { dominio: "AB 123" } });
  });

  it("hides a field inside a group by a sibling of the same item", () => {
    const fields: Field[] = [
      {
        key: "vehiculo",
        type: "group",
        label: "Vehículo",
        fields: [
          { key: "presion", type: "number", label: "Presión" },
          {
            key: "nota",
            type: "text",
            label: "Nota",
            visibleIf: { "<": [{ var: "presion" }, 100] },
          },
        ],
      },
    ];
    const hidden = parse(fields, { vehiculo: { presion: 150, nota: "no aplica" } });
    expect(hidden.success).toBe(true);
    if (hidden.success) expect(hidden.data).toEqual({ vehiculo: { presion: 150 } });
    const visible = parse(fields, { vehiculo: { presion: 50, nota: "revisar" } });
    expect(visible.success).toBe(true);
    if (visible.success)
      expect(visible.data).toEqual({ vehiculo: { presion: 50, nota: "revisar" } });
  });

  it("hides a field by a checklist item (forms.md DSL example)", () => {
    const fields: Field[] = [
      {
        key: "estado",
        type: "checklist",
        label: "Estado general",
        items: [
          { key: "luces", label: "Luces" },
          { key: "frenos", label: "Frenos" },
        ],
      },
      {
        key: "observaciones",
        type: "textarea",
        label: "Observaciones",
        required: true,
        visibleIf: { "==": [{ var: "estado.frenos" }, false] },
      },
    ];
    const visible = parse(fields, { estado: { frenos: false } });
    expect(issues(visible)).toEqual(["observaciones: required"]);
    const hidden = parse(fields, { estado: { frenos: true } });
    expect(hidden.success).toBe(true);
    if (hidden.success) expect(hidden.data).toEqual({ estado: { luces: false, frenos: true } });
  });
});

describe("compile: repeatable groups", () => {
  const steps: Field[] = [
    {
      key: "pasos",
      type: "group",
      label: "Pasos",
      repeatable: true,
      min: 2,
      max: 3,
      fields: [{ key: "paso", type: "text", label: "Paso", required: true }],
    },
  ];

  it("fails below the minimum number of items", () => {
    expect(issues(parse(steps, { pasos: [{ paso: "uno" }] }))).toEqual([
      "pasos: at least 2 required",
    ]);
  });

  it("fails above the maximum number of items", () => {
    const items = [{ paso: "a" }, { paso: "b" }, { paso: "c" }, { paso: "d" }];
    expect(issues(parse(steps, { pasos: items }))).toEqual(["pasos: at most 3 allowed"]);
  });

  it("accepts exactly min and max items", () => {
    expect(parse(steps, { pasos: [{ paso: "a" }, { paso: "b" }] }).success).toBe(true);
    expect(parse(steps, { pasos: [{ paso: "a" }, { paso: "b" }, { paso: "c" }] }).success).toBe(
      true,
    );
  });

  it("requires at least one item when the group is required", () => {
    const requiredGroup: Field[] = [
      {
        key: "pasos",
        type: "group",
        label: "Pasos",
        repeatable: true,
        required: true,
        fields: [{ key: "paso", type: "text", label: "Paso" }],
      },
    ];
    expect(issues(parse(requiredGroup, {}))).toEqual(["pasos: at least 1 required"]);
  });

  it("validates the fields of every item", () => {
    expect(issues(parse(steps, { pasos: [{ paso: "a" }, {}] }))).toEqual([
      "pasos.1.paso: required",
    ]);
  });
});

describe("compile: photos per record", () => {
  const fields: Field[] = [
    { key: "fotos1", type: "photos", label: "Fotos 1" },
    { key: "fotos2", type: "photos", label: "Fotos 2" },
  ];

  it("accepts 20 photos in total", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `att-${i}`);
    const ok = parse(fields, { fotos1: ids(10), fotos2: ids(10) });
    expect(ok.success).toBe(true);
  });

  it("rejects more than 20 photos in total", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `att-${i}`);
    const result = parse(fields, { fotos1: ids(15), fotos2: ids(6) });
    expect(issues(result)).toContain("(root): at most 20 photos per record");
  });
});

describe("compile: base + extension", () => {
  const base: FormSchema = {
    title: "Base",
    sections: [
      {
        key: "main",
        title: "Main",
        fields: [{ key: "topic", type: "text", label: "Tema", required: true }],
      },
    ],
  };
  const extension: FormExtension = {
    title: "Extension",
    sections: [
      {
        key: "x_extra",
        title: "Extra",
        fields: [{ key: "x_note", type: "text", label: "Nota", required: true, maxLength: 10 }],
      },
    ],
  };

  it("validates the base and the extension together", () => {
    const ok = compileForm(base, extension).safeParse({ topic: "Charla", x_note: "ok" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ topic: "Charla", x_note: "ok" });
  });

  it("fails when a required extension field is missing", () => {
    const result = compileForm(base, extension).safeParse({ topic: "Charla" });
    expect(issues(result)).toEqual(["x_note: required"]);
  });

  it("applies the extension field constraints", () => {
    const result = compileForm(base, extension).safeParse({
      topic: "Charla",
      x_note: "01234567890",
    });
    expect(issues(result)).toEqual(["x_note: Too big: expected string to have <=10 characters"]);
  });

  it("keeps the base valid without an extension", () => {
    const ok = compileForm(base).safeParse({ topic: "Charla" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ topic: "Charla" });
  });
});

describe("compile: unknown keys", () => {
  it("strips payload keys that are not in the schema", () => {
    const fields: Field[] = [{ key: "topic", type: "text", label: "Tema" }];
    const ok = parse(fields, { topic: "Charla", otro: "x", otro_2: { a: 1 } });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ topic: "Charla" });
  });

  it("strips unknown keys inside a group item", () => {
    const fields: Field[] = [
      {
        key: "vehiculo",
        type: "group",
        label: "Vehículo",
        fields: [{ key: "dominio", type: "text", label: "Dominio" }],
      },
    ];
    const ok = parse(fields, { vehiculo: { dominio: "AB 123", extra: true } });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ vehiculo: { dominio: "AB 123" } });
  });
});

describe("visibleIf over checklist defaults (forms.md DSL example)", () => {
  const schema = {
    title: "Check-list de camioneta",
    sections: [
      {
        key: "vehiculo",
        title: "Vehículo",
        fields: [
          {
            key: "estado",
            type: "checklist",
            label: "Estado general",
            items: [{ key: "frenos", label: "Frenos" }],
          },
          {
            key: "observaciones",
            type: "textarea",
            label: "Observaciones",
            required: true,
            visibleIf: { "==": [{ var: "estado.frenos" }, false] },
          },
        ],
      },
    ],
  } as unknown as FormSchema;

  it("treats an unchecked (missing) checklist item as false", () => {
    const res = compileForm(schema).safeParse({ estado: {} });
    expect(res.success).toBe(false);
    const ok = compileForm(schema).safeParse({ estado: {}, observaciones: "Pastillas gastadas" });
    expect(ok.success).toBe(true);
    expect(ok.data).toMatchObject({ observaciones: "Pastillas gastadas" });
  });

  it("hides the field when the item is checked", () => {
    const res = compileForm(schema).safeParse({ estado: { frenos: true }, observaciones: "x" });
    expect(res.success).toBe(true);
    expect(res.data).not.toHaveProperty("observaciones");
  });
});
