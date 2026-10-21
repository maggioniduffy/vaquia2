import { t } from "@/i18n/es-AR";

// Instant placeholder while a dynamic route renders on the server (used by loading.tsx files).
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
      <div className="bg-hover h-5 w-48 animate-pulse rounded-[var(--radius-control)]" />
      <div className="bg-hover h-4 w-72 animate-pulse rounded-[var(--radius-control)]" />
      <div className="border-border mt-2 flex flex-col border-t">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="border-border flex h-10 items-center border-b">
            <div className="bg-hover h-3 w-full max-w-md animate-pulse rounded-[var(--radius-control)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
