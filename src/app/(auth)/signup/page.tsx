import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authPrimary, BrandShell } from "@/components/auth/brand-shell";
import { t } from "@/i18n/es-AR";
import { leaveDemo } from "@/lib/actions/auth";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { LoginForm } from "../login/login-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Real session check (a stale cookie must not bounce between / and /login).
  const session = await auth.api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  const isGuest =
    (session?.user as { isAnonymous?: boolean | null } | undefined)?.isAnonymous === true;
  if (session && !isGuest) redirect(safeNextPath(next));
  return (
    <BrandShell title={t.auth.signUpTitle}>
      {isGuest ? (
        <form action={leaveDemo}>
          <Button type="submit" variant="primary" size="md" className={authPrimary}>
            {t.auth.leaveDemo}
          </Button>
        </form>
      ) : (
        <LoginForm
          next={safeNextPath(next)}
          guestEnabled={false}
          googleEnabled={env.googleEnabled}
          mode="signup"
        />
      )}
    </BrandShell>
  );
}
