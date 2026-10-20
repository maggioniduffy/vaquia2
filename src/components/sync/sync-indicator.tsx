"use client";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { t } from "@/i18n/es-AR";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/offline/db";
import { countOutbox, type OutboxCounts } from "@/lib/sync/outbox";

/** Pure view of the outbox counts (pending / syncing / error), so it can be rendered in isolation. */
export function SyncIndicatorView({ counts, className }: { counts: OutboxCounts; className?: string }) {
  const { pending, syncing, error } = counts;
  const idle = pending + syncing + error === 0;
  return (
    <Link
      href="/field/sync"
      role="status"
      title={error > 0 ? t.sync.errorHint : undefined}
      className={cn(
        "border-border text-text hover:bg-hover inline-flex h-7 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border px-2.5 text-xs",
        error > 0 && "border-danger",
        className,
      )}
    >
      {idle ? (
        <>
          <span aria-hidden className="bg-accent size-1.5 rounded-full" />
          {t.sync.synced}
        </>
      ) : (
        <>
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", error > 0 ? "bg-danger" : "bg-accent")}
          />
          <span className="tabular-nums">
            {[
              syncing > 0 ? t.sync.syncing(syncing) : null,
              pending > 0 ? t.sync.pending(pending) : null,
              error > 0 ? t.sync.error(error) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </>
      )}
    </Link>
  );
}

/** Live outbox state for a company (records only; blobs are an implementation detail). */
export function SyncIndicator({ companyId, className }: { companyId: string; className?: string }) {
  const counts = useLiveQuery(
    async () => countOutbox(await getDb().outbox.where("company_id").equals(companyId).toArray()),
    [companyId],
  );
  return <SyncIndicatorView counts={counts ?? { pending: 0, syncing: 0, error: 0 }} className={className} />;
}
