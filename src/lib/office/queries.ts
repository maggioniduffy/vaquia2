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
    }>(
      `select * from (
       select distinct on (qs.persona_id, qs.qualification_type_id)
              p.id as persona_id, p.full_name, c.name as crew_name,
              qt.name as qualification_name, to_char(qs.expires_on, 'YYYY-MM-DD') as expires_on,
              qs.status
         from public.qualification_status qs
         join public.personas p on p.company_id = qs.company_id and p.id = qs.persona_id
         join public.qualification_types qt on qt.id = qs.qualification_type_id
         left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
        where qs.status = 'expired' or (qs.status = 'expiring' and qs.days_left <= $1)
        order by qs.persona_id, qs.qualification_type_id) a
        order by expires_on, full_name
        limit 50`,
      [days],
    );
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

/** Personas with at least one qualification whose status is expired or expiring (as defined by the qualification_status view). */
export async function countHabilitaciones(userId: string): Promise<number> {
  return withUser(userId, async (db) => {
    const res = await db.query<{ n: number }>(
      `select count(distinct persona_id)::int as n
         from public.qualification_status
        where status in ('expired', 'expiring')`,
    );
    return res.rows[0]?.n ?? 0;
  });
}
