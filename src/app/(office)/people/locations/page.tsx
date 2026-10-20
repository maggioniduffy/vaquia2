import { EditButton } from "@/components/people/edit-host";
import { LocationEditHost, LocationSheet } from "@/components/people/location-sheet";
import { Mono, PageTitle } from "@/components/people/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { listLocations, listOperators, type LocationRow } from "@/lib/people/queries";
import { getSession } from "@/lib/session";

function coords(location: LocationRow): string {
  return location.lat !== null && location.lng !== null ? `${location.lat}, ${location.lng}` : "—";
}

export default async function LocationsPage() {
  const session = await getSession();
  const canWrite = session.active?.role === "hse" || session.active?.role === "admin";

  const [locations, operators] = await Promise.all([
    listLocations(session.userId),
    listOperators(session.userId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={t.people.tabs.locations}
        subtitle={<Mono>{locations.length}</Mono>}
        actions={canWrite ? <LocationSheet operators={operators} primary /> : null}
      />

      {locations.length === 0 ? (
        <EmptyState message={t.locations.empty} />
      ) : (
        <LocationEditHost locations={locations} operators={operators}>
          <div className="bg-surface border-border hidden overflow-hidden rounded-[var(--radius-panel)] border md:block">
            <Table>
              <THead>
                <Tr>
                  <Th className="px-4">{t.locations.columns.name}</Th>
                  <Th>{t.locations.columns.field}</Th>
                  <Th>{t.locations.columns.operator}</Th>
                  <Th>{t.locations.columns.coords}</Th>
                  {canWrite ? (
                    <Th className="text-right">
                      <span className="sr-only">{t.locations.columns.actions}</span>
                    </Th>
                  ) : null}
                </Tr>
              </THead>
              <TBody>
                {locations.map((l) => (
                  <Tr key={l.id} className="last:border-b-0">
                    <Td className="h-11 px-4 font-medium">{l.name}</Td>
                    <Td className="text-muted">{l.field ?? "—"}</Td>
                    <Td className="text-muted">{l.operator_name ?? "—"}</Td>
                    <Td className="text-muted font-mono tabular-nums">{coords(l)}</Td>
                    {canWrite ? (
                      <Td className="text-right">
                        <EditButton id={l.id} label={t.locations.edit} />
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          <ul className="divide-border border-border bg-surface divide-y rounded-[var(--radius-panel)] border md:hidden">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-center">
                  <span className="truncate text-sm font-medium">{l.name}</span>
                  <span className="text-muted flex flex-wrap gap-x-3 text-xs">
                    {l.field ? <span>{l.field}</span> : null}
                    {l.operator_name ? <span>{l.operator_name}</span> : null}
                    {l.lat !== null && l.lng !== null ? (
                      <span className="font-mono tabular-nums">{coords(l)}</span>
                    ) : null}
                  </span>
                </div>
                {canWrite ? <EditButton id={l.id} label={t.locations.edit} /> : null}
              </li>
            ))}
          </ul>
        </LocationEditHost>
      )}
    </div>
  );
}
