import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "border-border bg-surface text-text placeholder:text-muted aria-invalid:border-danger h-9 w-full rounded-[var(--radius-control)] border px-3 text-sm disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-muted text-xs font-medium", className)} {...props} />;
}
