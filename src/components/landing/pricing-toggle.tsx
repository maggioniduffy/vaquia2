"use client";

import Link from "next/link";
import { useState } from "react";

export type PricingCard = {
  id: string;
  name: string;
  limit: string;
  extras: string[];
  highlighted: boolean;
  monthly: string;
  annualMonthly: string;
  annualTotal: string;
};

type Props = {
  cards: PricingCard[];
  labels: {
    group: string;
    monthly: string;
    annual: string;
    twoFree: string;
    perMonth: string;
    billedAnnually: string;
    popular: string;
    cta: string;
    features: string;
  };
};

const MONO = "font-mono font-medium";

export function PricingToggle({ cards, labels }: Props) {
  const [annual, setAnnual] = useState(false);
  const seg = (active: boolean) =>
    `cursor-pointer rounded-full border-0 px-4 py-2 text-[14px] font-medium ${
      active ? "bg-[var(--l-btn)] text-[var(--l-btn-text)]" : "bg-transparent text-[var(--l-muted)]"
    } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label={labels.group}
          className="inline-flex gap-1 rounded-full border border-[var(--l-border)] p-1"
        >
          <button
            type="button"
            aria-pressed={!annual}
            className={seg(!annual)}
            onClick={() => setAnnual(false)}
          >
            {labels.monthly}
          </button>
          <button
            type="button"
            aria-pressed={annual}
            className={seg(annual)}
            onClick={() => setAnnual(true)}
          >
            {labels.annual}
          </button>
        </div>
        <span
          className={`${MONO} text-accent rounded-full bg-[var(--l-pill)] px-3 py-[6px] text-[12px] tracking-[0.06em]`}
        >
          {labels.twoFree}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[68.75rem]:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.id}
            className={`flex min-w-0 flex-col gap-5 rounded-[14px] border p-6 min-[68.75rem]:p-8 ${
              c.highlighted ? "border-accent border-2" : "border-[var(--l-border)]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[22px] font-semibold tracking-[-0.02em]">{c.name}</div>
              {c.highlighted ? (
                <span
                  className={`${MONO} text-accent rounded-full bg-[var(--l-pill)] px-3 py-[5px] text-[11px] tracking-[0.08em]`}
                >
                  {labels.popular}
                </span>
              ) : null}
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-[34px] leading-none font-semibold tracking-[-0.03em]">
                  {annual ? c.annualMonthly : c.monthly}
                </span>
                <span className="text-[15px] text-[var(--l-muted)]">{labels.perMonth}</span>
              </div>
              <div
                className="mt-2 min-h-[20px] text-[14px] text-[var(--l-muted)]"
                aria-live="polite"
              >
                {annual ? `${c.annualTotal} ${labels.billedAnnually}` : ""}
              </div>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
              <li className="font-medium">{c.limit}</li>
              {c.extras.map((e) => (
                <li key={e} className="text-[var(--l-muted)]">
                  {e}
                </li>
              ))}
            </ul>
            <div className="text-[14px] leading-[1.5] text-pretty text-[var(--l-muted)]">
              {labels.features}
            </div>
            <Link
              href={`/signup?plan=${c.id}`}
              className="lp-btn mt-auto inline-flex items-center justify-center rounded-full bg-[var(--l-btn)] px-5 py-3 text-[15px] font-medium no-underline"
            >
              {labels.cta}
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}
