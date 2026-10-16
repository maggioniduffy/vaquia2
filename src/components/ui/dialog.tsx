"use client";

import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { t } from "@/i18n/es-AR";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 bg-black/40" />
      <D.Content className="border-border bg-bg fixed top-1/2 left-1/2 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-panel)] border p-6 shadow-lg">
        <D.Title className="text-base font-medium">{title}</D.Title>
        {description ? (
          <D.Description className="text-muted mt-1 text-sm">{description}</D.Description>
        ) : null}
        <div className="mt-4">{children}</div>
        <D.Close
          className="text-muted hover:bg-surface absolute top-3 right-3 rounded-[var(--radius-control)] px-2 py-1 text-xs"
          aria-label={t.common.close}
        >
          {t.common.close}
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
