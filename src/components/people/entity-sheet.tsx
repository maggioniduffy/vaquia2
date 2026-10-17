"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { t } from "@/i18n/es-AR";
import type { ActionResult } from "@/lib/people/result";

export type FieldErrors = Record<string, string>;

/** Control class: 48px touch target on mobile, compact on desktop. */
export const controlClass = "h-12 md:h-9";

export function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-muted text-xs">{hint}</p> : null}
      {error ? (
        <p id={`${name}-error`} role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type DeleteConfig = {
  action: () => Promise<ActionResult>;
  label: string;
  confirmLabel: string;
  question: string;
  successMessage: string;
};

/**
 * Side sheet with a form. The server action is authoritative: its result carries the
 * user-facing error (and per-field errors) or `ok`, which closes the sheet and shows a toast.
 */
export function EntitySheet({
  trigger,
  title,
  action,
  successMessage,
  remove,
  children,
}: {
  trigger: ReactNode;
  title: string;
  action: (formData: FormData) => Promise<ActionResult>;
  successMessage: string;
  remove?: DeleteConfig;
  children: (fieldErrors: FieldErrors) => ReactNode;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirming, setConfirming] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    setError(null);
    setFieldErrors({});
    setConfirming(false);
  }

  function handleResult(result: ActionResult, message: string) {
    if (result.ok) {
      toast(message, "success");
      handleOpenChange(false);
      return;
    }
    setError(result.error);
    setFieldErrors(result.fieldErrors ?? {});
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      handleResult(await action(formData), successMessage);
    });
  }

  function onDelete() {
    if (!remove) return;
    startTransition(async () => {
      const result = await remove.action();
      if (!result.ok) setConfirming(false);
      handleResult(result, remove.successMessage);
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent title={title}>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {children(fieldErrors)}

          {error ? (
            <p role="alert" className="border-danger border-l-2 pl-3 text-sm">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 pt-2 md:flex-row-reverse md:justify-start">
            <Button
              type="submit"
              variant="primary"
              size="touch"
              disabled={pending}
              className="md:h-9 md:text-sm"
            >
              {t.common.save}
            </Button>
            <SheetClose asChild>
              <Button variant="ghost" size="touch" disabled={pending} className="md:h-9 md:text-sm">
                {t.common.cancel}
              </Button>
            </SheetClose>
          </div>

          {remove ? (
            <div className="border-border flex flex-col gap-2 border-t pt-4">
              {confirming ? (
                <>
                  <p className="text-sm">{remove.question}</p>
                  <Button
                    variant="danger"
                    size="touch"
                    disabled={pending}
                    onClick={onDelete}
                    className="md:h-9 md:text-sm"
                  >
                    {remove.confirmLabel}
                  </Button>
                </>
              ) : (
                <Button
                  variant="danger"
                  size="touch"
                  disabled={pending}
                  onClick={() => setConfirming(true)}
                  className="md:h-9 md:text-sm"
                >
                  {remove.label}
                </Button>
              )}
            </div>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
