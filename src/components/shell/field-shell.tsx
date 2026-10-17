import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n/es-AR";
import { weekdayDayMonth } from "@/lib/field/format";
import { getFieldToday } from "@/lib/field/today";
import type { Session } from "@/lib/session";
import { FieldHeader } from "./field-header";
import { InvitationsNotice } from "./invitations-notice";
import { TrialBanner } from "./trial-banner";
import { SignOutButton } from "./sign-out-button";

// No tab bar: "Hoy" (/field) is the hub; inner pages get a back arrow in the header.
export async function FieldShell({ session, children }: { session: Session; children: ReactNode }) {
  const canOffice = session.active && !["worker", "supervisor"].includes(session.active.role);
  const today = await getFieldToday(session.userId);
  const who = today.personaName ?? session.email.split("@")[0] ?? session.email;
  const end = canOffice ? (
    <Link
      href="/dashboard"
      className="text-muted hover:text-text flex min-h-12 shrink-0 items-center px-1 text-sm"
    >
      {t.field.toOffice}
    </Link>
  ) : (
    <SignOutButton className="text-muted hover:text-text min-h-12 shrink-0 px-1 text-sm" />
  );
  return (
    <div className="flex min-h-dvh flex-col text-base">
      <TrialBanner userId={session.userId} />
      <InvitationsNotice userId={session.userId} isGuest={session.isGuest} />
      <FieldHeader homeSubtitle={`${weekdayDayMonth()} · ${who}`} end={end} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
