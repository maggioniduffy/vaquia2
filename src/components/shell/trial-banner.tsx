import { t } from "@/i18n/es-AR";
import { getTrialInfo } from "@/lib/trial";

const CONTACT = "mailto:hola@vaquia.com?subject=Activar%20Vaquia";

export async function TrialBanner({ userId }: { userId: string }) {
  const trial = await getTrialInfo(userId);
  if (!trial) return null;
  const warn = trial.expired || trial.daysLeft <= 7;
  return (
    <div
      role="status"
      data-testid="trial-banner"
      className="border-border bg-surface text-muted flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-xs md:px-6"
    >
      {warn ? <span aria-hidden className="bg-warning size-1.5 shrink-0 rounded-full" /> : null}
      <span className="text-text">
        {trial.expired ? t.trial.expired : t.trial.daysLeft(trial.daysLeft)}
      </span>
      {trial.expired ? (
        <a href={CONTACT} className="text-accent underline">
          {t.trial.contact}
        </a>
      ) : null}
    </div>
  );
}
