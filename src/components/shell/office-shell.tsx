import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { t } from "@/i18n/es-AR";
import { displayNameFromEmail, initials } from "@/lib/office/greeting";
import { countHabilitaciones } from "@/lib/office/queries";
import type { Session } from "@/lib/session";
import { CompanySwitcher } from "./company-switcher";
import { OfficeNav, OfficeTitle } from "./office-nav";
import { SignOutButton } from "./sign-out-button";

export async function OfficeShell({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const { active, companies } = session;
  const habilitaciones = await countHabilitaciones(session.userId);
  const name = displayNameFromEmail(session.email);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-border flex shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 md:sticky md:top-0 md:h-dvh md:w-56 md:flex-col md:items-stretch md:flex-nowrap md:gap-0 md:border-r md:border-b-0 md:px-3 md:py-4">
        <div className="order-1 flex h-10 flex-1 items-center gap-2 pr-2 pl-2.5 md:mb-4 md:flex-none">
          <span className="text-base font-medium tracking-tight lowercase">{t.app.name}</span>
          <span className="text-muted font-mono text-xs">{t.officeShell.hse}</span>
        </div>
        <div className="order-2 md:order-3 md:border-border md:mt-auto md:border-t md:px-2.5 md:py-3">
          <Link href="/field" className="text-muted hover:text-text text-sm">
            {t.nav.toField}
          </Link>
        </div>
        <div className="order-3 w-full min-w-0 md:order-2 md:w-auto">
          <OfficeNav counts={{ "/people/fitness": habilitaciones }} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex h-14 shrink-0 items-center gap-3 border-b px-4 md:gap-4 md:px-6">
          {companies.length > 1 ? (
            <CompanySwitcher companies={companies} />
          ) : (
            <div className="border-border bg-surface flex h-8 min-w-0 items-center gap-2 rounded-[var(--radius-control)] border px-2.5">
              <span
                aria-hidden
                className="bg-text text-bg flex size-[18px] shrink-0 items-center justify-center rounded-[4px] font-mono text-[10px] font-semibold"
              >
                {initials(active?.name ?? "")}
              </span>
              <span className="truncate font-medium" data-testid="company-name">
                {active?.name}
              </span>
              <ChevronDownIcon size={14} className="text-muted shrink-0" />
            </div>
          )}
          <OfficeTitle />
          <div className="flex-1" />
          <ThemeToggle />
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="border-border bg-surface flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium"
            >
              {initials(name)}
            </span>
            <span className="hidden flex-col leading-tight lg:flex">
              <span className="font-medium">{name}</span>
              {active ? <span className="text-muted text-xs">{t.roles[active.role]}</span> : null}
            </span>
            <SignOutButton />
          </div>
        </header>
        <main className="w-full min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
