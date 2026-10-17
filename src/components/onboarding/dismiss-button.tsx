"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n/es-AR";
import { dismissOnboarding } from "@/lib/onboarding/dismiss-action";

export function DismissButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex items-center gap-3">
      {error ? <span className="text-muted text-xs">{error}</span> : null}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await dismissOnboarding();
            setError(res.error);
          })
        }
      >
        {t.onboardingChecklist.dismiss}
      </Button>
    </div>
  );
}
