"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/i18n/es-AR";
import { cn } from "@/lib/cn";
import { activeNavHref, OFFICE_NAV } from "./office-nav-config";

export function OfficeNav({ counts }: { counts: Partial<Record<string, number>> }) {
  const active = activeNavHref(usePathname());
  return (
    <nav
      aria-label={t.officeShell.mainNav}
      className="flex w-full flex-row gap-0.5 overflow-x-auto md:flex-col md:overflow-visible"
    >
      {OFFICE_NAV.map((item) => {
        const isActive = item.href === active;
        const count = counts[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center justify-between gap-3 rounded-[var(--radius-control)] px-2.5 whitespace-nowrap",
              isActive
                ? "bg-accent-subtle text-accent font-medium"
                : "text-muted hover:bg-hover hover:text-text",
            )}
          >
            <span>{item.label}</span>
            {count ? <span className="text-muted font-mono text-xs">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Breadcrumb tail: the active nav item's label. */
export function OfficeTitle() {
  const active = activeNavHref(usePathname());
  const item = OFFICE_NAV.find((n) => n.href === active);
  if (!item) return null;
  return (
    <div className="text-muted hidden items-center gap-2 md:flex">
      <span>/</span>
      <span className="text-text">{item.label}</span>
    </div>
  );
}
