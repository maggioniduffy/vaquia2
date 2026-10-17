import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Pinned bottom action area of a field page (place after the content, inside the page column). */
export function FieldActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-border mt-auto grid gap-3 border-t p-4", className)}>{children}</div>
  );
}

/** Field page content: 16px padding. Pair with FieldActionBar as sibling for a pinned action. */
export function FieldContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-4 p-4", className)}>{children}</div>;
}
