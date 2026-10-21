import "server-only";
import { withUser } from "@/lib/db";
import type { Operator } from "./types";

// Read queries for the office people screens. Always through withUser() so RLS applies.

export type PersonaRow = {
  id: string;
  full_name: string;
  dni: string;
  crew_id: string | null;
  crew_name: string | null;
  active: boolean;
  /** Task types the persona is not fit for (0 for inactive personas: the views skip them). */
  unfit_tasks: number;
  /** Required qualifications expiring within 30 days. */
  expiring_count: number;
};

export type CrewRow = {
  id: string;
  name: string;
  supervisor_persona_id: string | null;
  supervisor_name: string | null;
  location_id: string | null;
  location_name: string | null;
  persona_count: number;
};

export type LocationRow = {
  id: string;
  name: string;
  field: string | null;
  operator_id: string | null;
  operator_name: string | null;
  lat: string | null;
  lng: string | null;
};

export type Option = { id: string; name: string };
export type PersonaOption = Option & { active: boolean };

export type PersonaFilters = {
  q: string;
  /** crew uuid, "none" (no crew) or "" (all). */
  crew: string;
  /** "1" active, "0" inactive, "" all. */
  active: string;
};

const LIST_LIMIT = 500;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Personas list SQL. Personas are filtered, ordered and limited first (CTE); the fitness counters are
 * then computed only for those rows, with a single qualification_status pass per persona:
 * unfit = task types with a missing/expired requirement (= not apto in persona_task_fitness),
 * expiring = distinct required qualification types expiring.
 */
export function personasSql(filters: PersonaFilters): { sql: string; params: unknown[] } {
  const q = filters.q.trim();
  const dniDigits = q.replace(/\D/g, "");
  const params: unknown[] = [];
  const where: string[] = [];

  if (q) {
    params.push(`%${escapeLike(q)}%`);
    const nameParam = `$${params.length}`;
    if (dniDigits) {
      params.push(`%${escapeLike(dniDigits)}%`);
      where.push(`(p.full_name ilike ${nameParam} or p.dni like $${params.length})`);
    } else {
      where.push(`p.full_name ilike ${nameParam}`);
    }
  }
  if (filters.crew === "none") {
    where.push("p.crew_id is null");
  } else if (filters.crew) {
    params.push(filters.crew);
    where.push(`p.crew_id = $${params.length}`);
  }
  if (filters.active === "1") where.push("p.active");
  if (filters.active === "0") where.push("not p.active");

  const sql = `
    with page as (
      select p.id, p.company_id, p.full_name, p.dni, p.crew_id, c.name as crew_name, p.active
        from public.personas p
        left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
        ${where.length ? `where ${where.join(" and ")}` : ""}
        order by lower(p.full_name), p.id
        limit ${LIST_LIMIT})
    select page.id, page.full_name, page.dni, page.crew_id, page.crew_name, page.active,
      coalesce(f.unfit, 0)::int as unfit_tasks,
      coalesce(f.expiring, 0)::int as expiring_count
    from page
    left join lateral (
      select count(distinct qs.task_type_id) filter (where qs.status in ('missing', 'expired')) as unfit,
             count(distinct qs.qualification_type_id) filter (where qs.status = 'expiring') as expiring
        from public.qualification_status qs
       where qs.persona_id = page.id
    ) f on true
    order by lower(page.full_name), page.id`;
  return { sql, params };
}

export async function listPersonas(userId: string, filters: PersonaFilters): Promise<PersonaRow[]> {
  const { sql, params } = personasSql(filters);
  return withUser(userId, async (db) => (await db.query<PersonaRow>(sql, params)).rows);
}

/** Crews with their persona count (one grouped join instead of a correlated count per crew). */
export const CREWS_SQL = `
  select c.id, c.name, c.supervisor_persona_id, s.full_name as supervisor_name,
         c.location_id, l.name as location_name,
         coalesce(pc.n, 0)::int as persona_count
    from public.crews c
    left join public.personas s on s.company_id = c.company_id and s.id = c.supervisor_persona_id
    left join public.locations l on l.company_id = c.company_id and l.id = c.location_id
    left join (
      select company_id, crew_id, count(*) as n
        from public.personas
       where crew_id is not null
       group by company_id, crew_id
    ) pc on pc.company_id = c.company_id and pc.crew_id = c.id
   order by lower(c.name), c.id`;

export async function listCrews(userId: string): Promise<CrewRow[]> {
  return withUser(userId, async (db) => (await db.query<CrewRow>(CREWS_SQL)).rows);
}

export async function listLocations(userId: string): Promise<LocationRow[]> {
  return withUser(
    userId,
    async (db) =>
      (
        await db.query<LocationRow>(`
          select l.id, l.name, l.field, l.operator_id, o.name as operator_name,
                 l.lat::text as lat, l.lng::text as lng
          from public.locations l
          left join public.operators o on o.id = l.operator_id
          order by lower(l.name), l.id`)
      ).rows,
  );
}

export async function listCrewOptions(userId: string): Promise<Option[]> {
  return withUser(
    userId,
    async (db) =>
      (await db.query<Option>("select id, name from public.crews order by lower(name), id")).rows,
  );
}

export async function listLocationOptions(userId: string): Promise<Option[]> {
  return withUser(
    userId,
    async (db) =>
      (await db.query<Option>("select id, name from public.locations order by lower(name), id"))
        .rows,
  );
}

export async function listPersonaOptions(userId: string): Promise<PersonaOption[]> {
  return withUser(
    userId,
    async (db) =>
      (
        await db.query<PersonaOption>(
          "select id, full_name as name, active from public.personas order by lower(full_name), id",
        )
      ).rows,
  );
}

export async function listOperators(userId: string): Promise<Pick<Operator, "id" | "name">[]> {
  return withUser(
    userId,
    async (db) =>
      (
        await db.query<Pick<Operator, "id" | "name">>(
          "select id, name from public.operators order by name",
        )
      ).rows,
  );
}
