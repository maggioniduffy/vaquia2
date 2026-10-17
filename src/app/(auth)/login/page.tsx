import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { VaquiaWordmark } from "@/components/ui/brand";
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
    <main className="mx-auto flex min-h-dvh w-full max-w-[360px] flex-col justify-center px-4 py-12">
      <div className="border-border bg-surface flex flex-col gap-6 rounded-[var(--radius-panel)] border p-6">
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-3">
            <VaquiaWordmark />
            <span className="text-muted font-mono text-xs">{t.auth.tagline}</span>
          </p>
          <h1 className="text-xl font-medium">{t.auth.title}</h1>
        </div>
        <LoginForm
          next={safeNextPath(next)}
          guestEnabled={env.guestLoginEnabled}
          googleEnabled={env.googleEnabled}
        />
      </div>
    </main>
  );
}
