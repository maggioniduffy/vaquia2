import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { ChevronDownIcon } from "./icons";

/** 32px chip "Label Value ▾". `active` = accent border (filter applied). Use as a trigger or asChild-free button. */
export function FilterChip({
  label,
  value,
  active,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "focus-visible:border-accent bg-surface inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-sm transition-colors focus-visible:shadow-[0_0_0_3px_var(--accent-subtle)] focus-visible:outline-none",
        active ? "border-accent" : "border-border hover:bg-hover",
        className,
      )}
      {...props}
    >
      <span className="text-muted">{label}</span>
      <span>{value}</span>
      <ChevronDownIcon size={12} className="text-muted" />
    </button>
  );
}
