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

export async function listPersonas(userId: string, filters: PersonaFilters): Promise<PersonaRow[]> {
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
    select p.id, p.full_name, p.dni, p.crew_id, c.name as crew_name, p.active
    from public.personas p
    left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by lower(p.full_name), p.id
    limit ${LIST_LIMIT}`;

  return withUser(userId, async (db) => (await db.query<PersonaRow>(sql, params)).rows);
}

export async function listCrews(userId: string): Promise<CrewRow[]> {
  return withUser(
    userId,
    async (db) =>
      (
        await db.query<CrewRow>(`
          select c.id, c.name, c.supervisor_persona_id, s.full_name as supervisor_name,
                 c.location_id, l.name as location_name,
                 (select count(*) from public.personas p
                   where p.company_id = c.company_id and p.crew_id = c.id)::int as persona_count
          from public.crews c
          left join public.personas s on s.company_id = c.company_id and s.id = c.supervisor_persona_id
          left join public.locations l on l.company_id = c.company_id and l.id = c.location_id
          order by lower(c.name), c.id`)
      ).rows,
  );
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
