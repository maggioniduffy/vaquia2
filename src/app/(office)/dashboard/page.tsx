import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { StatusDot } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { t } from "@/i18n/es-AR";
import { formatDateAr } from "@/lib/dates";
import { displayNameFromEmail, greetingFor, longDateAr } from "@/lib/office/greeting";
import { listAttention, type AttentionItem } from "@/lib/office/queries";
import { ChecklistCard } from "@/components/onboarding/checklist-card";
import { getChecklist } from "@/lib/onboarding/checklist";
import { getSession } from "@/lib/session";

function Group({ title, items }: { title: string; items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col">
      <div className="text-muted flex gap-2 px-5 pt-3 pb-1 text-xs">
        <span>{title}</span>
        <span className="font-mono">{items.length}</span>
      </div>
      {items.map((it) => (
        <Link
          key={`${it.personaId}-${it.qualificationName}`}
          href={`/people/${it.personaId}`}
          className="border-border text-text hover:bg-hover grid grid-cols-[12px_1fr_auto_16px] items-center gap-3 border-b px-5 py-2.5 hover:text-text"
        >
          <StatusDot status={it.status} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate">
              {it.fullName} · {it.qualificationName}
            </span>
            {it.crewName ? <span className="text-muted text-xs">{it.crewName}</span> : null}
          </span>
          <span className="text-muted font-mono text-xs">{formatDateAr(it.expiresOn)}</span>
          <ChevronRightIcon size={14} className="text-muted" />
        </Link>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  const isAdmin = session.active?.role === "admin";
  const [items, checklist] = await Promise.all([
    listAttention(session.userId, 7),
    isAdmin ? getChecklist(session.userId) : null,
  ]);
  const expired = items.filter((i) => i.status === "expired");
  const expiring = items.filter((i) => i.status === "expiring");
  const name = displayNameFromEmail(session.email).split(" ")[0] ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium tracking-tight">{greetingFor(name)}</h1>
        <span className="text-muted">{longDateAr()}</span>
      </div>
      {checklist ? <ChecklistCard checklist={checklist} /> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="border-border bg-surface rounded-[var(--radius-panel)] border">
          <div className="border-border flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-base font-medium">{t.home.attention}</h2>
            <span className="text-muted font-mono text-xs">{items.length}</span>
          </div>
          {items.length === 0 ? (
            <div className="px-5">
              <EmptyState message={t.home.noAttention} />
            </div>
          ) : (
            <>
              <Group title={t.home.expired} items={expired} />
              <Group title={t.home.expiringSoon} items={expiring} />
            </>
          )}
        </section>
        <section className="border-border bg-surface rounded-[var(--radius-panel)] border px-5 py-4">
          <h2 className="text-base font-medium">{t.home.kpis}</h2>
          <EmptyState message={t.home.kpisSoon} />
        </section>
      </div>
    </div>
  );
}
