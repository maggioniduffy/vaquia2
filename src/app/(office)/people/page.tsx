import Link from "next/link";
import { FilterSelect } from "@/components/people/filter-select";
import { Mono, PageTitle } from "@/components/people/page-title";
import { PersonaSheet } from "@/components/people/persona-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";
import { SearchIcon } from "@/components/ui/icons";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { cn } from "@/lib/cn";
import { listCrewOptions, listPersonas, type PersonaRow } from "@/lib/people/queries";
import { getSession } from "@/lib/session";
import { PersonaDetail } from "./[id]/persona-detail";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Aptitude state of one persona across task types (inactive personas have none). */
function Aptitude({ persona }: { persona: PersonaRow }) {
  const f = t.people.fitnessState;
  if (!persona.active) {
    return <span className="text-muted">{t.people.status.inactive}</span>;
  }
  if (persona.unfit_tasks > 0) return <StatusBadge status="expired">{f.unfit}</StatusBadge>;
  if (persona.expiring_count > 0) return <StatusBadge status="expiring">{f.expiring}</StatusBadge>;
  return <StatusBadge status="valid">{f.fit}</StatusBadge>;
}

export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 100);
  const crewParam = first(params.crew);
  const crew = crewParam === "none" || UUID.test(crewParam) ? crewParam : "";
  const activeParam = first(params.active);
  const active = activeParam === "1" || activeParam === "0" ? activeParam : "";
  const personaParam = first(params.persona);
  const selectedId = UUID.test(personaParam) ? personaParam : "";
  const filtered = Boolean(q || crew || active);

  const session = await getSession();
  const canWrite = session.active?.role === "hse" || session.active?.role === "admin";

  const [personas, crews] = await Promise.all([
    listPersonas(session.userId, { q, crew, active }),
    listCrewOptions(session.userId),
  ]);

  const unfitCount = personas.filter((p) => p.unfit_tasks > 0).length;
  const sub = t.people.subtitle;

  // Links keep the active filters; the panel only exists from xl up, below it the row opens the page.
  const keep = new URLSearchParams();
  if (q) keep.set("q", q);
  if (crew) keep.set("crew", crew);
  if (active) keep.set("active", active);
  const withPersona = (id: string) => {
    const next = new URLSearchParams(keep);
    next.set("persona", id);
    return `/people?${next.toString()}`;
  };
  const closeHref = keep.size ? `/people?${keep.toString()}` : "/people";

  const crewOptions = [
    { value: "", label: t.people.filters.allCrews },
    { value: "none", label: t.people.filters.withoutCrew },
    ...crews.map((c) => ({ value: c.id, label: c.name })),
  ];
  const activeOptions = [
    { value: "", label: t.people.filters.allStatuses },
    { value: "1", label: t.people.filters.onlyActive },
    { value: "0", label: t.people.filters.onlyInactive },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={t.nav.office.people}
        subtitle={
          <>
            <Mono>{personas.length}</Mono> {sub.people} · <Mono>{crews.length}</Mono> {sub.crews}
            {unfitCount > 0 ? (
              <>
                {" · "}
                <Mono className="text-danger">{unfitCount}</Mono> {sub.unfit}
              </>
            ) : null}
          </>
        }
        actions={
          canWrite ? (
            <>
              <Button asChild variant="secondary" className="h-8">
                <Link href="/people/import">{t.people.importCsv}</Link>
              </Button>
              <PersonaSheet crews={crews} primary />
            </>
          ) : null
        }
      />

      <form method="get" role="search" className="flex flex-wrap items-center gap-2">
        {selectedId ? <input type="hidden" name="persona" value={selectedId} /> : null}
        <label className="bg-surface border-border text-muted focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-subtle)] flex h-8 w-full items-center gap-2 rounded-[var(--radius-control)] border px-2.5 sm:w-60">
          <SearchIcon size={14} />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t.people.searchPlaceholder}
            aria-label={t.people.searchLabel}
            className="text-text placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <FilterSelect
          name="crew"
          label={t.people.filters.crew}
          value={crew}
          options={crewOptions}
          active={Boolean(crew)}
        />
        <FilterSelect
          name="active"
          label={t.people.filters.status}
          value={active}
          options={activeOptions}
          active={Boolean(active)}
        />
        <button type="submit" className="sr-only">
          {t.people.search}
        </button>
        {filtered ? (
          <Link href="/people" className="text-accent-strong hover:text-accent-hover text-sm font-medium">
            {t.people.clearFilters}
          </Link>
        ) : null}
      </form>

      <div
        className={cn("grid items-start gap-4", selectedId && "xl:grid-cols-[minmax(0,1fr)_520px]")}
      >
        <div>
          {personas.length === 0 ? (
            <EmptyState message={filtered ? t.people.emptyFiltered : t.people.empty} />
          ) : (
            <>
              <div className="bg-surface border-border hidden overflow-hidden rounded-[var(--radius-panel)] border md:block">
                <Table>
                  <THead>
                    <Tr className="hover:bg-transparent">
                      <Th className="px-4">{t.people.columns.name}</Th>
                      <Th>{t.people.columns.crew}</Th>
                      <Th>{t.people.columnsExtra.fitness}</Th>
                      {canWrite ? (
                        <Th className="text-right">
                          <span className="sr-only">{t.people.columns.actions}</span>
                        </Th>
                      ) : null}
                    </Tr>
                  </THead>
                  <TBody>
                    {personas.map((p) => (
                      <Tr key={p.id} selected={p.id === selectedId} className="last:border-b-0">
                        <Td className="h-11 px-4 whitespace-nowrap">
                          <Link
                            href={withPersona(p.id)}
                            className="text-text hover:text-text hidden flex-col leading-[1.3] hover:[&>span:first-child]:underline xl:flex"
                          >
                            <PersonaName persona={p} />
                          </Link>
                          <Link
                            href={`/people/${p.id}`}
                            className="text-text hover:text-text flex flex-col leading-[1.3] hover:[&>span:first-child]:underline xl:hidden"
                          >
                            <PersonaName persona={p} />
                          </Link>
                        </Td>
                        <Td className="text-muted whitespace-nowrap">{p.crew_name ?? "—"}</Td>
                        <Td className="whitespace-nowrap">
                          <Aptitude persona={p} />
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

              <ul className="divide-border border-border bg-surface divide-y rounded-[var(--radius-panel)] border md:hidden">
                {personas.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <Link
                      href={`/people/${p.id}`}
                      className="text-text hover:text-text flex min-h-12 min-w-0 flex-1 flex-col justify-center"
                    >
                      <span className="truncate text-sm font-medium">{p.full_name}</span>
                      <span className="text-muted flex flex-wrap items-center gap-x-3 text-xs">
                        <Mono>{p.dni}</Mono>
                        {p.crew_name ? <span>{p.crew_name}</span> : null}
                        <Aptitude persona={p} />
                      </span>
                    </Link>
                    {canWrite ? <PersonaSheet persona={p} crews={crews} /> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {selectedId ? (
          <aside className="bg-surface border-border hidden overflow-hidden rounded-[var(--radius-panel)] border xl:block">
            <PersonaDetail personaId={selectedId} panel closeHref={closeHref} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function PersonaName({ persona }: { persona: PersonaRow }) {
  return (
    <>
      <span className={cn(!persona.active && "text-muted")}>{persona.full_name}</span>
      <Mono className="text-muted text-xs">{persona.dni}</Mono>
    </>
  );
}
