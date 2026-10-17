import { t } from "@/i18n/es-AR";

export const OFFICE_NAV = [
  { href: "/dashboard", label: t.nav.office.dashboard },
  { href: "/records", label: t.nav.office.records },
  { href: "/actions", label: t.nav.office.actions },
  { href: "/people", label: t.nav.office.people },
  { href: "/people/fitness", label: t.nav.office.qualifications },
  { href: "/kpis", label: t.nav.office.kpis },
  { href: "/close", label: t.nav.office.close },
  { href: "/exports", label: t.nav.office.exports },
  { href: "/settings", label: t.nav.office.settings },
] as const;

/** Longest-prefix match, so /people/fitness wins over /people. */
export function activeNavHref(pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of OFFICE_NAV) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}
