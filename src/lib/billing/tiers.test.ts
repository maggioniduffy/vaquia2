import { describe, expect, it } from "vitest";
import { TIERS, annualArs, annualMonthlyEquivalent, formatArs } from "./tiers";

describe("tiers", () => {
  it("annual is 10x monthly", () => {
    for (const tier of TIERS) expect(annualArs(tier)).toBe(tier.monthlyArs * 10);
  });
  it("annual monthly equivalent is rounded", () => {
    expect(annualMonthlyEquivalent(TIERS[0])).toBe(79167);
  });
  it("formats ARS without decimals", () => {
    expect(formatArs(95000).replace(/\s/g, " ")).toBe("$ 95.000");
    expect(formatArs(950000).replace(/\s/g, " ")).toBe("$ 950.000");
  });
});
