"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { SyncIndicator } from "@/components/sync/sync-indicator";
import { t } from "@/i18n/es-AR";

const TITLES: Record<string, string> = {
  "/field": t.field.today,
  "/field/capture": t.field.titles.capture,
  "/field/actions": t.field.titles.actions,
  "/field/sync": t.field.titles.sync,
};

/** 56px field header: back arrow (inner pages), title + subtitle, sync pill, trailing action. */
export function FieldHeader({
  homeSubtitle,
  companyId,
  end,
}: {
  homeSubtitle: string;
  companyId: string | null;
  end: ReactNode;
}) {
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
        <h1 className="text-field-lg truncate leading-tight font-medium">{title}</h1>
        {home ? (
          <p className="text-muted text-field-sm truncate leading-tight">{homeSubtitle}</p>
        ) : null}
      </div>
      {companyId ? <SyncIndicator companyId={companyId} className="h-8 shrink-0" /> : null}
      {end}
    </header>
  );
}
