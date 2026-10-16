import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n/es-AR";
import type { Session } from "@/lib/session";
import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";

// Max 4 items; touch targets ≥ 48px.
const NAV = [
  { href: "/field", label: t.nav.field.home, exact: true },
  { href: "/field/capture", label: t.nav.field.capture, exact: false },
  { href: "/field/actions", label: t.nav.field.actions, exact: false },
  { href: "/field/sync", label: t.nav.field.sync, exact: false },
] as const;

export function FieldShell({ session, children }: { session: Session; children: ReactNode }) {
  const canOffice = session.active && !["worker", "supervisor"].includes(session.active.role);
  return (
    <div className="flex min-h-dvh flex-col pb-16">
      <header className="border-border flex h-12 items-center justify-between border-b px-4">
        <span className="text-sm font-medium" data-testid="company-name">
          {session.active?.name}
        </span>
        {canOffice ? (
          <Link href="/dashboard" className="text-muted flex min-h-12 items-center text-sm">
            {t.nav.toOffice}
          </Link>
        ) : (
          <SignOutButton className="text-muted min-h-12 text-sm" />
        )}
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
      <nav
        aria-label={t.app.name}
        className="border-border bg-bg fixed inset-x-0 bottom-0 grid h-16 grid-cols-4 border-t"
      >
        {NAV.map((item) => (
          <FieldNavItem key={item.href} href={item.href} label={item.label} exact={item.exact} />
        ))}
      </nav>
    </div>
  );
}

function FieldNavItem({ href, label, exact }: { href: string; label: string; exact: boolean }) {
  return (
    <NavLink
      href={href}
      exact={exact}
      className="flex min-h-12 items-center justify-center px-1 text-center text-xs"
    >
      {label}
    </NavLink>
  );
}
