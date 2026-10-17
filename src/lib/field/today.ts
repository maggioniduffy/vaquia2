import "server-only";
import { cache } from "react";
import { withUser } from "@/lib/db";

export type ExpiringQualification = {
  personaName: string;
  typeName: string;
  expiresOn: string;
  daysLeft: number;
};

export type FieldToday = {
  personaName: string | null;
  crew: {
    name: string;
    members: number;
    locationName: string | null;
    locationField: string | null;
  } | null;
  expiring: ExpiringQualification[];
};

const EXPIRING_DAYS = 7;

type ContextRow = {
  persona_name: string | null;
  crew_id: string | null;
  crew_name: string | null;
  members: number | null;
  location_name: string | null;
  location_field: string | null;
};

type ExpiringRow = {
  persona_name: string;
  type_name: string;
  expires_on: string;
  days_left: number;
};

/** The signed-in user's persona -> crew -> location, plus crew qualifications expiring in 7 days. */
export const getFieldToday = cache(async (userId: string): Promise<FieldToday> => {
  return withUser(userId, async (db) => {
    const ctx = (
      await db.query<ContextRow>(
        `select p.full_name as persona_name, c.id as crew_id, c.name as crew_name,
                (select count(*) from public.personas m
                  where m.company_id = c.company_id and m.crew_id = c.id and m.active)::int as members,
                l.name as location_name, l.field as location_field
         from public.memberships ms
         join public.personas p on p.company_id = ms.company_id and p.id = ms.persona_id
         left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
         left join public.locations l on l.company_id = c.company_id and l.id = c.location_id
         where ms.user_id = $1 and ms.company_id = public.current_company_id()`,
        [userId],
      )
    ).rows[0];

    if (!ctx) return { personaName: null, crew: null, expiring: [] };
    if (!ctx.crew_id || !ctx.crew_name) {
      return { personaName: ctx.persona_name, crew: null, expiring: [] };
    }

    const expiring = (
      await db.query<ExpiringRow>(
        `select p.full_name as persona_name, qt.name as type_name,
                cq.expires_on::text as expires_on, cq.days_left
         from public.current_qualifications cq
         join public.personas p on p.company_id = cq.company_id and p.id = cq.persona_id
         join public.qualification_types qt on qt.id = cq.type_id
         where p.crew_id = $1 and p.active and cq.status = 'expiring' and cq.days_left <= $2
         order by cq.days_left, lower(p.full_name)
         limit 5`,
        [ctx.crew_id, EXPIRING_DAYS],
      )
    ).rows;

    return {
      personaName: ctx.persona_name,
      crew: {
        name: ctx.crew_name,
        members: ctx.members ?? 0,
        locationName: ctx.location_name,
        locationField: ctx.location_field,
      },
      expiring: expiring.map((r) => ({
        personaName: r.persona_name,
        typeName: r.type_name,
        expiresOn: r.expires_on,
        daysLeft: r.days_left,
      })),
    };
  });
});
