import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}

export function TBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

/** Row: hover = --hover; `selected` = accent-subtle + 2px left accent; `draft` = muted text. */
export function Tr({
  className,
  selected,
  draft,
  ...props
}: ComponentProps<"tr"> & { selected?: boolean; draft?: boolean }) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        "border-border border-b transition-colors",
        selected ? "bg-accent-subtle shadow-[inset_2px_0_0_var(--accent)]" : "hover:bg-hover",
        draft && "text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "text-muted border-border h-9 border-b px-3 text-left text-xs font-normal",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, numeric, ...props }: ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      className={cn("h-10 px-3", numeric && "text-right font-mono tabular-nums", className)}
      {...props}
    />
  );
}
