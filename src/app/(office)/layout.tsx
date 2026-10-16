import type { ReactNode } from "react";
import { NoMembership } from "@/components/shell/no-membership";
import { OfficeShell } from "@/components/shell/office-shell";
import { getSession } from "@/lib/session";

export default async function OfficeLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.active) return <NoMembership />;
  return <OfficeShell session={session}>{children}</OfficeShell>;
}
