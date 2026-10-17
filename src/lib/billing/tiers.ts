// Single source of truth for plans. Prices are illustrative (ARS, + IVA).
export const TIERS = [
  { id: "base", personaLimit: 25, monthlyArs: 95000 },
  { id: "pro", personaLimit: 100, monthlyArs: 220000, highlighted: true },
  { id: "premium", personaLimit: null, monthlyArs: 420000 },
] as const;

export type Tier = (typeof TIERS)[number];
export type TierId = Tier["id"];

/** Annual price: 10 months (2 months free). */
export function annualArs(tier: Pick<Tier, "monthlyArs">): number {
  return tier.monthlyArs * 10;
}

/** Per-month equivalent of the annual price, rounded. */
export function annualMonthlyEquivalent(tier: Pick<Tier, "monthlyArs">): number {
  return Math.round(annualArs(tier) / 12);
}

const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatArs(n: number): string {
  return ars.format(n);
}
