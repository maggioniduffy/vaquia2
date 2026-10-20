import { describe, expect, it } from "vitest";
import type { Section } from "../dsl";
import { defaultValues } from "./defaults";

const section: Section = {
  key: "main",
  title: "Main",
  fields: [
    { key: "fecha", type: "date", label: "Fecha", default: "now" },
    { key: "hora", type: "time", label: "Hora", default: "now" },
    { key: "tema", type: "text", label: "Tema" },
    { key: "fecha_sin_default", type: "date", label: "Fecha sin default" },
  ],
};

describe("defaultValues (forms.md#Field types: default 'now')", () => {
  it("fills a date and a time field with the current ART date and time", () => {
    // 2026-03-01 02:30 UTC is 2026-02-28 23:30 in Buenos Aires (UTC-3).
    const now = new Date("2026-03-01T02:30:00Z");
    expect(defaultValues([section], now)).toEqual({ fecha: "2026-02-28", hora: "23:30" });
  });

  it("leaves the fields without a 'now' default out", () => {
    const now = new Date("2026-03-01T12:00:00Z");
    const values = defaultValues([section], now);
    expect(values).not.toHaveProperty("tema");
    expect(values).not.toHaveProperty("fecha_sin_default");
  });

  it("ignores date and time fields nested in a group", () => {
    const nested: Section = {
      key: "grupo",
      title: "Grupo",
      fields: [
        {
          key: "vehiculo",
          type: "group",
          label: "Vehículo",
          fields: [{ key: "fecha", type: "date", label: "Fecha", default: "now" }],
        },
      ],
    };
    const now = new Date("2026-03-01T02:30:00Z");
    expect(defaultValues([nested], now)).toEqual({});
  });

  it("returns an empty payload when no field has a 'now' default", () => {
    const plain: Section = {
      key: "main",
      title: "Main",
      fields: [{ key: "tema", type: "text", label: "Tema" }],
    };
    expect(defaultValues([plain], new Date("2026-03-01T12:00:00Z"))).toEqual({});
  });
});
