import Form from "next/form";
import Link from "next/link";
import { FilterSelect } from "@/components/people/filter-select";
import { Mono, PageTitle } from "@/components/people/page-title";
import { StatusBadge, StatusDot } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckIcon } from "@/components/ui/icons";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { formatDateAr, todayInArt } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { withUser } from "@/lib/db";
import {
  loadFitnessPage,
  parseFitnessParams,
  type FitnessCell,
  type FitnessRow,
} from "@/lib/people/fitness";
import { getSession } from "@/lib/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const f = t.fitness;

/** One requirement cell: valid = neutral check + date, expiring = hollow amber, expired/missing = red. */
function Cell({ cell }: { cell: FitnessCell | undefined }) {
  const base = "inline-flex items-center gap-1.5 font-mono text-xs tabular-nums";
  const date = cell?.expiresOn ? formatDateAr(cell.expiresOn) : "—";
  if (!cell || cell.status === "missing") {
    return (
      <span className={cn(base, "text-danger gap-[7px] font-medium")}>
        <StatusDot status="expired" />
        {f.missing}
      </span>
    );
  }
  if (cell.status === "expired") {
    return (
      <span className={cn(base, "text-danger gap-[7px] font-medium")}>
        <StatusDot status="expired" />
        {date}
      </span>
    );
  }
  if (cell.status === "expiring") {
    return (
      <span className={cn(base, "text-warning gap-[7px] font-medium")}>
        <StatusDot status="expiring" />
        {date}
      </span>
    );
  }
  return (
    <span className={cn(base, "text-muted")}>
      <CheckIcon size={13} />
      {date}
    </span>
  );
}

function Result({ row }: { row: FitnessRow }) {
  return row.apto ? (
    <StatusBadge status="valid">{f.fit}</StatusBadge>
  ) : (
    <StatusBadge status="blocked">{f.unfit}</StatusBadge>
  );
}

function Soon({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <Mono className={cn("text-xl font-semibold", warn && value > 0 && "text-warning")}>
        {value}
      </Mono>
      <span className="text-muted">{label}</span>
    </span>
  );
}

export default async function FitnessPage({ searchParams }: { searchParams: SearchParams }) {
  const { userId } = await getSession();
  const filters = parseFitnessParams(await searchParams);
  const page = await withUser(userId, (db) => loadFitnessPage(db, filters));

  if (!page.task) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle title={f.title} />
        <EmptyState message={f.noTaskTypes} />
      </div>
    );
  }

  const { task, expiringSoon } = page;
  const crewId = page.filters.crewId ?? "";
  const locationId = page.filters.locationId ?? "";
  const requirements = task.requirements;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={f.title}
        subtitle={
          <>
            {f.subtitleAt} <Mono>{formatDateAr(todayInArt())}</Mono>
          </>
        }
      />

      <Form action="/people/fitness" className="flex flex-wrap items-center gap-2">
        <FilterSelect
          name="task"
          label={f.filterTask}
          value={task.id}
          options={page.taskTypes.map((tt) => ({ value: tt.id, label: tt.name }))}
          active
        />
        <FilterSelect
          name="crew"
          label={f.filterCrew}
          value={crewId}
          options={[
            { value: "", label: f.allCrews },
            ...page.crews.map((c) => ({ value: c.id, label: c.name })),
          ]}
          active={Boolean(crewId)}
        />
        <FilterSelect
          name="location"
          label={f.filterLocation}
          value={locationId}
          options={[
            { value: "", label: f.allLocations },
            ...page.locations.map((l) => ({ value: l.id, label: l.name })),
          ]}
          active={Boolean(locationId)}
        />
        <FilterSelect
          name="show"
          label={f.filterShow}
          value={page.filters.show}
          options={[
            { value: "all", label: f.showAll },
            { value: "unfit", label: f.showUnfit },
          ]}
          active={page.filters.show !== "all"}
        />
        <noscript>
          <button type="submit">{f.apply}</button>
        </noscript>
        <span className="flex-1" />
        <p className="text-muted">
          {f.summary.split(/(\{fit\}|\{unfit\})/).map((part, i) =>
            part === "{fit}" ? (
              <Mono key={i} className="text-text">
                {page.fitCount}
              </Mono>
            ) : part === "{unfit}" ? (
              <Mono key={i} className={cn(page.unfitCount > 0 && "text-danger")}>
                {page.unfitCount}
              </Mono>
            ) : (
              part
            ),
          )}
        </p>
      </Form>

      <section
        aria-label={f.soon.title}
        className="bg-surface border-border border-l-warning flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--radius-panel)] border border-l-2 px-4 py-3"
      >
        <span className="font-medium">{f.soon.title}</span>
        <Soon value={expiringSoon.in7} label={f.soon.in7} warn />
        <Soon value={expiringSoon.in15} label={f.soon.in15} />
        <Soon value={expiringSoon.in30} label={f.soon.in30} />
      </section>

      <p className="text-muted -mb-2 text-sm">
        {requirements.length > 0 ? `${f.requires} ${requirements.join(", ")}` : f.requiresNothing}
      </p>

      {page.rows.length === 0 ? (
        <EmptyState message={page.filters.show === "unfit" ? f.emptyUnfit : f.empty} />
      ) : (
        <div className="bg-surface border-border overflow-hidden rounded-[var(--radius-panel)] border">
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th className="h-11 px-4">{f.colPersona}</Th>
                <Th className="h-11">{f.colCrew}</Th>
                {requirements.map((name) => (
                  <Th key={name} className="h-11 leading-[1.3]">
                    {name}
                  </Th>
                ))}
                <Th className="h-11">{f.colResult}</Th>
              </Tr>
            </THead>
            <TBody>
              {page.rows.map((row) => (
                <Tr key={row.personaId} className="last:border-b-0">
                  <Td className="px-4 whitespace-nowrap">
                    <Link
                      href={`/people/${row.personaId}`}
                      className="text-text hover:text-text underline-offset-2 hover:underline"
                    >
                      {row.fullName}
                    </Link>
                  </Td>
                  <Td className="text-muted whitespace-nowrap">{row.crewName ?? f.noCrew}</Td>
                  {requirements.map((name) => (
                    <Td key={name} className="whitespace-nowrap">
                      <Cell cell={row.cells.find((c) => c.name === name)} />
                    </Td>
                  ))}
                  <Td className="whitespace-nowrap">
                    <Result row={row} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
