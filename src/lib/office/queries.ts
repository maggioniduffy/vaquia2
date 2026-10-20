import "server-only";
import { withUser } from "@/lib/db";

export type AttentionItem = {
  personaId: string;
  fullName: string;
  crewName: string | null;
  qualificationName: string;
  expiresOn: string;
  status: "expired" | "expiring";
};

/**
 * Current (latest per persona x type) qualifications that are expired, or expiring within `$1` days,
 * for active personas, limited to types some task type requires. Same rows as the old
 * qualification_status-based query (which deduped persona x task type x type), without building
 * personas x task types. "Required" is evaluated once (hashed subplan): RLS already limits task
 * types and requirements to global + the caller's company, which is the view's per-persona rule.
 * Ties on (expires_on, full_name) break by persona then type for a stable top 50.
 */
export const ATTENTION_SQL = `
  select p.id as persona_id, p.full_name, c.name as crew_name,
         qt.name as qualification_name, to_char(cq.expires_on, 'YYYY-MM-DD') as expires_on,
         cq.status
    from public.current_qualifications cq
    join public.personas p on p.company_id = cq.company_id and p.id = cq.persona_id and p.active
    join public.qualification_types qt on qt.id = cq.type_id
    left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
   where (cq.status = 'expired' or (cq.status = 'expiring' and cq.days_left <= $1))
     and cq.type_id in (select tr.qualification_type_id
                          from public.task_requirements tr
                          join public.task_types tt on tt.id = tr.task_type_id)
   order by cq.expires_on, p.full_name, p.id, cq.type_id
   limit 50`;

/** Qualifications expired, or expiring within `days`, for active personas (deduped by persona x type). */
export async function listAttention(userId: string, days = 7): Promise<AttentionItem[]> {
  return withUser(userId, async (db) => {
    const res = await db.query<{
      persona_id: string;
      full_name: string;
      crew_name: string | null;
      qualification_name: string;
      expires_on: string;
      status: "expired" | "expiring";
    }>(ATTENTION_SQL, [days]);
    return res.rows
      .map((r) => ({
        personaId: r.persona_id,
        fullName: r.full_name,
        crewName: r.crew_name,
        qualificationName: r.qualification_name,
        expiresOn: r.expires_on,
        status: r.status,
      }))
      .sort(
        (a, b) =>
          a.expiresOn.localeCompare(b.expiresOn) || a.fullName.localeCompare(b.fullName, "es"),
      );
  });
}

/**
 * Active personas with a current qualification that is expired or expiring and required by some task
 * type (same count as the old count(distinct persona_id) over qualification_status, which also only
 * saw required types of active personas).
 */
export const COUNT_HABILITACIONES_SQL = `
  select count(distinct cq.persona_id)::int as n
    from public.current_qualifications cq
    join public.personas p on p.company_id = cq.company_id and p.id = cq.persona_id and p.active
   where cq.status in ('expired', 'expiring')
     and cq.type_id in (select tr.qualification_type_id
                          from public.task_requirements tr
                          join public.task_types tt on tt.id = tr.task_type_id)`;

/** Personas with at least one qualification whose status is expired or expiring (see COUNT_HABILITACIONES_SQL). */
export async function countHabilitaciones(userId: string): Promise<number> {
  return withUser(userId, async (db) => {
    const res = await db.query<{ n: number }>(COUNT_HABILITACIONES_SQL);
    return res.rows[0]?.n ?? 0;
  });
}
