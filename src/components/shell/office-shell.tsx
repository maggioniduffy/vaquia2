import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n/es-AR";
import type { Session } from "@/lib/session";
import { CompanySwitcher } from "./company-switcher";
import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";

const NAV = [
  { href: "/dashboard", label: t.nav.office.dashboard },
  { href: "/records", label: t.nav.office.records },
  { href: "/people", label: t.nav.office.people },
  { href: "/actions", label: t.nav.office.actions },
  { href: "/reports", label: t.nav.office.reports },
  { href: "/settings", label: t.nav.office.settings },
] as const;

export function OfficeShell({ session, children }: { session: Session; children: ReactNode }) {
  const { active, companies } = session;
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-border flex shrink-0 flex-col gap-6 border-b px-4 py-4 md:sticky md:top-0 md:h-dvh md:w-56 md:border-r md:border-b-0">
        <div className="flex flex-col gap-1">
          <span className="text-base font-medium">{t.app.name}</span>
          {companies.length > 1 ? (
            <CompanySwitcher companies={companies} />
          ) : (
            <span className="text-muted text-sm" data-testid="company-name">
              {active?.name}
            </span>
          )}
        </div>
        <nav
          aria-label={t.app.name}
          className="flex flex-row flex-wrap gap-x-4 gap-y-2 md:flex-col"
        >
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} className="text-sm">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:mt-auto md:flex-col md:items-start">
          <Link href="/field" className="text-muted hover:text-text text-sm">
            {t.nav.toField}
          </Link>
          <span className="text-muted truncate text-xs">{session.email}</span>
          {active ? <span className="text-muted text-xs">{t.roles[active.role]}</span> : null}
          <SignOutButton />
        </div>
      </aside>
      <main className="w-full max-w-[1200px] flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
