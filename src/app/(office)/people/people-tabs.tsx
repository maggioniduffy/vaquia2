"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "@/components/shell/nav-link";
import { t } from "@/i18n/es-AR";

const TABS = [
  { href: "/people", label: t.people.tabs.people, exact: true },
  { href: "/people/crews", label: t.people.tabs.crews, exact: false },
  { href: "/people/locations", label: t.people.tabs.locations, exact: false },
  { href: "/people/import", label: t.people.tabs.import, exact: false },
] as const;

/** Sub-navigation of the Personal section. Hidden on the fitness matrix (own nav item). */
export function PeopleTabs() {
  const pathname = usePathname();
  if (pathname.startsWith("/people/fitness")) return null;
  return (
    <nav
      aria-label={t.people.tabs.label}
      className="border-border mb-4 flex gap-x-6 overflow-x-auto border-b text-sm"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.href}
          href={tab.href}
          exact={tab.exact}
          activeClassName="text-text border-accent font-medium"
          className="-mb-px inline-flex min-h-12 items-center border-b-2 border-transparent whitespace-nowrap md:min-h-10"
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
