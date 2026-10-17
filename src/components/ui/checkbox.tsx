import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon } from "./icons";

/** Native checkbox, 16px, radius 4. Checked = accent fill + onaccent check. `label` renders a wrapping <label>. */
export function Checkbox({
  className,
  label,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label?: ReactNode }) {
  const box = (
    <span className="relative inline-flex size-4 shrink-0">
      <input
        type="checkbox"
        className={cn(
          "border-border bg-surface checked:border-accent checked:bg-accent peer disabled:bg-hover size-4 cursor-pointer appearance-none rounded-[4px] border disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
      <CheckIcon
        size={12}
        strokeWidth={2.5}
        className="text-accent-text pointer-events-none absolute inset-0 m-auto opacity-0 peer-checked:opacity-100"
      />
    </span>
  );
  if (!label) return box;
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      {box}
      {label}
    </label>
  );
}
