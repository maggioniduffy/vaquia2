import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "focus-visible:border-accent border-border bg-surface text-text placeholder:text-muted aria-invalid:border-danger disabled:bg-hover disabled:text-muted h-9 w-full rounded-[var(--radius-control)] border px-3 text-sm focus-visible:shadow-[0_0_0_3px_var(--accent-subtle)] focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-muted text-xs", className)} {...props} />;
}

/** Textarea: same look as Input, auto height. */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "focus-visible:border-accent border-border bg-surface text-text placeholder:text-muted aria-invalid:border-danger disabled:bg-hover disabled:text-muted min-h-[72px] w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:shadow-[0_0_0_3px_var(--accent-subtle)] focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/** Field error: 12px red message under the control (pair with aria-invalid on the control). */
export function FieldError({ className, ...props }: ComponentProps<"p">) {
  return <p role="alert" className={cn("text-danger text-xs", className)} {...props} />;
}
