import type { ReactNode } from "react";
import { NavLink } from "@/components/shell/nav-link";
import { PageHeader } from "@/components/shell/page-header";
import { t } from "@/i18n/es-AR";

const TABS = [
  { href: "/people", label: t.people.tabs.people, exact: true },
  { href: "/people/crews", label: t.people.tabs.crews, exact: false },
  { href: "/people/locations", label: t.people.tabs.locations, exact: false },
  { href: "/people/fitness", label: t.people.tabs.fitness, exact: false },
  { href: "/people/import", label: t.people.tabs.import, exact: false },
] as const;

export default function PeopleLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title={t.nav.office.people} />
      <nav
        aria-label={t.people.tabs.label}
        className="border-border -mt-2 mb-6 flex gap-x-6 overflow-x-auto border-b text-sm"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.href}
            href={tab.href}
            exact={tab.exact}
            className="inline-flex min-h-12 items-center whitespace-nowrap md:min-h-10"
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </>
  );
}
