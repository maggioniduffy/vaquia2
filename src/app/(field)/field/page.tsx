import { cookies } from "next/headers";
import Link from "next/link";
import { FieldContent } from "@/components/shell/field-action-bar";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { t } from "@/i18n/es-AR";
import { formatDateAr } from "@/lib/dates";
import { getFieldToday } from "@/lib/field/today";
import { getSession } from "@/lib/session";

const TASKS = [
  { href: "/field/capture", ...t.field.tasks.talk },
  { href: "/field/capture", ...t.field.tasks.ats },
  { href: "/field/actions", ...t.field.tasks.actions },
  { href: "/field/sync", ...t.field.tasks.sync },
];

function ChevronRight() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-muted shrink-0"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export default async function FieldHomePage() {
  const session = await getSession();
  const today = await getFieldToday(session.userId);
  const themeCookie = (await cookies()).get("theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;
  const canOffice = session.active && !["worker", "supervisor"].includes(session.active.role);
  return (
    <FieldContent className="flex-1">
      <section className="border-border bg-surface flex flex-col gap-1 rounded-[var(--radius-panel)] border p-4">
        <span className="text-muted text-field-sm" data-testid="company-name">
          {session.active?.name}
        </span>
        {today.crew ? (
          <>
            <span className="text-field-lg font-medium">
              {today.crew.locationName
                ? today.crew.locationField
                  ? t.field.fieldLocation(today.crew.locationField, today.crew.locationName)
                  : today.crew.locationName
                : today.crew.name}
            </span>
            <span className="text-muted text-field-sm">
              {t.field.crewLine(today.crew.name, today.crew.members)}
            </span>
          </>
        ) : (
          <span className="text-muted text-field-sm">{t.field.noCrew}</span>
        )}
      </section>

      <h2 className="text-muted text-field-sm font-normal">{t.field.forToday}</h2>
      <ul className="flex flex-col gap-3">
        {TASKS.map((task) => (
          <li key={task.title}>
            <Link
              href={task.href}
              className="border-border bg-surface text-text hover:bg-hover flex min-h-16 items-center gap-3 rounded-[var(--radius-panel)] border px-4 py-3"
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="font-medium">{task.title}</span>
                <span className="text-muted text-field-sm">{task.hint}</span>
              </span>
              <ChevronRight />
            </Link>
          </li>
        ))}
      </ul>

      {today.expiring.map((q) => (
        <div
          key={`${q.personaName}-${q.typeName}`}
          className="border-warning flex flex-col gap-0.5 border-l-2 py-0.5 pl-3"
        >
          <span className="text-field-md font-medium">
            {t.field.expiringTitle(
              q.personaName,
              q.typeName,
              formatDateAr(q.expiresOn).slice(0, 5),
            )}
          </span>
          <span className="text-muted text-field-sm">{t.field.expiringHint}</span>
        </div>
      ))}

      <div className="mt-auto flex items-center justify-between pt-2">
        <ThemeToggle className="size-12" initial={theme} />
        {canOffice ? (
          <SignOutButton className="text-muted hover:text-text min-h-12 px-2 text-sm" />
        ) : null}
      </div>
    </FieldContent>
  );
}
