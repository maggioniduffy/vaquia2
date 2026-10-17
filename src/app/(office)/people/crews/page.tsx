import { CrewSheet } from "@/components/people/crew-sheet";
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
    <div className="flex flex-col gap-6">
      {canWrite ? (
        <div className="flex md:justify-end">
          <CrewSheet personas={personas} locations={locations} primary />
        </div>
      ) : null}

      {crews.length === 0 ? (
        <EmptyState message={t.crews.empty} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <Tr>
                  <Th>{t.crews.columns.name}</Th>
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
                  <Tr key={c.id}>
                    <Td className="font-medium">{c.name}</Td>
                    <Td className="text-muted">{c.supervisor_name ?? "—"}</Td>
                    <Td className="text-muted">{c.location_name ?? "—"}</Td>
                    <Td numeric>{c.persona_count}</Td>
                    {canWrite ? (
                      <Td className="text-right">
                        <CrewSheet crew={c} personas={personas} locations={locations} />
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          <ul className="divide-border border-border divide-y border-y md:hidden">
            {crews.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
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
                {canWrite ? <CrewSheet crew={c} personas={personas} locations={locations} /> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
