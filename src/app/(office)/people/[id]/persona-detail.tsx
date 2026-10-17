import Link from "next/link";
import { notFound } from "next/navigation";
import { FileIcon } from "@/components/people/file-icon";
import { Mono } from "@/components/people/page-title";
import { CloseIcon } from "@/components/ui/icons";
import { StatusBadge, type Status } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { formatDateAr, todayInArt } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { getPersonaAccess } from "@/lib/people/access";
import { formatDayMonth } from "@/lib/people/qualification-dates";
import { getPersonaDetail, type CurrentQualificationRow } from "@/lib/people/qualifications";
import { getSession } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import { ChangeRoleSheet, GrantAccessSheet, RemoveAccessSheet } from "./access-controls";
import { QualificationSheet } from "./qualification-sheet";

const q = t.qualifications;
const acc = t.access;
const panelT = t.people.panel;

function fileHref(key: string): string {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")
  ).toUpperCase();
}

function QualStatus({ row }: { row: CurrentQualificationRow }) {
  if (row.status === "expired" && row.expires_on) {
    return (
      <StatusBadge status="expired">{q.status.expired(formatDayMonth(row.expires_on))}</StatusBadge>
    );
  }
  if (row.status === "expiring" && row.days_left !== null) {
    return <StatusBadge status="expiring">{q.status.expiring(row.days_left)}</StatusBadge>;
  }
  const status: Status = "valid";
  return (
    <StatusBadge status={status} className="whitespace-nowrap">
      {row.expires_on ? q.status.valid : q.status.noExpiry}
    </StatusBadge>
  );
}

function FileLink({ path }: { path: string | null }) {
  if (!path) return <span className="text-muted text-xs">{q.file.none}</span>;
  return (
    <a
      href={fileHref(path)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={q.file.view}
      title={q.file.view}
      className="text-muted hover:text-text inline-flex"
    >
      <FileIcon />
    </a>
  );
}

const QUAL_GRID = "grid grid-cols-[minmax(0,1.5fr)_84px_84px_132px_24px] items-center gap-2";

/**
 * Legajo: header, aptitude callout, current qualifications, history, system access.
 * Shared by the xl side panel (`/people?persona=<id>`) and the full page (`/people/<id>`).
 */
export async function PersonaDetail({
  personaId,
  panel = false,
  closeHref,
}: {
  personaId: string;
  /** Side-panel chrome (close + "open page" links). */
  panel?: boolean;
  closeHref?: string;
}) {
  const session = await getSession();
  const detail = await getPersonaDetail(session.userId, personaId);
  if (!detail) {
    if (!panel) notFound();
    return <EmptyState message={t.people.errors.notFound} />;
  }

  const { persona, current, history, types, fitness } = detail;
  const role = session.active?.role;
  const canWrite = role === "hse" || role === "admin";
  const isAdmin = role === "admin";
  const access = await getPersonaAccess(session.userId, persona.id);
  const storageAvailable = getStorage().isAvailable;
  const today = todayInArt();
  const sheetProps = { personaId: persona.id, types, storageAvailable, today };

  const unfit = fitness.filter((f) => !f.apto);
  const fitCount = fitness.length - unfit.length;

  return (
    <article aria-label={panelT.label} className="flex flex-col">
      <header className="border-border flex flex-col gap-3 border-b p-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="border-border flex size-11 shrink-0 items-center justify-center rounded-full border font-medium"
          >
            {initials(persona.full_name)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="truncate text-xl font-medium tracking-[-0.01em]">{persona.full_name}</h2>
            <span className="text-muted">{persona.crew_name ?? q.persona.noCrew}</span>
          </div>
          {panel ? (
            <div className="flex shrink-0 items-center gap-3 self-start">
              <Link
                href={`/people/${persona.id}`}
                className="text-accent hover:text-accent-hover text-xs font-medium"
              >
                {panelT.openPage}
              </Link>
              {closeHref ? (
                <Link
                  href={closeHref}
                  aria-label={panelT.close}
                  className="text-muted hover:text-text"
                >
                  <CloseIcon />
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="text-muted flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span>
            {q.persona.dni} <Mono className="text-text">{persona.dni}</Mono>
          </span>
          <span>{persona.active ? q.persona.active : q.persona.inactive}</span>
        </div>
        {unfit.length > 0 ? (
          <div className="border-danger flex flex-col gap-0.5 border-l-2 py-0.5 pl-3">
            <span className="text-danger font-medium">
              {panelT.noAptoFor} {unfit.map((f) => f.task_name).join(", ")}
            </span>
            <span className="text-muted text-xs">
              {fitCount > 0 ? panelT.aptoOthers(fitCount) : panelT.reviewQuals}
            </span>
          </div>
        ) : fitness.length > 0 ? (
          <p className="text-muted flex items-center gap-1.5 text-xs">{panelT.aptoAll}</p>
        ) : null}
      </header>

      <section aria-labelledby="quals-title">
        <div className="flex items-center justify-between gap-4 px-5 pt-3 pb-2">
          <h3 id="quals-title" className="text-muted text-xs">
            {panelT.qualifications} · <Mono>{current.length}</Mono>
          </h3>
          {canWrite ? <QualificationSheet {...sheetProps} variant="link" /> : null}
        </div>
        {current.length === 0 ? (
          <div className="px-5 pb-4">
            <EmptyState message={q.empty} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[480px]">
              <div
                className={cn(QUAL_GRID, "text-muted border-border border-b px-5 pb-1.5 text-xs")}
              >
                <span>{q.columns.type}</span>
                <span>{q.columns.issued}</span>
                <span>{q.columns.expires}</span>
                <span>{q.columns.status}</span>
                <span className="sr-only">{q.columns.file}</span>
              </div>
              <ul>
                {current.map((row) => (
                  <li
                    key={row.qualification_id}
                    className={cn(QUAL_GRID, "border-border h-11 border-b px-5")}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate" title={row.type_name}>
                        {row.type_name}
                      </span>
                      {canWrite ? (
                        <QualificationSheet
                          {...sheetProps}
                          variant="link"
                          renewType={{ id: row.type_id, name: row.type_name }}
                        />
                      ) : null}
                    </span>
                    <Mono className="text-muted text-xs">{formatDateAr(row.issued_on)}</Mono>
                    <Mono className="text-xs">
                      {row.expires_on ? formatDateAr(row.expires_on) : "—"}
                    </Mono>
                    <QualStatus row={row} />
                    <FileLink path={row.file_path} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <section aria-labelledby="history-title" className="border-border mt-4 border-t px-5 py-3">
          <h3 id="history-title" className="text-muted mb-1 text-xs">
            {q.historyTitle}
          </h3>
          <Table>
            <THead>
              <Tr>
                <Th className="px-0">{q.columns.type}</Th>
                <Th>{q.columns.issued}</Th>
                <Th>{q.columns.expires}</Th>
                <Th>{q.columns.file}</Th>
                <Th>{q.columns.version}</Th>
              </Tr>
            </THead>
            <TBody>
              {history.map((row) => (
                <Tr key={row.id} data-current={row.is_current} draft={!row.is_current}>
                  <Td className="px-0">{row.type_name}</Td>
                  <Td className="font-mono text-xs tabular-nums">{formatDateAr(row.issued_on)}</Td>
                  <Td className="font-mono text-xs tabular-nums">
                    {row.expires_on ? formatDateAr(row.expires_on) : q.status.noExpiry}
                  </Td>
                  <Td>
                    <FileLink path={row.file_path} />
                  </Td>
                  <Td>{row.is_current ? q.version.current : q.version.superseded}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}

      <section aria-labelledby="access-title" className="border-border mt-2 border-t px-5 py-4">
        <h3 id="access-title" className="text-muted mb-2 text-xs">
          {acc.title}
        </h3>
        {access ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-muted text-xs">{acc.email}</dt>
                <dd>{access.email}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">{acc.role}</dt>
                <dd>{t.roles[access.role]}</dd>
              </div>
            </dl>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <ChangeRoleSheet personaId={persona.id} currentRole={access.role} />
                <RemoveAccessSheet personaId={persona.id} personaName={persona.full_name} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-muted text-sm">{acc.noAccess}</p>
            {isAdmin ? <GrantAccessSheet personaId={persona.id} /> : null}
          </div>
        )}
      </section>
    </article>
  );
}
