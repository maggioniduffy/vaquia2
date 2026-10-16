import { t } from "@/i18n/es-AR";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className={className ?? "text-muted hover:text-text text-sm"}>
        {t.auth.signOut}
      </button>
    </form>
  );
}
