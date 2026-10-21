import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { t } from "@/i18n/es-AR";
import { noCompanyPath } from "@/lib/invitations";
import { getAuthSession, homePathFor, getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: t.landing.meta.title,
  description: t.landing.meta.description,
};

export default async function Home() {
  // Not getSession(): it redirects to /login when there is no session, and "/" is public.
  const raw = await getAuthSession();
  if (raw) {
    const session = await getSession();
    if (!session.active && !session.isGuest) redirect(await noCompanyPath(session));
    redirect(homePathFor(session.active?.role));
  }
  return <LandingPage />;
}
