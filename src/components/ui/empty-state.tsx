import type { ReactNode } from "react";

// One line of text + at most one action. No illustrations.
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-12">
      <p className="text-muted text-sm">{message}</p>
      {action}
    </div>
  );
}
