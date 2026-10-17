import Link from "next/link";
import { redirect } from "next/navigation";
import { VaquiaWordmark } from "@/components/ui/brand";
import { t } from "@/i18n/es-AR";
import { listMyInvitations } from "@/lib/invitations";
import { getSession } from "@/lib/session";
import { InvitationActions } from "./invitation-actions";

export default async function InvitationsPage() {
  const session = await getSession();
  if (session.isGuest) redirect("/");
  const invitations = await listMyInvitations(session.userId);
  // Nothing to answer: continue to the company or to onboarding.
  if (invitations.length === 0) redirect("/");
  const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" });
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-4 py-12">
      <div className="border-border bg-surface flex flex-col gap-6 rounded-[var(--radius-panel)] border p-6">
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-3">
            <VaquiaWordmark />
            <span className="text-muted font-mono text-xs">{t.auth.tagline}</span>
          </p>
          <h1 className="text-xl font-medium">{t.invitations.title}</h1>
          <p className="text-muted text-sm">{t.invitations.description(session.email)}</p>
        </div>
        <ul className="flex flex-col gap-4">
          {invitations.map((inv) => (
            <li key={inv.id} className="border-border flex flex-col gap-3 border-t pt-4">
              <div>
                <p className="font-medium">{inv.companyName}</p>
                <p className="text-muted text-xs">
                  {t.invitations.roleLine(t.roles[inv.role], date.format(inv.invitedAt))}
                </p>
              </div>
              <InvitationActions id={inv.id} />
            </li>
          ))}
        </ul>
        {session.active ? null : (
          <Link href="/onboarding" className="text-accent text-sm underline">
            {t.invitations.createOwn}
          </Link>
        )}
      </div>
    </main>
  );
}
