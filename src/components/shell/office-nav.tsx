"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { t } from "@/i18n/es-AR";
import { cn } from "@/lib/cn";
import { activeNavHref, OFFICE_NAV } from "./office-nav-config";

export function OfficeNav({
  counts,
  onNavigate,
}: {
  counts: Partial<Record<string, ReactNode>>;
  onNavigate?: () => void;
}) {
  const active = activeNavHref(usePathname());
  return (
    <nav aria-label={t.officeShell.mainNav} className="flex w-full flex-col gap-1">
      {OFFICE_NAV.map(({ href, label, icon: Icon }) => {
        const isActive = href === active;
        const count = counts[href];
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex h-10 shrink-0 items-center gap-3 rounded-r-[var(--radius-control)] border-l-2 pr-3 pl-2.5 whitespace-nowrap",
              isActive
                ? "border-accent bg-accent-subtle text-accent-strong font-medium"
                : "text-text hover:bg-hover border-transparent",
            )}
          >
            <Icon size={20} className="shrink-0" />
            <span className="flex-1">{label}</span>
            {count}
          </Link>
        );
      })}
    </nav>
  );
}
