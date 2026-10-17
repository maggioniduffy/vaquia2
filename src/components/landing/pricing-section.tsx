import { t } from "@/i18n/es-AR";
import { TIERS, annualArs, annualMonthlyEquivalent, formatArs } from "@/lib/billing/tiers";
import { PricingToggle, type PricingCard } from "./pricing-toggle";

const P = t.landing.pricing;
const MONO = "font-mono font-medium";
const GUTTER = "px-4 sm:px-10 min-[68.75rem]:px-20";

export function PricingSection() {
  const cards: PricingCard[] = TIERS.map((tier) => {
    const copy = P.tiers[tier.id];
    return {
      id: tier.id,
      name: copy.name,
      limit: copy.limit,
      extras: [...copy.extras],
      highlighted: "highlighted" in tier && tier.highlighted === true,
      monthly: formatArs(tier.monthlyArs),
      annualMonthly: formatArs(annualMonthlyEquivalent(tier)),
      annualTotal: formatArs(annualArs(tier)),
    };
  });
  return (
    <section
      id="precios"
      className={`mx-auto flex max-w-[1440px] flex-col gap-8 py-16 min-[68.75rem]:gap-10 min-[68.75rem]:py-28 ${GUTTER}`}
    >
      <div className="flex max-w-[640px] flex-col gap-5">
        <span className={`${MONO} text-accent text-[12px] tracking-[0.12em]`}>{P.eyebrow}</span>
        <h2 className="m-0 text-[34px] leading-[1.05] font-semibold tracking-[-0.035em] text-balance min-[68.75rem]:text-[48px]">
          {P.title}
        </h2>
      </div>
      <PricingToggle cards={cards} labels={P.labels} />
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[16px] text-pretty">{P.trialNote}</p>
        <p className="m-0 text-[13px] text-pretty text-[var(--l-muted)]">{P.footnote}</p>
      </div>
    </section>
  );
}
