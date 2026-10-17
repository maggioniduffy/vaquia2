import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label, Select } from "@/components/ui/select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { withUser } from "@/lib/db";
import {
  describeIssue,
  loadFitnessPage,
  parseFitnessParams,
  type FitnessRow,
} from "@/lib/people/fitness";
import { getSession } from "@/lib/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function StatusBadge({ row }: { row: FitnessRow }) {
  if (!row.apto) return <Badge tone="danger">{t.fitness.unfit}</Badge>;
  if (row.expiring) return <Badge tone="warning">{t.fitness.fitExpiring}</Badge>;
  return <Badge tone="neutral">{t.fitness.fit}</Badge>;
}

function Reasons({ row }: { row: FitnessRow }) {
  if (row.issues.length === 0) return <span className="text-muted">—</span>;
  return (
    <ul className="space-y-0.5">
      {row.issues.map((issue) => (
        <li key={`${issue.name}-${issue.status}`}>{describeIssue(issue)}</li>
      ))}
    </ul>
  );
}

export default async function FitnessPage({ searchParams }: { searchParams: SearchParams }) {
  const { userId } = await getSession();
  const filters = parseFitnessParams(await searchParams);
  const page = await withUser(userId, (db) => loadFitnessPage(db, filters));
  const f = t.fitness;

  if (!page.task) {
    return (
      <>
        <PageHeader title={f.title} />
        <EmptyState message={f.noTaskTypes} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={f.title} />

      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div className="space-y-1">
          <Label htmlFor="task">{f.filterTask}</Label>
          <Select id="task" name="task" defaultValue={page.task.id}>
            {page.taskTypes.map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="crew">{f.filterCrew}</Label>
          <Select id="crew" name="crew" defaultValue={page.filters.crewId ?? ""}>
            <option value="">{f.allCrews}</option>
            {page.crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="location">{f.filterLocation}</Label>
          <Select id="location" name="location" defaultValue={page.filters.locationId ?? ""}>
            <option value="">{f.allLocations}</option>
            {page.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="show">{f.filterShow}</Label>
          <Select id="show" name="show" defaultValue={page.filters.show}>
            <option value="all">{f.showAll}</option>
            <option value="unfit">{f.showUnfit}</option>
          </Select>
        </div>
        <Button type="submit" variant="primary">
          {f.apply}
        </Button>
      </form>

      <div className="mb-4 space-y-1 text-sm">
        <p>
          {f.summary.split(/(\{fit\}|\{unfit\})/).map((part, i) =>
            part === "{fit}" || part === "{unfit}" ? (
              <span key={i} className="font-mono tabular-nums">
                {part === "{fit}" ? page.fitCount : page.unfitCount}
              </span>
            ) : (
              part
            ),
          )}
        </p>
        <p className="text-muted">
          {page.task.requirements.length > 0
            ? `${f.requires} ${page.task.requirements.join(", ")}`
            : f.requiresNothing}
        </p>
      </div>

      {page.rows.length === 0 ? (
        <EmptyState message={page.filters.show === "unfit" ? f.emptyUnfit : f.empty} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <Tr>
                  <Th>{f.colPersona}</Th>
                  <Th>{f.colDni}</Th>
                  <Th>{f.colCrew}</Th>
                  <Th>{f.colStatus}</Th>
                  <Th>{f.colReason}</Th>
                </Tr>
              </THead>
              <TBody>
                {page.rows.map((row) => (
                  <Tr key={row.personaId} className="align-top">
                    <Td className="py-2.5">
                      <Link
                        href={`/people/${row.personaId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.fullName}
                      </Link>
                    </Td>
                    <Td className="py-2.5 font-mono tabular-nums">{row.dni}</Td>
                    <Td className="py-2.5">
                      {row.crewName ?? <span className="text-muted">{f.noCrew}</span>}
                    </Td>
                    <Td className="py-2.5 whitespace-nowrap">
                      <StatusBadge row={row} />
                    </Td>
                    <Td className="py-2.5">
                      <Reasons row={row} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          <ul className="divide-border divide-y md:hidden">
            {page.rows.map((row) => (
              <li key={row.personaId} className="space-y-1 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/people/${row.personaId}`} className="font-medium">
                    {row.fullName}
                  </Link>
                  <StatusBadge row={row} />
                </div>
                <p className="text-muted">
                  <span className="font-mono tabular-nums">{row.dni}</span>
                  {" · "}
                  {row.crewName ?? f.noCrew}
                </p>
                {row.issues.length > 0 && <Reasons row={row} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
