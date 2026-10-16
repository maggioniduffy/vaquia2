import { t } from "@/i18n/es-AR";
import { SignOutButton } from "./sign-out-button";

export function NoMembership() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <p className="text-sm">{t.auth.noMembership}</p>
      <SignOutButton />
    </main>
  );
}
