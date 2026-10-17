import {
  ChartLineIcon,
  DownloadIcon,
  HistoryIcon,
  HomeIcon,
  ListChecksIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SquareCheckIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { t } from "@/i18n/es-AR";

export const OFFICE_NAV = [
  { href: "/dashboard", label: t.nav.office.dashboard, icon: HomeIcon },
  { href: "/records", label: t.nav.office.records, icon: ListChecksIcon },
  { href: "/actions", label: t.nav.office.actions, icon: SquareCheckIcon },
  { href: "/people", label: t.nav.office.people, icon: UsersIcon },
  { href: "/people/fitness", label: t.nav.office.qualifications, icon: ShieldCheckIcon },
  { href: "/kpis", label: t.nav.office.kpis, icon: ChartLineIcon },
  { href: "/close", label: t.nav.office.close, icon: HistoryIcon },
  { href: "/exports", label: t.nav.office.exports, icon: DownloadIcon },
  { href: "/settings", label: t.nav.office.settings, icon: SettingsIcon },
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
