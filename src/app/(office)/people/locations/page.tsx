import { LocationSheet } from "@/components/people/location-sheet";
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
    <div className="flex flex-col gap-6">
      {canWrite ? (
        <div className="flex md:justify-end">
          <LocationSheet operators={operators} primary />
        </div>
      ) : null}

      {locations.length === 0 ? (
        <EmptyState message={t.locations.empty} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <Tr>
                  <Th>{t.locations.columns.name}</Th>
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
                  <Tr key={l.id}>
                    <Td className="font-medium">{l.name}</Td>
                    <Td className="text-muted">{l.field ?? "—"}</Td>
                    <Td className="text-muted">{l.operator_name ?? "—"}</Td>
                    <Td className="text-muted font-mono tabular-nums">{coords(l)}</Td>
                    {canWrite ? (
                      <Td className="text-right">
                        <LocationSheet location={l} operators={operators} />
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          <ul className="divide-border border-border divide-y border-y md:hidden">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
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
                {canWrite ? <LocationSheet location={l} operators={operators} /> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
