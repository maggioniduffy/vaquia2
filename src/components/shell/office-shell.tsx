import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { BellIcon, ChevronDownIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { t } from "@/i18n/es-AR";
import { displayNameFromEmail, initials } from "@/lib/office/greeting";
import { countHabilitaciones } from "@/lib/office/queries";
import type { Session } from "@/lib/session";
import { version } from "../../../package.json";
import { CompanySwitcher } from "./company-switcher";
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

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-border flex shrink-0 flex-col border-b md:sticky md:top-0 md:h-dvh md:w-56 md:border-r md:border-b-0">
        <div className="border-border flex h-16 shrink-0 items-center gap-3 px-4 md:border-b md:px-6">
          <span className="text-lg font-medium tracking-tight">{t.app.name}</span>
          <span aria-hidden className="bg-border h-4 w-px" />
          <span className="text-muted text-xs">{t.officeShell.tagline}</span>
        </div>
        <div className="px-3 pb-2 md:flex-1 md:overflow-y-auto md:py-4">
          <OfficeNav counts={{ "/people/fitness": habilitaciones }} />
        </div>
        <div className="border-border hidden flex-col gap-2 border-t px-6 py-4 text-xs md:flex">
          <span className="text-muted flex items-center gap-2">
            <span aria-hidden className="bg-accent size-1.5 rounded-full" />
            {t.sync.synced}
          </span>
          <span className="text-muted font-mono">{t.officeShell.version(version)}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex h-16 shrink-0 items-center gap-3 border-b px-4 md:gap-4 md:px-6">
          {companies.length > 1 ? (
            <CompanySwitcher companies={companies} />
          ) : (
            <div className="border-border bg-surface flex h-10 min-w-0 items-center gap-3 rounded-[var(--radius-control)] border px-3">
              <span className="truncate font-medium" data-testid="company-name">
                {active?.name}
              </span>
              <ChevronDownIcon size={16} className="text-muted shrink-0" />
            </div>
          )}
          <OfficeSearch />
          <div className="flex-1 md:hidden" />
          <Link
            href="/dashboard"
            aria-label={t.officeShell.notifications}
            title={t.officeShell.notifications}
            className="border-border text-text hover:bg-hover inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border"
          >
            <BellIcon size={18} />
          </Link>
          <ThemeToggle className="size-10 shrink-0" initial={theme} />
          <UserMenu
            name={name}
            initials={initials(name)}
            role={active ? t.roles[active.role] : undefined}
          />
        </header>
        <main className="w-full min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
