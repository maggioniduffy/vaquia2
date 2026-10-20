import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ReferenceRefresher } from "@/components/offline/reference-refresher";
import { FieldShell } from "@/components/shell/field-shell";
import { NoMembership } from "@/components/shell/no-membership";
import { noCompanyPath } from "@/lib/invitations";
import { getSession } from "@/lib/session";

export default async function FieldLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.active) {
    if (!session.isGuest) redirect(await noCompanyPath(session));
    return <NoMembership />;
  }
  return (
    <FieldShell session={session}>
      <ReferenceRefresher />
      {children}
    </FieldShell>
  );
}
