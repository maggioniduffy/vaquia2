import { describe, expect, it } from "vitest";
import { formatCuit, isValidCuit, normalizeCuit } from "./cuit";

// Check digits computed by hand from the AFIP mod-11 algorithm (weights 5,4,3,2,7,6,5,4,3,2).
const VALID = [
  "20123456786", // prefix 20
  "23123456785", // prefix 23
  "27123456780", // prefix 27, remainder 0 => check digit 0
  "30123456781", // prefix 30 (company)
  "33123456780", // prefix 33
  "34123456787", // prefix 34
  "24123456781", // prefix 24
  "20000000001", // total 10 => rest 10 => check digit 1
];

describe("isValidCuit", () => {
  it.each(VALID)("accepts a valid CUIT %s", (cuit) => {
    expect(isValidCuit(cuit)).toBe(true);
  });

  it("accepts the dashed form and ignores surrounding noise", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
    expect(isValidCuit(" 20-12345678-6 ")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidCuit("20123456787")).toBe(false);
    expect(isValidCuit("20123456780")).toBe(false);
  });

  it("rejects a valid-looking body with a prefix outside the AFIP list", () => {
    // 21123456782 has a correct mod-11 check digit; only the prefix is wrong.
    expect(isValidCuit("21123456782")).toBe(false);
    expect(isValidCuit("99123456782")).toBe(false);
  });

  it("rejects bodies whose check digit would be 10 (no digit is valid)", () => {
    // Weighted total of 2000000001 leaves remainder 1, so 11 - 1 = 10: no CUIT exists for it.
    for (let digit = 0; digit <= 9; digit++) {
      expect(isValidCuit(`2000000001${digit}`)).toBe(false);
    }
  });

  it("maps a remainder of 0 to check digit 0 (not 11)", () => {
    // Weighted total of 2000000006 is a multiple of 11: only check digit 0 is valid.
    expect(isValidCuit("20000000060")).toBe(true);
    for (let digit = 1; digit <= 9; digit++) {
      expect(isValidCuit(`2000000006${digit}`)).toBe(false);
    }
  });

  it("rejects wrong lengths and empty input", () => {
    expect(isValidCuit("")).toBe(false);
    expect(isValidCuit("2012345678")).toBe(false); // 10 digits
    expect(isValidCuit("201234567866")).toBe(false); // 12 digits
  });
});

describe("normalizeCuit", () => {
  it("strips everything but digits", () => {
    expect(normalizeCuit("20-12345678-6")).toBe("20123456786");
    expect(normalizeCuit(" 20 12345678 6 ")).toBe("20123456786");
    expect(normalizeCuit("abc")).toBe("");
  });
});

describe("formatCuit", () => {
  it("formats 11 digits as XX-XXXXXXXX-X", () => {
    expect(formatCuit("20123456786")).toBe("20-12345678-6");
    expect(formatCuit("20-12345678-6")).toBe("20-12345678-6");
  });

  it("returns the bare digits when they are not 11 long", () => {
    expect(formatCuit("2012-345")).toBe("2012345");
    expect(formatCuit("")).toBe("");
  });
});
