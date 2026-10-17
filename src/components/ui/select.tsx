import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export { Label } from "./input";

/** Native select styled like Input (works with forms and mobile pickers). */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-subtle)] focus-visible:outline-none border-border bg-surface text-text aria-invalid:border-danger disabled:bg-hover disabled:text-muted h-9 w-full rounded-[var(--radius-control)] border px-3 text-sm",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
