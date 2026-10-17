import type { ReactNode } from "react";
import { t } from "@/i18n/es-AR";
import { cn } from "@/lib/cn";
import { CheckIcon } from "./icons";

export type Tone = "neutral" | "danger" | "warning";

const dot: Record<Tone, string> = {
  neutral: "bg-muted",
  danger: "bg-danger",
  warning: "bg-warning",
};

const text: Record<Tone, string> = {
  neutral: "",
  danger: "text-danger font-medium",
  warning: "text-warning font-medium",
};

// Status = a dot + text. Never a filled background (docs/spec/design.md).
export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", text[tone], className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot[tone])} />
      {children}
    </span>
  );
}

export type Status = "blocked" | "warning" | "expiring" | "expired" | "valid" | "pending";

/** Dot only (6px). expiring = hollow amber, pending = dashed muted, valid = neutral check. */
export function StatusDot({ status, className }: { status: Status; className?: string }) {
  if (status === "valid") return <CheckIcon size={14} strokeWidth={2} className={className} />;
  const style: Record<Exclude<Status, "valid">, string> = {
    blocked: "bg-danger",
    expired: "bg-danger",
    warning: "bg-warning",
    expiring: "box-border border-[1.5px] border-warning",
    pending: "box-border border-[1.5px] border-dashed border-muted",
  };
  return (
    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", style[status], className)} />
  );
}

const statusText: Record<Status, string> = {
  blocked: "text-danger font-medium",
  expired: "text-danger font-medium",
  warning: "text-warning font-medium",
  expiring: "text-warning font-medium",
  valid: "text-muted",
  pending: "text-muted",
};

/** Dot/check + label. Default label comes from i18n `status.*`; pass children to override. */
export function StatusBadge({
  status,
  children,
  className,
}: {
  status: Status;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-sm",
        status === "valid" ? "gap-1.5" : "gap-2",
        statusText[status],
        className,
      )}
    >
      <StatusDot status={status} />
      {children ?? t.status[status]}
    </span>
  );
}
