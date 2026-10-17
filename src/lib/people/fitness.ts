import { z } from "zod";
import { formatDateAr } from "@/lib/dates";
import type { Db } from "@/lib/db";
import { t } from "@/i18n/es-AR";
import type { QualificationStatusValue } from "./types";

// "Personal apto / no apto" (automations.md#A1). Read-only; status comes from the DB views.

export type FitnessShow = "all" | "unfit";

export type FitnessFilters = {
  taskTypeId?: string;
  crewId?: string;
  locationId?: string;
  show: FitnessShow;
};

export type FitnessTaskType = {
  id: string;
  code: string;
  name: string;
  /** Names of the required qualification types (global defaults + company additions). */
  requirements: string[];
};

export type FitnessOption = { id: string; name: string };

export type FitnessIssue = {
  name: string;
  status: Exclude<QualificationStatusValue, "valid">;
  expiresOn: string | null;
  daysLeft: number | null;
};

/** One required qualification of the selected task for one persona (any status). */
export type FitnessCell = {
  name: string;
  status: QualificationStatusValue;
  expiresOn: string | null;
  daysLeft: number | null;
};

export type ExpiringSoon = { in7: number; in15: number; in30: number };

export type FitnessRow = {
  personaId: string;
  fullName: string;
  dni: string;
  crewName: string | null;
  apto: boolean;
  expiring: boolean;
  /** Non-valid requirements, most severe first. */
  issues: FitnessIssue[];
  /** Every required qualification of the task (valid ones included), by name. */
  cells: FitnessCell[];
};

export type FitnessPage = {
  taskTypes: FitnessTaskType[];
  crews: FitnessOption[];
  locations: FitnessOption[];
  /** Filters after validation and defaulting (task type is always resolved when any exist). */
  filters: FitnessFilters & { taskTypeId?: string };
  task: FitnessTaskType | null;
  fitCount: number;
  unfitCount: number;
  /** Expiring qualifications (persona x requirement) among the filtered personas, cumulative. */
  expiringSoon: ExpiringSoon;
  /** Rows to display (the "show" filter applied). */
  rows: FitnessRow[];
};

const uuid = z.string().uuid();
const showSchema = z.enum(["all", "unfit"]);

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Invalid or missing GET params are ignored (never an error page). */
export function parseFitnessParams(raw: RawParams): FitnessFilters {
  const uuidOf = (key: string) => {
    const parsed = uuid.safeParse(first(raw[key]));
    return parsed.success ? parsed.data : undefined;
  };
  const show = showSchema.safeParse(first(raw.show));
  return {
    taskTypeId: uuidOf("task"),
    crewId: uuidOf("crew"),
    locationId: uuidOf("location"),
    show: show.success ? show.data : "all",
  };
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

/** Human text for one non-valid requirement. */
export function describeIssue(issue: FitnessIssue): string {
  const f = t.fitness;
  const date = issue.expiresOn ? formatDateAr(issue.expiresOn) : "";
  if (issue.status === "missing") return fill(f.reasonMissing, { name: issue.name });
  if (issue.status === "expired") return fill(f.reasonExpired, { name: issue.name, date });
  if (issue.daysLeft === 1) return fill(f.reasonExpiringOne, { name: issue.name, date });
  return fill(f.reasonExpiring, { name: issue.name, days: issue.daysLeft ?? 0, date });
}

const SEVERITY: Record<FitnessIssue["status"], number> = { expired: 0, missing: 1, expiring: 2 };

type RowRecord = {
  persona_id: string;
  full_name: string;
  dni: string;
  crew_name: string | null;
  apto: boolean;
  issues: {
    name: string;
    status: FitnessIssue["status"];
    expires_on: string | null;
    days_left: number | null;
  }[];
  cells: {
    name: string;
    status: QualificationStatusValue;
    expires_on: string | null;
    days_left: number | null;
  }[];
};

/** No aptos first, then apto-but-expiring, then the rest; by name inside each group. */
function rank(row: FitnessRow): number {
  if (!row.apto) return 0;
  return row.expiring ? 1 : 2;
}

export async function loadFitnessPage(db: Db, filters: FitnessFilters): Promise<FitnessPage> {
  const [taskTypesRes, crewsRes, locationsRes] = await Promise.all([
    db.query<{ id: string; code: string; name: string; requirements: string[] }>(
      `select tt.id, tt.code, tt.name,
              coalesce(
                (select array_agg(distinct qt.name order by qt.name)
                   from public.task_requirements tr
                   join public.qualification_types qt on qt.id = tr.qualification_type_id
                  where tr.task_type_id = tt.id),
                '{}'
              ) as requirements
         from public.task_types tt
        order by tt.company_id nulls first, tt.code`,
    ),
    db.query<FitnessOption>("select id, name from public.crews order by name"),
    db.query<FitnessOption>("select id, name from public.locations order by name"),
  ]);

  const taskTypes = taskTypesRes.rows;
  // Default: first non-"general" type (altura), falling back to whatever exists.
  const task =
    taskTypes.find((tt) => tt.id === filters.taskTypeId) ??
    taskTypes.find((tt) => tt.code !== "general") ??
    taskTypes[0] ??
    null;
  const crewId = crewsRes.rows.some((c) => c.id === filters.crewId) ? filters.crewId : undefined;
  const locationId = locationsRes.rows.some((l) => l.id === filters.locationId)
    ? filters.locationId
    : undefined;
  const resolved = { taskTypeId: task?.id, crewId, locationId, show: filters.show };

  let all: FitnessRow[] = [];
  if (task) {
    const res = await db.query<RowRecord>(
      `select p.id as persona_id, p.full_name, p.dni, c.name as crew_name, f.apto,
              coalesce(
                (select json_agg(
                          json_build_object(
                            'name', qt.name,
                            'status', qs.status,
                            'expires_on', qs.expires_on,
                            'days_left', qs.days_left
                          )
                          order by qt.name
                        )
                   from public.qualification_status qs
                   join public.qualification_types qt on qt.id = qs.qualification_type_id
                  where qs.persona_id = f.persona_id
                    and qs.task_type_id = f.task_type_id
                    and qs.status <> 'valid'),
                '[]'::json
              ) as issues,
              coalesce(
                (select json_agg(
                          json_build_object(
                            'name', qt.name,
                            'status', qs.status,
                            'expires_on', qs.expires_on,
                            'days_left', qs.days_left
                          )
                          order by qt.name
                        )
                   from public.qualification_status qs
                   join public.qualification_types qt on qt.id = qs.qualification_type_id
                  where qs.persona_id = f.persona_id
                    and qs.task_type_id = f.task_type_id),
                '[]'::json
              ) as cells
         from public.persona_task_fitness f
         join public.personas p on p.company_id = f.company_id and p.id = f.persona_id
         left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
        where f.task_type_id = $1
          and ($2::uuid is null or p.crew_id = $2)
          and ($3::uuid is null or c.location_id = $3)`,
      [task.id, crewId ?? null, locationId ?? null],
    );
    all = res.rows
      .map((r): FitnessRow => {
        const issues = r.issues
          .map((i) => ({
            name: i.name,
            status: i.status,
            expiresOn: i.expires_on,
            daysLeft: i.days_left,
          }))
          .sort(
            (a, b) =>
              SEVERITY[a.status] - SEVERITY[b.status] ||
              (a.daysLeft ?? 0) - (b.daysLeft ?? 0) ||
              a.name.localeCompare(b.name, "es"),
          );
        return {
          personaId: r.persona_id,
          fullName: r.full_name,
          dni: r.dni,
          crewName: r.crew_name,
          apto: r.apto,
          expiring: r.apto && issues.some((i) => i.status === "expiring"),
          issues,
          cells: r.cells.map((c) => ({
            name: c.name,
            status: c.status,
            expiresOn: c.expires_on,
            daysLeft: c.days_left,
          })),
        };
      })
      .sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName, "es"));
  }

  const fitCount = all.filter((r) => r.apto).length;
  const expiringSoon: ExpiringSoon = { in7: 0, in15: 0, in30: 0 };
  for (const row of all) {
    for (const c of row.cells) {
      if (c.status !== "expiring" || c.daysLeft === null) continue;
      if (c.daysLeft <= 7) expiringSoon.in7 += 1;
      if (c.daysLeft <= 15) expiringSoon.in15 += 1;
      if (c.daysLeft <= 30) expiringSoon.in30 += 1;
    }
  }
  return {
    taskTypes,
    crews: crewsRes.rows,
    locations: locationsRes.rows,
    filters: resolved,
    task,
    fitCount,
    unfitCount: all.length - fitCount,
    expiringSoon,
    rows: filters.show === "unfit" ? all.filter((r) => !r.apto) : all,
  };
}
