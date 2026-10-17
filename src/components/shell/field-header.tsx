"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { SyncIndicator } from "@/components/ui/sync-indicator";
import { t } from "@/i18n/es-AR";

const TITLES: Record<string, string> = {
  "/field": t.field.today,
  "/field/capture": t.field.titles.capture,
  "/field/actions": t.field.titles.actions,
  "/field/sync": t.field.titles.sync,
};

/** 56px field header: back arrow (inner pages), title + subtitle, sync pill, trailing action. */
export function FieldHeader({ homeSubtitle, end }: { homeSubtitle: string; end: ReactNode }) {
  const pathname = usePathname().replace(/\/$/, "") || "/field";
  const home = pathname === "/field";
  const title = TITLES[pathname] ?? t.field.today;
  return (
    <header className="border-border flex h-14 shrink-0 items-center gap-2 border-b px-4">
      {home ? null : (
        <Link
          href="/field"
          aria-label={t.field.back}
          className="text-text hover:bg-hover -ml-2 flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
        >
          <ArrowLeftIcon size={20} />
        </Link>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate text-field-lg leading-tight font-medium">{title}</h1>
        {home ? (
          <p className="text-muted truncate text-field-sm leading-tight">{homeSubtitle}</p>
        ) : null}
      </div>
      {/* Real sync state arrives with the offline engine (phase 2). */}
      <SyncIndicator state={{ kind: "synced" }} className="h-8 shrink-0" />
      {end}
    </header>
  );
}
