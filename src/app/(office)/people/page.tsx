import Link from "next/link";
import { PersonaSheet } from "@/components/people/persona-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { listCrewOptions, listPersonas, type PersonaRow } from "@/lib/people/queries";
import { getSession } from "@/lib/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge className={active ? undefined : "text-muted"}>
      {active ? t.people.status.active : t.people.status.inactive}
    </Badge>
  );
}

export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 100);
  const crewParam = first(params.crew);
  const crew = crewParam === "none" || UUID.test(crewParam) ? crewParam : "";
  const activeParam = first(params.active);
  const active = activeParam === "1" || activeParam === "0" ? activeParam : "";
  const filtered = Boolean(q || crew || active);

  const session = await getSession();
  const canWrite = session.active?.role === "hse" || session.active?.role === "admin";

  const [personas, crews] = await Promise.all([
    listPersonas(session.userId, { q, crew, active }),
    listCrewOptions(session.userId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <form method="get" role="search" className="flex flex-col gap-3 md:flex-row md:items-end">
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t.people.searchPlaceholder}
            aria-label={t.people.searchLabel}
            className="h-12 md:h-9 md:w-64"
          />
          <Select
            name="crew"
            defaultValue={crew}
            aria-label={t.people.filters.crew}
            className="h-12 md:h-9 md:w-48"
          >
            <option value="">{t.people.filters.allCrews}</option>
            <option value="none">{t.people.filters.withoutCrew}</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            name="active"
            defaultValue={active}
            aria-label={t.people.filters.status}
            className="h-12 md:h-9 md:w-48"
          >
            <option value="">{t.people.filters.allStatuses}</option>
            <option value="1">{t.people.filters.onlyActive}</option>
            <option value="0">{t.people.filters.onlyInactive}</option>
          </Select>
          <Button type="submit" size="touch" className="md:h-9 md:text-sm">
            {t.people.search}
          </Button>
          {filtered ? (
            <Button asChild variant="ghost" size="touch" className="md:h-9 md:text-sm">
              <Link href="/people">{t.people.clearFilters}</Link>
            </Button>
          ) : null}
        </form>
        {canWrite ? <PersonaSheet crews={crews} primary /> : null}
      </div>

      {personas.length === 0 ? (
        <EmptyState message={filtered ? t.people.emptyFiltered : t.people.empty} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <Tr>
                  <Th>{t.people.columns.name}</Th>
                  <Th>{t.people.columns.dni}</Th>
                  <Th>{t.people.columns.crew}</Th>
                  <Th>{t.people.columns.status}</Th>
                  {canWrite ? (
                    <Th className="text-right">
                      <span className="sr-only">{t.people.columns.actions}</span>
                    </Th>
                  ) : null}
                </Tr>
              </THead>
              <TBody>
                {personas.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/people/${p.id}`} className="underline-offset-4 hover:underline">
                        {p.full_name}
                      </Link>
                    </Td>
                    <Td className="font-mono tabular-nums">{p.dni}</Td>
                    <Td className="text-muted">{p.crew_name ?? "—"}</Td>
                    <Td>
                      <StatusBadge active={p.active} />
                    </Td>
                    {canWrite ? (
                      <Td className="text-right">
                        <PersonaSheet persona={p} crews={crews} />
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          <ul className="divide-border border-border divide-y border-y md:hidden">
            {personas.map((p) => (
              <PersonaListItem key={p.id} persona={p} canWrite={canWrite} crews={crews} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PersonaListItem({
  persona,
  canWrite,
  crews,
}: {
  persona: PersonaRow;
  canWrite: boolean;
  crews: { id: string; name: string }[];
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <Link
        href={`/people/${persona.id}`}
        className="flex min-h-12 min-w-0 flex-1 flex-col justify-center"
      >
        <span className="truncate text-sm font-medium">{persona.full_name}</span>
        <span className="text-muted flex flex-wrap items-center gap-x-3 text-xs">
          <span className="font-mono tabular-nums">{persona.dni}</span>
          {persona.crew_name ? <span>{persona.crew_name}</span> : null}
          <StatusBadge active={persona.active} />
        </span>
      </Link>
      {canWrite ? <PersonaSheet persona={persona} crews={crews} /> : null}
    </li>
  );
}
