import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm" | "touch";

const variants: Record<Variant, string> = {
  primary:
    "border-accent-strong bg-accent-strong text-accent-text hover:bg-accent-hover hover:border-accent-hover",
  secondary: "border-border bg-surface text-text hover:bg-hover",
  ghost: "border-transparent bg-transparent text-text hover:bg-hover",
  // Text red on surface; never a red fill.
  danger: "border-border bg-surface text-danger hover:bg-hover",
};

const sizes: Record<Size, string> = {
  md: "h-9 px-4 text-sm",
  sm: "h-7 px-2.5 text-xs",
  // Field: touch targets >= 48px (gloves); primary action is 52px.
  touch: "h-[52px] px-4 text-base",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  asChild = false,
  className,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "focus-visible:border-accent disabled:border-border disabled:bg-hover disabled:text-muted inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] border font-medium whitespace-nowrap transition-colors focus-visible:shadow-[0_0_0_3px_var(--accent-subtle)] focus-visible:outline-none disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
