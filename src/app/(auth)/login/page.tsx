import { t } from "@/i18n/es-AR";
import { safeNextPath } from "@/lib/routes";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-12">
      <p className="text-muted text-sm">{t.app.name}</p>
      <h1 className="mt-1 mb-8 text-xl font-medium">{t.auth.title}</h1>
      <LoginForm
        next={safeNextPath(next)}
        initialError={error === "link" ? t.auth.linkExpired : undefined}
      />
    </main>
  );
}
