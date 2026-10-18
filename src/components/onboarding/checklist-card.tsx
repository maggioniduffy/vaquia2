import Link from "next/link";
import { CheckIcon, ChevronRightIcon } from "@/components/ui/icons";
import { t } from "@/i18n/es-AR";
import type { Checklist, ChecklistKey } from "@/lib/onboarding/checklist";
import { DismissButton } from "./dismiss-button";

const ITEMS: { key: ChecklistKey; href: string }[] = [
  { key: "team", href: "/people" },
  { key: "people", href: "/people/import" },
  { key: "crews", href: "/people/crews" },
  { key: "locations", href: "/people/locations" },
];

export function ChecklistCard({ checklist }: { checklist: Checklist }) {
  const c = t.onboardingChecklist;
  return (
    <section
      data-testid="onboarding-checklist"
      className="border-border bg-surface rounded-[var(--radius-panel)] border"
    >
      <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-medium">{c.title}</h2>
          <span className="text-muted font-mono text-xs">{c.progress(checklist.doneCount, 4)}</span>
        </div>
        <DismissButton />
      </div>
      <ul>
        {ITEMS.map(({ key, href }) => {
          const done = checklist.items[key];
          return (
            <li key={key} className="border-border border-b last:border-b-0">
              <Link
                href={href}
                className="hover:bg-hover hover:text-text flex items-center gap-3 px-5 py-2.5"
              >
                <span
                  aria-hidden
                  className={
                    done
                      ? "text-accent flex size-4 items-center justify-center"
                      : "border-border size-4 rounded-full border"
                  }
                >
                  {done ? <CheckIcon size={16} /> : null}
                </span>
                <span className={done ? "text-muted flex-1 line-through" : "flex-1"}>
                  {c.items[key]}
                </span>
                <ChevronRightIcon size={14} className="text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
