import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { VaquiaWordmark } from "@/components/ui/brand";
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
    <main className="mx-auto flex min-h-dvh w-full max-w-[360px] flex-col justify-center px-4 py-12">
      <div className="border-border bg-surface flex flex-col gap-6 rounded-[var(--radius-panel)] border p-6">
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-3">
            <VaquiaWordmark />
            <span className="text-muted font-mono text-xs">{t.auth.tagline}</span>
          </p>
          <h1 className="text-xl font-medium">{t.auth.signUpTitle}</h1>
        </div>
        {isGuest ? (
          <form action={leaveDemo}>
            <Button type="submit" variant="primary" size="touch" className="w-full">
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
      </div>
    </main>
  );
}
