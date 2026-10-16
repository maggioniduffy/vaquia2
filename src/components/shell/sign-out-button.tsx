import { t } from "@/i18n/es-AR";
import { signOut } from "@/lib/actions/auth";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut}>
      <button type="submit" className={className ?? "text-muted hover:text-text text-sm"}>
        {t.auth.signOut}
      </button>
    </form>
  );
}
