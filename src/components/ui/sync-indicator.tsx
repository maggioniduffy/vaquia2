import { t } from "@/i18n/es-AR";
import { cn } from "@/lib/cn";
import { RefreshIcon, WifiOffIcon } from "./icons";

export type SyncState =
  | { kind: "synced" }
  | { kind: "offline"; pending: number }
  | { kind: "sending"; done: number; total: number };

/** 28px bordered pill (visual only). Wiring to the sync engine happens in the field phase. */
export function SyncIndicator({ state, className }: { state: SyncState; className?: string }) {
  return (
    <span
      role="status"
      className={cn(
        "border-border inline-flex h-7 items-center gap-2 rounded-[var(--radius-control)] border px-2.5 text-xs",
        state.kind === "sending" && "text-muted",
        className,
      )}
    >
      {state.kind === "synced" ? (
        <>
          <span aria-hidden className="bg-accent size-1.5 rounded-full" />
          {t.sync.synced}
        </>
      ) : state.kind === "offline" ? (
        <>
          <WifiOffIcon size={14} className="text-muted" />
          <span className="tabular-nums">{t.sync.offline(state.pending)}</span>
        </>
      ) : (
        <>
          <RefreshIcon size={14} className="text-accent" />
          <span className="tabular-nums">{t.sync.sending(state.done, state.total)}</span>
        </>
      )}
    </span>
  );
}
