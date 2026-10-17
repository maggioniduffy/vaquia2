"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n/es-AR";
import { acceptInvitation, declineInvitation, type InvitationResult } from "./actions";

export function InvitationActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (id: string) => Promise<InvitationResult>, goHome: boolean) {
    setError(null);
    startTransition(async () => {
      let result: InvitationResult;
      try {
        result = await action(id);
      } catch {
        result = { ok: false, error: t.invitations.errors.generic };
      }
      if (!result.ok) setError(result.error);
      else if (goHome) router.push("/");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button variant="primary" disabled={pending} onClick={() => run(acceptInvitation, true)}>
          {t.invitations.accept}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => run(declineInvitation, false)}
        >
          {t.invitations.decline}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="border-danger border-l-2 py-1 pl-3 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
