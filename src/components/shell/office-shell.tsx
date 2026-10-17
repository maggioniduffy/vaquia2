import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { VaquiaWordmark } from "@/components/ui/brand";
import { BellIcon, ChevronDownIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { t } from "@/i18n/es-AR";
import { displayNameFromEmail, initials } from "@/lib/office/greeting";
import { countHabilitaciones } from "@/lib/office/queries";
import type { Session } from "@/lib/session";
import pkg from "../../../package.json";
import { CompanySwitcher } from "./company-switcher";
import { MobileMenu } from "./mobile-menu";
import { OfficeNav } from "./office-nav";
import { OfficeSearch } from "./office-search";
import { UserMenu } from "./user-menu";

export async function OfficeShell({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const { active, companies } = session;
  const habilitaciones = await countHabilitaciones(session.userId);
  const themeCookie = (await cookies()).get("theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;
  const name = displayNameFromEmail(session.email);
  const role = active ? t.roles[active.role] : undefined;
  const counts = { "/people/fitness": habilitaciones };

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-border sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r md:flex">
        <div className="border-border flex h-16 shrink-0 items-center gap-3 border-b px-6">
          <VaquiaWordmark />
          <span aria-hidden className="bg-border h-4 w-px" />
          <span className="text-muted text-xs">{t.officeShell.tagline}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <OfficeNav counts={counts} />
        </div>
        <div className="border-border flex flex-col gap-2 border-t px-6 py-4 text-xs">
          <span className="text-muted flex items-center gap-2">
            <span aria-hidden className="bg-accent size-1.5 rounded-full" />
            {t.sync.synced}
          </span>
          <span className="text-muted font-mono">{t.officeShell.version(pkg.version)}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-bg sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b px-4 md:static md:z-auto md:gap-4 md:bg-transparent md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:hidden">
            <MobileMenu
              counts={counts}
              companies={companies}
              name={name}
              initials={initials(name)}
              role={role}
              theme={theme}
              version={pkg.version}
            />
            <VaquiaWordmark />
          </div>
          {companies.length > 1 ? (
            <div className="hidden md:block">
              <CompanySwitcher companies={companies} />
            </div>
          ) : (
            <div className="border-border bg-surface hidden h-10 min-w-0 items-center gap-3 rounded-[var(--radius-control)] border px-3 md:flex">
              <span className="truncate font-medium" data-testid="company-name">
                {active?.name}
              </span>
              <ChevronDownIcon size={16} className="text-muted shrink-0" />
            </div>
          )}
          <OfficeSearch />
          <Link
            href="/dashboard"
            aria-label={t.officeShell.notifications}
            title={t.officeShell.notifications}
            className="border-border text-text hover:bg-hover inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border"
          >
            <BellIcon size={18} />
          </Link>
          <div className="hidden items-center gap-4 md:flex">
            <ThemeToggle className="size-10 shrink-0" initial={theme} />
            <UserMenu name={name} initials={initials(name)} role={role} />
          </div>
        </header>
        <main className="w-full min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
