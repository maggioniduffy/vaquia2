import { notFound } from "next/navigation";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { formatDateAr, todayInArt } from "@/lib/dates";
import { formatDayMonth } from "@/lib/people/qualification-dates";
import { getPersonaDetail, type CurrentQualificationRow } from "@/lib/people/qualifications";
import { getSession } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import { QualificationSheet } from "./qualification-sheet";

const q = t.qualifications;

function fileHref(key: string): string {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function StatusBadge({ row }: { row: CurrentQualificationRow }) {
  let tone: Tone = "success";
  let label: string = q.status.valid;
  if (row.status === "expired" && row.expires_on) {
    tone = "danger";
    label = q.status.expired(formatDayMonth(row.expires_on));
  } else if (row.status === "expiring" && row.days_left !== null) {
    tone = "warning";
    label = q.status.expiring(row.days_left);
  }
  return <Badge tone={tone}>{label}</Badge>;
}

function FileLink({ path }: { path: string | null }) {
  if (!path) return <span className="text-muted">{q.file.none}</span>;
  return (
    <a
      href={fileHref(path)}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {q.file.view}
    </a>
  );
}

export default async function PersonaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const detail = await getPersonaDetail(session.userId, id);
  if (!detail) notFound();

  const { persona, current, history, types, fitness } = detail;
  const role = session.active?.role;
  const canWrite = role === "hse" || role === "admin";
  const storageAvailable = getStorage().isAvailable;
  const today = todayInArt();
  const sheetProps = { personaId: persona.id, types, storageAvailable, today };

  return (
    <>
      <header className="mb-6">
        <h2 className="text-lg font-medium">{persona.full_name}</h2>
        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted text-xs">{q.persona.dni}</dt>
            <dd className="font-mono tabular-nums">{persona.dni}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{q.persona.crew}</dt>
            <dd>{persona.crew_name ?? q.persona.noCrew}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{q.persona.state}</dt>
            <dd>
              <Badge tone={persona.active ? "success" : "neutral"}>
                {persona.active ? q.persona.active : q.persona.inactive}
              </Badge>
            </dd>
          </div>
        </dl>
      </header>

      {fitness.length > 0 ? (
        <section className="mb-8" aria-labelledby="fitness-title">
          <h3 id="fitness-title" className="mb-2 text-base font-medium">
            {q.fitnessTitle}
          </h3>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {fitness.map((f) => (
              <li key={f.task_type_id} className="flex items-center gap-2">
                <span>{f.task_name}</span>
                <Badge tone={f.apto ? "success" : "danger"}>
                  {f.apto ? q.fitness.apto : q.fitness.noApto}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-8" aria-labelledby="quals-title">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h3 id="quals-title" className="text-base font-medium">
            {q.title}
          </h3>
          {canWrite ? <QualificationSheet {...sheetProps} variant="primary" /> : null}
        </div>
        {current.length === 0 ? (
          <EmptyState message={q.empty} />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>{q.columns.type}</Th>
                <Th>{q.columns.issued}</Th>
                <Th>{q.columns.expires}</Th>
                <Th>{q.columns.status}</Th>
                <Th>{q.columns.file}</Th>
                {canWrite ? <Th>{q.columns.actions}</Th> : null}
              </Tr>
            </THead>
            <TBody>
              {current.map((row) => (
                <Tr key={row.qualification_id}>
                  <Td>{row.type_name}</Td>
                  <Td className="font-mono tabular-nums">{formatDateAr(row.issued_on)}</Td>
                  <Td className="font-mono tabular-nums">
                    {row.expires_on ? formatDateAr(row.expires_on) : q.status.noExpiry}
                  </Td>
                  <Td>
                    <StatusBadge row={row} />
                  </Td>
                  <Td>
                    <FileLink path={row.file_path} />
                  </Td>
                  {canWrite ? (
                    <Td>
                      <QualificationSheet
                        {...sheetProps}
                        renewType={{ id: row.type_id, name: row.type_name }}
                      />
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {history.length > 0 ? (
        <section aria-labelledby="history-title">
          <h3 id="history-title" className="mb-3 text-base font-medium">
            {q.historyTitle}
          </h3>
          <Table>
            <THead>
              <Tr>
                <Th>{q.columns.type}</Th>
                <Th>{q.columns.issued}</Th>
                <Th>{q.columns.expires}</Th>
                <Th>{q.columns.file}</Th>
                <Th>{q.columns.version}</Th>
              </Tr>
            </THead>
            <TBody>
              {history.map((row) => (
                <Tr key={row.id} data-current={row.is_current}>
                  <Td>{row.type_name}</Td>
                  <Td className="font-mono tabular-nums">{formatDateAr(row.issued_on)}</Td>
                  <Td className="font-mono tabular-nums">
                    {row.expires_on ? formatDateAr(row.expires_on) : q.status.noExpiry}
                  </Td>
                  <Td>
                    <FileLink path={row.file_path} />
                  </Td>
                  <Td className={row.is_current ? undefined : "text-muted"}>
                    {row.is_current ? q.version.current : q.version.superseded}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}
    </>
  );
}
