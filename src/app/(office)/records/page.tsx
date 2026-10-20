import Link from "next/link";
import { FilterSelect } from "@/components/people/filter-select";
import { Mono, PageTitle } from "@/components/people/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { listRecordFilterOptions, listRecords, RECORD_STATUSES } from "@/lib/office/records";
import { getSession } from "@/lib/session";
import { authorLabel, formatArt } from "./format";
import { RecordStatusBadge } from "./status-badge";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function RecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const typeParam = first(params.type);
  const type = UUID.test(typeParam) ? typeParam : "";
  const crewParam = first(params.crew);
  const crew = UUID.test(crewParam) ? crewParam : "";
  const statusParam = first(params.status);
  const status = (RECORD_STATUSES as readonly string[]).includes(statusParam) ? statusParam : "";
  const fromParam = first(params.from);
  const from = DAY.test(fromParam) && !Number.isNaN(Date.parse(fromParam)) ? fromParam : "";
  const toParam = first(params.to);
  const to = DAY.test(toParam) && !Number.isNaN(Date.parse(toParam)) ? toParam : "";
  const filtered = Boolean(type || crew || status || from || to);

  const session = await getSession();
  const [rows, options] = await Promise.all([
    listRecords(session.userId, { type, crew, status, from, to }),
    listRecordFilterOptions(session.userId),
  ]);

  const f = t.records.filters;
  const typeOptions = [
    { value: "", label: f.allTypes },
    ...options.types.map((o) => ({ value: o.id, label: o.name })),
  ];
  const crewOptions = [
    { value: "", label: f.allCrews },
    ...options.crews.map((o) => ({ value: o.id, label: o.name })),
  ];
  const statusOptions = [
    { value: "", label: f.allStatuses },
    ...RECORD_STATUSES.map((s) => ({ value: s, label: t.records.status[s] })),
  ];
  const dateClass =
    "bg-surface border-border text-text focus:border-accent h-8 rounded-[var(--radius-control)] border px-2 font-mono text-sm tabular-nums outline-none focus:shadow-[0_0_0_3px_var(--accent-subtle)]";

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={t.nav.office.records}
        subtitle={<Mono>{t.records.subtitle(rows.length)}</Mono>}
      />

      <form method="get" role="search" className="flex flex-wrap items-center gap-2">
        <FilterSelect
          name="type"
          label={f.type}
          value={type}
          options={typeOptions}
          active={Boolean(type)}
        />
        <FilterSelect
          name="crew"
          label={f.crew}
          value={crew}
          options={crewOptions}
          active={Boolean(crew)}
        />
        <FilterSelect
          name="status"
          label={f.status}
          value={status}
          options={statusOptions}
          active={Boolean(status)}
        />
        <label className="text-muted flex items-center gap-1.5 text-sm">
          {f.from}
          <input type="date" name="from" defaultValue={from} className={dateClass} />
        </label>
        <label className="text-muted flex items-center gap-1.5 text-sm">
          {f.to}
          <input type="date" name="to" defaultValue={to} className={dateClass} />
        </label>
        <button
          type="submit"
          className="border-border bg-surface hover:bg-hover h-8 rounded-[var(--radius-control)] border px-3 text-sm"
        >
          {t.records.search}
        </button>
        {filtered ? (
          <Link
            href="/records"
            className="text-accent-strong hover:text-accent-hover text-sm font-medium"
          >
            {t.records.clearFilters}
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState message={filtered ? t.records.emptyFiltered : t.empty.records} />
      ) : (
        <div className="bg-surface border-border overflow-hidden rounded-[var(--radius-panel)] border">
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th className="px-4">{t.records.columns.date}</Th>
                <Th>{t.records.columns.type}</Th>
                <Th>{t.records.columns.crew}</Th>
                <Th>{t.records.columns.location}</Th>
                <Th>{t.records.columns.author}</Th>
                <Th>{t.records.columns.status}</Th>
                <Th className="text-right">{t.records.columns.people}</Th>
                <Th className="pr-4 text-right">{t.records.columns.signatures}</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id} className="last:border-b-0">
                  <Td className="h-11 px-4 whitespace-nowrap">
                    <Link
                      href={`/records/${r.id}`}
                      className="text-text font-mono tabular-nums hover:underline"
                    >
                      {formatArt(r.occurred_at)}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{r.type_name}</Td>
                  <Td className="text-muted whitespace-nowrap">{r.crew_name}</Td>
                  <Td className="text-muted whitespace-nowrap">{r.location_name}</Td>
                  <Td className="text-muted whitespace-nowrap">
                    {authorLabel(r.author_id, session.userId)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <RecordStatusBadge status={r.status} />
                  </Td>
                  <Td className="text-right font-mono tabular-nums">{r.participant_count}</Td>
                  <Td className="pr-4 text-right font-mono tabular-nums">{r.signature_count}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
