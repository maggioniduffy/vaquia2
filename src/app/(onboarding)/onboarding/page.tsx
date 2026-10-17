import { redirect } from "next/navigation";
import { BrandShell } from "@/components/auth/brand-shell";
import { t } from "@/i18n/es-AR";
import { getSession, homePathFor } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const session = await getSession();
  if (session.isGuest) redirect("/");
  if (session.active) redirect(homePathFor(session.active.role));
  return (
    <BrandShell title={t.onboarding.title}>
      <OnboardingForm />
    </BrandShell>
  );
}
