"use client";

import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { t } from "@/i18n/es-AR";
import type { CompanyMembership } from "@/lib/session";
import { CompanySwitcher } from "./company-switcher";
import { OfficeNav } from "./office-nav";
import { SignOutButton } from "./sign-out-button";

/** Mobile drawer (< md): sections on top; profile, company and theme at the bottom. */
export function MobileMenu({
  counts,
  companies,
  name,
  initials,
  role,
  theme,
  version,
}: {
  counts: Partial<Record<string, number>>;
  companies: CompanyMembership[];
  name: string;
  initials: string;
  role?: string;
  theme?: "light" | "dark";
  version: string;
}) {
  const [open, setOpen] = useState(false);
  const active = companies.find((c) => c.isActive);
  const row =
    "hover:bg-hover flex h-10 w-full items-center rounded-[var(--radius-control)] px-3 text-left";

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger
        aria-label={t.officeShell.openMenu}
        className="border-border text-text hover:bg-hover inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border"
      >
        <MenuIcon size={20} />
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="bg-scrim fixed inset-0 z-40" />
        <D.Content
          aria-describedby={undefined}
          className="border-border bg-bg fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r shadow-[12px_0_32px_rgba(0,0,0,.12)]"
        >
          <div className="border-border flex h-16 shrink-0 items-center gap-3 border-b pr-3 pl-4">
            <D.Title className="text-lg font-medium tracking-tight">{t.app.name}</D.Title>
            <span aria-hidden className="bg-border h-4 w-px" />
            <span className="text-muted flex-1 text-xs">{t.officeShell.tagline}</span>
            <D.Close
              aria-label={t.common.close}
              className="text-muted hover:bg-hover inline-flex size-10 items-center justify-center rounded-[var(--radius-control)]"
            >
              <CloseIcon size={20} />
            </D.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            <OfficeNav counts={counts} onNavigate={() => setOpen(false)} />
          </div>

          <div className="border-border flex flex-col gap-3 border-t px-3 py-4">
            <div className="flex items-center gap-3 px-3">
              <span
                aria-hidden
                className="border-border bg-surface flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium"
              >
                {initials}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-medium">{name}</span>
                {role ? <span className="text-muted text-xs">{role}</span> : null}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 px-3">
              <span className="text-muted text-xs">{t.officeShell.company}</span>
              {companies.length > 1 ? (
                <CompanySwitcher companies={companies} />
              ) : (
                <span className="truncate font-medium">{active?.name}</span>
              )}
            </div>

            <div className="flex items-center justify-between px-3">
              <span>{t.officeShell.theme}</span>
              <ThemeToggle className="size-10" initial={theme} />
            </div>

            <div className="flex flex-col gap-0.5">
              <Link href="/field" className={row} onClick={() => setOpen(false)}>
                {t.nav.toField}
              </Link>
              <SignOutButton className={`${row} text-text`} />
            </div>

            <span className="text-muted px-3 font-mono text-xs">
              {t.officeShell.version(version)}
            </span>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
