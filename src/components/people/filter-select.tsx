"use client";

import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type FilterOption = { value: string; label: string };

/**
 * Filter chip ("Label Value ▾", 32px) backed by a native select so it works inside a GET form.
 * Changing the value submits the form. `active` = accent border.
 */
export function FilterSelect({
  name,
  label,
  value,
  options,
  active,
}: {
  name: string;
  label: string;
  value: string;
  options: FilterOption[];
  active?: boolean;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <label
      className={cn(
        "bg-surface focus-within:border-accent relative inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-sm focus-within:shadow-[0_0_0_3px_var(--accent-subtle)]",
        active ? "border-accent" : "border-border hover:bg-hover",
      )}
    >
      <span className="text-muted">{label}</span>
      <span className={cn(active && "font-medium")}>{current?.label}</span>
      <ChevronDownIcon size={12} className="text-muted" />
      <select
        name={name}
        aria-label={label}
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
