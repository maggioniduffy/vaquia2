import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "danger" | "warning" | "success";

const dot: Record<Tone, string> = {
  neutral: "bg-muted",
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
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
    <span className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot[tone])} />
      {children}
    </span>
  );
}
