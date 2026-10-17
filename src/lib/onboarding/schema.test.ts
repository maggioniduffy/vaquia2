import { describe, expect, it } from "vitest";
import { t } from "@/i18n/es-AR";
import { onboardingSchema } from "./schema";

const e = t.onboarding.errors;
const VALID = {
  fullName: "Ana Pérez",
  dni: "12.345.678",
  companyName: "Mi Empresa SA",
  cuit: "20-12345678-6",
};

function errorsFor(input: Partial<typeof VALID>) {
  const result = onboardingSchema.safeParse({ ...VALID, ...input });
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

describe("onboardingSchema: valid input", () => {
  it("normalizes DNI (dots, spaces, dashes stripped) and CUIT (digits only), trims names", () => {
    const result = onboardingSchema.safeParse({
      fullName: "  Ana Pérez  ",
      dni: "12 345-678",
      companyName: "  Mi Empresa SA ",
      cuit: "20-12345678-6",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        fullName: "Ana Pérez",
        dni: "12345678",
        companyName: "Mi Empresa SA",
        cuit: "20123456786",
      });
    }
  });

  it("accepts a 7-digit DNI and an unformatted CUIT", () => {
    expect(errorsFor({ dni: "1234567", cuit: "23123456785" })).toEqual({});
  });
});

describe("onboardingSchema: persona step (name, DNI)", () => {
  it.each([
    ["empty name", ""],
    ["whitespace-only name", "   "],
    ["one-letter name", "A"],
  ])("rejects %s with the full name message", (_label, fullName) => {
    expect(errorsFor({ fullName })).toEqual({ fullName: e.invalidFullName });
  });

  it("rejects a name longer than 120 characters", () => {
    expect(errorsFor({ fullName: "A".repeat(121) })).toEqual({ fullName: e.invalidFullName });
  });

  it.each([
    ["too short", "123"],
    ["too long", "123456789"],
    ["letters", "abcdefgh"],
    ["empty", ""],
    ["mixed", "12345A78"],
  ])("rejects a DNI that is %s", (_label, dni) => {
    expect(errorsFor({ dni })).toEqual({ dni: e.invalidDni });
  });
});

describe("onboardingSchema: company step (name, CUIT)", () => {
  it("rejects a company name shorter than 2 characters", () => {
    expect(errorsFor({ companyName: " A " })).toEqual({ companyName: e.invalidName });
  });

  it.each([
    ["bad check digit", "20-12345678-7"],
    ["10 digits", "2012345678"],
    ["11 digits outside AFIP prefixes", "21123456782"],
    ["letters", "2012345678X"],
    ["empty", ""],
    // Check digit 10 is not representable in AFIP CUITs.
    ["check digit would be 10", "20-00000001-0"],
  ])("rejects a CUIT that is %s", (_label, cuit) => {
    expect(errorsFor({ cuit })).toEqual({ cuit: e.invalidCuit });
  });
});
