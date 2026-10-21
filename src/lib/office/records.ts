import "server-only";
import { withUser } from "@/lib/db";
import type { FormExtension, FormSchema } from "@/forms/dsl";

// Read queries for the office records screens. Always through withUser(): RLS decides which
// records the caller sees (author, or hse/manager/admin); nothing here filters by role.

export const RECORD_STATUSES = ["submitted", "blocked", "accepted", "reviewed", "locked"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

const TZ = "America/Argentina/Buenos_Aires";

export type RecordFilters = {
  type?: string;
  crew?: string;
  status?: string;
  /** YYYY-MM-DD, inclusive, ART calendar days. */
  from?: string;
  to?: string;
};

export type RecordRow = {
  id: string;
  occurred_at: string;
  type_name: string;
  crew_name: string;
  location_name: string;
  author_id: string;
  status: RecordStatus;
  participant_count: number;
  signature_count: number;
};

export type Option = { id: string; name: string };

const LIMIT = 200;

export async function listRecords(userId: string, f: RecordFilters): Promise<RecordRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    args.push(value);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (f.type) add("r.record_type_id = ?", f.type);
  if (f.crew) add("r.crew_id = ?", f.crew);
  if (f.status) add("r.status = ?::public.record_status", f.status);
  if (f.from) add(`r.occurred_at >= (?::date)::timestamp at time zone '${TZ}'`, f.from);
  if (f.to) add(`r.occurred_at < ((?::date) + 1)::timestamp at time zone '${TZ}'`, f.to);

  return withUser(userId, async (db) => {
    const res = await db.query<RecordRow>(
      `select r.id, to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as occurred_at, rt.name as type_name,
              c.name as crew_name, l.name as location_name, r.author_id, r.status,
              (select count(*)::int from public.record_participants p where p.record_id = r.id) as participant_count,
              (select count(*)::int from public.signatures s where s.record_id = r.id) as signature_count
         from public.records r
         join public.record_types rt on rt.id = r.record_type_id
         join public.crews c on c.company_id = r.company_id and c.id = r.crew_id
         join public.locations l on l.company_id = r.company_id and l.id = r.location_id
        ${where.length ? `where ${where.join(" and ")}` : ""}
        order by r.occurred_at desc, r.id desc
        limit ${LIMIT}`,
      args,
    );
    return res.rows;
  });
}

export async function listRecordFilterOptions(
  userId: string,
): Promise<{ types: Option[]; crews: Option[] }> {
  return withUser(userId, async (db) => {
    const [types, crews] = await Promise.all([
      db.query<Option>("select id, name from public.record_types order by name"),
      db.query<Option>("select id, name from public.crews order by name"),
    ]);
    return { types: types.rows, crews: crews.rows };
  });
}

export type RecordDetail = {
  id: string;
  type_name: string;
  schema_version: number;
  extension_version: number | null;
  status: RecordStatus;
  occurred_at: string;
  submitted_at: string;
  crew_name: string;
  location_name: string;
  task_type_name: string | null;
  author_id: string;
  payload: Record<string, unknown>;
  geo_lat: string | null;
  geo_lng: string | null;
  geo_accuracy: string | null;
  amends_record_id: string | null;
  base_schema: FormSchema | null;
  extension_schema: FormExtension | null;
  participants: {
    persona_id: string;
    full_name: string;
    role: "attendee" | "signer" | "responsible";
  }[];
  signatures: {
    id: string;
    persona_name: string;
    image_path: string;
    signed_at: string;
    geo_lat: string | null;
    geo_lng: string | null;
    geo_accuracy: string | null;
  }[];
  attachments: { id: string; path: string; taken_at: string }[];
  conflicts: { id: string; device_id: string; received_at: string; envelope: unknown }[];
  references: {
    personas: { key: string; label: string }[];
    crews: { key: string; label: string }[];
    locations: { key: string; label: string }[];
    taskTypes: { key: string; label: string }[];
  };
};

const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Null when the record does not exist or RLS hides it. */
export async function getRecordDetail(userId: string, id: string): Promise<RecordDetail | null> {
  return withUser(userId, async (db) => {
    const rec = await db.query<
      Omit<
        RecordDetail,
        | "base_schema"
        | "extension_schema"
        | "participants"
        | "signatures"
        | "attachments"
        | "conflicts"
        | "references"
      > & { record_type_id: string; company_id: string }
    >(
      `select r.id, r.record_type_id, r.company_id, rt.name as type_name, r.schema_version,
              r.extension_version, r.status, to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as occurred_at,
              to_char(r.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as submitted_at, c.name as crew_name, l.name as location_name,
              tt.name as task_type_name, r.author_id, r.payload, r.geo_lat::text, r.geo_lng::text,
              r.geo_accuracy::text, r.amends_record_id
         from public.records r
         join public.record_types rt on rt.id = r.record_type_id
         join public.crews c on c.company_id = r.company_id and c.id = r.crew_id
         join public.locations l on l.company_id = r.company_id and l.id = r.location_id
         left join public.task_types tt on tt.id = r.task_type_id
        where r.id = $1`,
      [id],
    );
    const r = rec.rows[0];
    if (!r) return null;

    // The record's exact pinned versions, never the latest. Base is global or the type's company.
    const schemas = await db.query<{ kind: "base" | "extension"; schema: FormSchema }>(
      `select kind, schema from public.form_schemas
        where record_type_id = $1 and status in ('published', 'retired')
          and ((kind = 'base' and version = $2 and (company_id is null or company_id = $4))
            or (kind = 'extension' and version = $3 and company_id = $4))`,
      [r.record_type_id, r.schema_version, r.extension_version, r.company_id],
    );

    // Labels only for the ids the payload actually references (read-only render), not whole tables.
    const refIds = [...new Set(JSON.stringify(r.payload ?? null).match(UUID_IN_TEXT) ?? [])];

    const [parts, sigs, atts, conflicts, personas, crews, locations, tasks] = await Promise.all([
      db.query<RecordDetail["participants"][number]>(
        `select p.persona_id, pe.full_name, p.role
           from public.record_participants p
           join public.personas pe on pe.company_id = p.company_id and pe.id = p.persona_id
          where p.record_id = $1 order by p.role, pe.full_name`,
        [id],
      ),
      db.query<RecordDetail["signatures"][number]>(
        `select s.id, pe.full_name as persona_name, s.image_path, to_char(s.signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as signed_at,
                s.geo_lat::text, s.geo_lng::text, s.geo_accuracy::text
           from public.signatures s
           join public.personas pe on pe.company_id = s.company_id and pe.id = s.persona_id
          where s.record_id = $1 order by s.signed_at`,
        [id],
      ),
      db.query<RecordDetail["attachments"][number]>(
        `select id, path, to_char(taken_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as taken_at from public.attachments
          where record_id = $1 order by taken_at`,
        [id],
      ),
      db.query<RecordDetail["conflicts"][number]>(
        `select id, device_id, to_char(received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as received_at, envelope
           from public.record_conflicts where record_id = $1 order by received_at`,
        [id],
      ),
      db.query<{ key: string; label: string }>(
        "select id as key, full_name as label from public.personas where id = any($1::uuid[]) order by full_name",
        [refIds],
      ),
      db.query<{ key: string; label: string }>(
        "select id as key, name as label from public.crews where id = any($1::uuid[]) order by name",
        [refIds],
      ),
      db.query<{ key: string; label: string }>(
        "select id as key, name as label from public.locations where id = any($1::uuid[]) order by name",
        [refIds],
      ),
      db.query<{ key: string; label: string }>(
        "select id as key, name as label from public.task_types where id = any($1::uuid[]) order by name",
        [refIds],
      ),
    ]);

    const facts: Partial<typeof r> = { ...r };
    delete facts.record_type_id;
    delete facts.company_id;
    return {
      ...(facts as Omit<typeof r, "record_type_id" | "company_id">),
      base_schema: schemas.rows.find((s) => s.kind === "base")?.schema ?? null,
      extension_schema: schemas.rows.find((s) => s.kind === "extension")?.schema ?? null,
      participants: parts.rows,
      signatures: sigs.rows,
      attachments: atts.rows,
      conflicts: conflicts.rows,
      references: {
        personas: personas.rows,
        crews: crews.rows,
        locations: locations.rows,
        taskTypes: tasks.rows,
      },
    };
  });
}
