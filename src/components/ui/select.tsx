import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export { Label } from "./input";

/** Native select styled like Input (works with forms and mobile pickers). */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-border bg-surface text-text aria-invalid:border-danger h-9 w-full rounded-[var(--radius-control)] border px-3 text-sm disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
