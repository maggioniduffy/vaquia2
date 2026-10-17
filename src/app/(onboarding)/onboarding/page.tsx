import { redirect } from "next/navigation";
import { VaquiaWordmark } from "@/components/ui/brand";
import { t } from "@/i18n/es-AR";
import { getSession, homePathFor } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const session = await getSession();
  if (session.isGuest) redirect("/");
  if (session.active) redirect(homePathFor(session.active.role));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[360px] flex-col justify-center px-4 py-12">
      <div className="border-border bg-surface flex flex-col gap-6 rounded-[var(--radius-panel)] border p-6">
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-3">
            <VaquiaWordmark />
            <span className="text-muted font-mono text-xs">{t.auth.tagline}</span>
          </p>
          <h1 className="text-xl font-medium">{t.onboarding.title}</h1>
        </div>
        <OnboardingForm />
      </div>
    </main>
  );
}
