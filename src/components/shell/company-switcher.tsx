"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { t } from "@/i18n/es-AR";
import { switchCompany } from "@/lib/actions/company";
import type { CompanyMembership } from "@/lib/session";

// Rendered only when the user has more than one membership.
export function CompanySwitcher({ companies }: { companies: CompanyMembership[] }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const active = companies.find((c) => c.isActive);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-xs">{t.company.switcherLabel}</span>
      <select
        className="border-border bg-surface h-9 w-full rounded-[var(--radius-control)] border px-2 text-sm"
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
    </label>
  );
}
