"use client";

import { useTransition } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { t } from "@/i18n/es-AR";
import { switchCompany } from "@/lib/actions/company";
import { initials } from "@/lib/office/greeting";
import type { CompanyMembership } from "@/lib/session";

// Rendered only when the user has more than one membership. Styled as the header company chip.
export function CompanySwitcher({ companies }: { companies: CompanyMembership[] }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const active = companies.find((c) => c.isActive);

  return (
    <div className="relative min-w-0">
      <span
        aria-hidden
        className="bg-text text-bg pointer-events-none absolute top-1/2 left-2.5 flex size-[18px] -translate-y-1/2 items-center justify-center rounded-[4px] font-mono text-[10px] font-semibold"
      >
        {initials(active?.name ?? "")}
      </span>
      <select
        aria-label={t.company.switcherLabel}
        className="border-border bg-surface h-8 w-full max-w-[220px] min-w-0 appearance-none truncate rounded-[var(--radius-control)] border pr-8 pl-9 font-medium"
        value={active?.companyId}
        disabled={pending}
        onChange={(event) => {
          const target = event.target.value;
          startTransition(async () => {
            const { ok } = await switchCompany(target);
            if (!ok) toast(t.company.switchError, "danger");
          });
        }}
      >
        {companies.map((c) => (
          <option key={c.companyId} value={c.companyId}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        size={14}
        className="text-muted pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
      />
    </div>
  );
}
