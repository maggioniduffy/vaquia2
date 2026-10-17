import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StatusDot, type Status } from "./badge";

/**
 * KPI: muted label, big mono number (600), small mono delta.
 * `dot` adds a status dot next to the value; `incomplete` shows a thin amber left border + message.
 */
export function KpiTile({
  label,
  value,
  delta,
  dot,
  incomplete,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  dot?: Extract<Status, "blocked" | "warning" | "expired">;
  incomplete?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-surface flex flex-col gap-2 rounded-[var(--radius-panel)] border p-4",
        incomplete && "border-l-warning border-l-2",
        className,
      )}
    >
      <span className="text-muted text-xs">{label}</span>
      <span
        className={cn(
          "flex items-center gap-2 font-mono text-[28px] leading-tight font-semibold tracking-[-0.02em] tabular-nums",
          incomplete && "text-muted",
        )}
      >
        {value}
        {dot ? <StatusDot status={dot} /> : null}
      </span>
      {incomplete ? (
        <span className="text-warning text-xs">{incomplete}</span>
      ) : delta ? (
        <span className="text-muted font-mono text-xs">{delta}</span>
      ) : null}
    </div>
  );
}
