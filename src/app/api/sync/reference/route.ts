import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withUser } from "@/lib/db";
import type { ReferencePayload } from "@/lib/offline/reference-types";

export const dynamic = "force-dynamic";

// Reference data the field PWA caches on the device, for the caller's current company (RLS).
// Qualification status comes straight from the phase-1 `qualification_status` view, so the rules
// (valid / expiring / expired / missing) stay defined in one place.
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const payload = await withUser(session.user.id, async (db) => {
    const company = (
      await db.query<{ id: string | null }>("select public.current_company_id() as id")
    ).rows[0]?.id;
    if (!company) return null;

    const [personas, crews, locations, taskTypes, recordTypes, qualStatus, schemas] =
      await Promise.all([
        db.query(
          `select id, full_name, dni, crew_id from public.personas where active order by lower(full_name), id`,
        ),
        db.query(
          `select id, name, location_id, supervisor_persona_id from public.crews order by lower(name), id`,
        ),
        db.query(
          `select id, name, field, lat::text as lat, lng::text as lng from public.locations order by lower(name), id`,
        ),
        db.query(
          `select id, company_id, code, name from public.task_types order by lower(name), id`,
        ),
        db.query(
          `select id, company_id, code, name from public.record_types where active order by lower(name), id`,
        ),
        db.query(
          `select persona_id, task_type_id, qualification_type_id, status,
                  to_char(expires_on, 'YYYY-MM-DD') as expires_on, days_left
             from public.qualification_status`,
        ),
        db.query(
          `select fs.id, fs.record_type_id, rt.code as record_type, fs.company_id, fs.kind, fs.version,
                  fs.schema, fs.published_at
             from public.form_schemas fs
             join public.record_types rt on rt.id = fs.record_type_id
            where fs.status = 'published'
            order by rt.code, fs.kind, fs.version`,
        ),
      ]);

    return {
      company_id: company,
      fetched_at: new Date().toISOString(),
      personas: personas.rows,
      crews: crews.rows,
      locations: locations.rows,
      task_types: taskTypes.rows,
      record_types: recordTypes.rows,
      qualification_status: qualStatus.rows,
      form_schemas: schemas.rows,
    } satisfies ReferencePayload;
  });

  if (!payload) return new NextResponse("No active company", { status: 409 });
  return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
}
