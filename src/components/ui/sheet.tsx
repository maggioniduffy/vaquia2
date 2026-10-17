"use client";

import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { t } from "@/i18n/es-AR";

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

/** Side sheet: right panel on desktop, full-width bottom sheet on mobile. */
export function SheetContent({
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
      <D.Content className="border-border bg-bg fixed inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-[var(--radius-panel)] border-t md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-t-0 md:border-l">
        <div className="border-border flex items-start justify-between gap-4 border-b p-4">
          <div>
            <D.Title className="text-base font-medium">{title}</D.Title>
            {description ? (
              <D.Description className="text-muted mt-1 text-sm">{description}</D.Description>
            ) : null}
          </div>
          <D.Close
            className="text-muted hover:bg-surface min-h-9 shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-xs"
            aria-label={t.common.close}
          >
            {t.common.close}
          </D.Close>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
