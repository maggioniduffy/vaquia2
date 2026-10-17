import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BrandShell } from "@/components/auth/brand-shell";
import { t } from "@/i18n/es-AR";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Real session check (a stale cookie must not bounce between / and /login).
  const session = await auth.api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  if (session) redirect(safeNextPath(next));
  return (
    <BrandShell title={t.auth.title}>
      <LoginForm
        next={safeNextPath(next)}
        guestEnabled={env.guestLoginEnabled}
        googleEnabled={env.googleEnabled}
      />
    </BrandShell>
  );
}
