import "server-only";
import type { Db } from "@/lib/db";
import { withUser } from "@/lib/db";
import { isUuid } from "@/lib/storage/keys";
import type { CurrentQualification, QualificationType } from "./types";

export type PersonaHeader = {
  id: string;
  full_name: string;
  dni: string;
  active: boolean;
  crew_name: string | null;
};

export type QualificationRow = {
  id: string;
  type_id: string;
  type_name: string;
  issued_on: string;
  expires_on: string | null;
  file_path: string | null;
  created_at: string;
  is_current: boolean;
};

export type CurrentQualificationRow = Pick<
  CurrentQualification,
  "qualification_id" | "type_id" | "issued_on" | "expires_on" | "file_path" | "status" | "days_left"
> & { type_name: string };

export type FitnessRow = { task_type_id: string; task_name: string; apto: boolean };

export type PersonaDetail = {
  persona: PersonaHeader;
  current: CurrentQualificationRow[];
  history: QualificationRow[];
  types: Pick<QualificationType, "id" | "name" | "default_validity_months">[];
  fitness: FitnessRow[];
};

/**
 * Qualification history of persona $1, newest first. is_current marks the latest per type
 * (issued_on, created_at, id desc: the current_qualifications rule), computed over this persona's
 * rows only instead of joining the company-wide DISTINCT ON view.
 */
export const PERSONA_HISTORY_SQL = `
  select q.id, q.type_id, qt.name as type_name,
         q.issued_on::text as issued_on, q.expires_on::text as expires_on,
         q.file_path, q.created_at::text as created_at, q.is_current
    from (
      select q.*,
             (row_number() over (
                partition by q.type_id
                order by q.issued_on desc, q.created_at desc, q.id desc
              ) = 1) as is_current
        from public.qualifications q
       where q.persona_id = $1
    ) q
    join public.qualification_types qt on qt.id = q.type_id
   order by q.issued_on desc, q.created_at desc, q.id desc`;

// date columns are cast to text so `pg` does not turn them into JS Dates (timezone shifts).
async function load(db: Db, personaId: string): Promise<PersonaDetail | null> {
  const personaRes = await db.query<PersonaHeader>(
    `select p.id, p.full_name, p.dni, p.active, c.name as crew_name
       from public.personas p
       left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
      where p.id = $1`,
    [personaId],
  );
  const persona = personaRes.rows[0];
  if (!persona) return null;

  const current = await db.query<CurrentQualificationRow>(
    `select cq.qualification_id, cq.type_id, qt.name as type_name,
              cq.issued_on::text as issued_on, cq.expires_on::text as expires_on,
              cq.file_path, cq.status, cq.days_left
         from public.current_qualifications cq
         join public.qualification_types qt on qt.id = cq.type_id
        where cq.persona_id = $1
        order by qt.name`,
    [personaId],
  );
  const history = await db.query<QualificationRow>(PERSONA_HISTORY_SQL, [personaId]);
  const types = await db.query<PersonaDetail["types"][number]>(
    `select id, name, default_validity_months
         from public.qualification_types
        order by name`,
  );
  const fitness = await db.query<FitnessRow>(
    `select f.task_type_id, tt.name as task_name, f.apto
         from public.persona_task_fitness f
         join public.task_types tt on tt.id = f.task_type_id
        where f.persona_id = $1
        order by tt.name`,
    [personaId],
  );

  return {
    persona,
    current: current.rows,
    history: history.rows,
    types: types.rows,
    fitness: fitness.rows,
  };
}

/** Null when the id is malformed or the persona is not visible under RLS (other company). */
export async function getPersonaDetail(
  userId: string,
  personaId: string,
): Promise<PersonaDetail | null> {
  if (!isUuid(personaId)) return null;
  return withUser(userId, (db) => load(db, personaId));
}
