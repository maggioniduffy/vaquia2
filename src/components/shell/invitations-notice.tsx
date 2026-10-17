import Link from "next/link";
import { t } from "@/i18n/es-AR";
import { listMyInvitations } from "@/lib/invitations";

export async function InvitationsNotice({ userId, isGuest }: { userId: string; isGuest: boolean }) {
  if (isGuest) return null;
  const pending = await listMyInvitations(userId);
  if (pending.length === 0) return null;
  return (
    <div
      role="status"
      className="border-border bg-surface flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-xs md:px-6"
    >
      <span>{t.invitations.notice(pending.length)}</span>
      <Link href="/invitations" className="text-accent underline">
        {t.invitations.noticeLink}
      </Link>
    </div>
  );
}
