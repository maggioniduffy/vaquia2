import { describe, expect, it } from "vitest";
import { t } from "./es-AR";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("es-AR dictionary", () => {
  it("has no empty strings", () => {
    expect(strings(t).every((s) => s.trim().length > 0)).toBe(true);
  });

  it('does not use "vos" forms (design.md#Copy)', () => {
    const voseo = /\b(tenés|podés|querés|sos|ingresá|revisá|elegí)\b/i;
    expect(strings(t).filter((s) => voseo.test(s))).toEqual([]);
  });
});
