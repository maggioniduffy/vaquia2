import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon } from "./icons";

export type Step = { label: string; state: "done" | "current" | "todo" };

/** Horizontal steps joined by 1px lines. done = check, current = ringed accent dot, todo = empty ring. */
export function Stepper({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn("flex items-center gap-2 text-xs", className)}>
      {steps.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 ? <li aria-hidden className="bg-border h-px flex-1" /> : null}
          <li
            aria-current={s.state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5",
              s.state === "current" ? "text-text font-medium" : "text-muted",
            )}
          >
            {s.state === "done" ? (
              <CheckIcon size={14} strokeWidth={2} />
            ) : s.state === "current" ? (
              <span
                aria-hidden
                className="border-accent flex size-3.5 items-center justify-center rounded-full border-[1.5px]"
              >
                <span className="bg-accent size-1.5 rounded-full" />
              </span>
            ) : (
              <span aria-hidden className="border-border size-3.5 rounded-full border" />
            )}
            {s.label}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
