import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FieldShell } from "@/components/shell/field-shell";
import { NoMembership } from "@/components/shell/no-membership";
import { getSession } from "@/lib/session";

export default async function FieldLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.active) {
    if (!session.isGuest) redirect("/onboarding");
    return <NoMembership />;
  }
  return <FieldShell session={session}>{children}</FieldShell>;
}
