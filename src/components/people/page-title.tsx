import type { ReactNode } from "react";

/** Office page header: 20px/500 title, muted subtitle, actions on the right. */
export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-lg font-medium tracking-[-0.01em]">{title}</h1>
        {subtitle ? <p className="text-muted text-sm">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Mono tabular number/date inside running text. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono tabular-nums ${className ?? ""}`}>{children}</span>;
}
