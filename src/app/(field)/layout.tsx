import type { ReactNode } from "react";
import { FieldShell } from "@/components/shell/field-shell";
import { NoMembership } from "@/components/shell/no-membership";
import { getSession } from "@/lib/session";

export default async function FieldLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.active) return <NoMembership />;
  return <FieldShell session={session}>{children}</FieldShell>;
}
