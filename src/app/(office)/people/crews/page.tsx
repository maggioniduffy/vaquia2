import { EditButton } from "@/components/people/edit-host";
import { CrewEditHost, CrewSheet } from "@/components/people/crew-sheet";
import { Mono, PageTitle } from "@/components/people/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { listCrews, listLocationOptions, listPersonaOptions } from "@/lib/people/queries";
import { getSession } from "@/lib/session";

export default async function CrewsPage() {
  const session = await getSession();
  const canWrite = session.active?.role === "hse" || session.active?.role === "admin";

  const [crews, personas, locations] = await Promise.all([
    listCrews(session.userId),
    listPersonaOptions(session.userId),
    listLocationOptions(session.userId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={t.people.tabs.crews}
        subtitle={<Mono>{crews.length}</Mono>}
        actions={canWrite ? <CrewSheet personas={personas} locations={locations} primary /> : null}
      />

      {crews.length === 0 ? (
        <EmptyState message={t.crews.empty} />
      ) : (
        <CrewEditHost crews={crews} personas={personas} locations={locations}>
          <div className="bg-surface border-border hidden overflow-hidden rounded-[var(--radius-panel)] border md:block">
            <Table>
              <THead>
                <Tr>
                  <Th className="px-4">{t.crews.columns.name}</Th>
                  <Th>{t.crews.columns.supervisor}</Th>
                  <Th>{t.crews.columns.location}</Th>
                  <Th className="text-right">{t.crews.columns.members}</Th>
                  {canWrite ? (
                    <Th className="text-right">
                      <span className="sr-only">{t.crews.columns.actions}</span>
                    </Th>
                  ) : null}
                </Tr>
              </THead>
              <TBody>
                {crews.map((c) => (
                  <Tr key={c.id} className="last:border-b-0">
                    <Td className="h-11 px-4 font-medium">{c.name}</Td>
                    <Td className="text-muted">{c.supervisor_name ?? "—"}</Td>
                    <Td className="text-muted">{c.location_name ?? "—"}</Td>
                    <Td numeric>{c.persona_count}</Td>
                    {canWrite ? (
                      <Td className="text-right">
                        <EditButton id={c.id} label={t.crews.edit} />
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          <ul className="divide-border border-border bg-surface divide-y rounded-[var(--radius-panel)] border md:hidden">
            {crews.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-center">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <span className="text-muted flex flex-wrap gap-x-3 text-xs">
                    {c.supervisor_name ? <span>{c.supervisor_name}</span> : null}
                    {c.location_name ? <span>{c.location_name}</span> : null}
                    <span className="font-mono tabular-nums">
                      {c.persona_count} {t.crews.columns.members.toLowerCase()}
                    </span>
                  </span>
                </div>
                {canWrite ? <EditButton id={c.id} label={t.crews.edit} /> : null}
              </li>
            ))}
          </ul>
        </CrewEditHost>
      )}
    </div>
  );
}
