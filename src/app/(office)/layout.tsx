import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NoMembership } from "@/components/shell/no-membership";
import { OfficeShell } from "@/components/shell/office-shell";
import { noCompanyPath } from "@/lib/invitations";
import { getSession } from "@/lib/session";

export default async function OfficeLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.active) {
    if (!session.isGuest) redirect(await noCompanyPath(session));
    return <NoMembership />;
  }
  return <OfficeShell session={session}>{children}</OfficeShell>;
}
