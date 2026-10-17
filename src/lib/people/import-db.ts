import "server-only";
import type { Db } from "@/lib/db";
import {
  normalizeDni,
  normalizeName,
  parse,
  qualificationKey,
  summarize,
  validatePersonas,
  validateQualifications,
  type ImportCounts,
  type ImportKind,
  type PersonaRowResult,
  type QualificationRowResult,
  type QualificationTypeInfo,
  type RowResult,
} from "./import";

export type ImportPreview = {
  kind: ImportKind;
  headerErrors: string[];
  rows: RowResult[];
  counts: ImportCounts;
};

type Validated =
  | { kind: "personas"; headerErrors: string[]; rows: PersonaRowResult[] }
  | { kind: "capacitaciones"; headerErrors: string[]; rows: QualificationRowResult[] };

/** Parses `text` and validates it against the current DB state. Writes nothing. */
async function validate(db: Db, kind: ImportKind, text: string): Promise<Validated> {
  const parsed = parse(text, kind);
  if (parsed.headerErrors.length > 0) {
    return { kind, headerErrors: parsed.headerErrors, rows: [] } as Validated;
  }

  if (kind === "personas") {
    const crews = await db.query<{ id: string; name: string }>("select id, name from public.crews");
    const crewsByName = new Map(crews.rows.map((c) => [normalizeName(c.name), c]));
    const existing = await db.query<{ dni: string }>("select dni from public.personas");
    const existingDnis = new Set(existing.rows.map((r) => normalizeDni(r.dni)));
    return {
      kind,
      headerErrors: [],
      rows: validatePersonas(parsed.rows, { crewsByName, existingDnis }),
    };
  }

  const personas = await db.query<{ id: string; dni: string }>(
    "select id, dni from public.personas",
  );
  const personaIdsByDni = new Map(personas.rows.map((p) => [normalizeDni(p.dni), p.id]));

  // Global types first, then company types, so a company type overrides a same-named global one.
  const types = await db.query<{
    id: string;
    name: string;
    default_validity_months: number | null;
  }>(
    `select id, name, default_validity_months from public.qualification_types
     order by (company_id is null) desc, name`,
  );
  const typesByName = new Map<string, QualificationTypeInfo>();
  for (const row of types.rows) {
    typesByName.set(normalizeName(row.name), {
      id: row.id,
      name: row.name,
      defaultValidityMonths: row.default_validity_months,
    });
  }

  const personaIds = [...personaIdsByDni.values()];
  const existingRows = await db.query<{ persona_id: string; type_id: string; issued_on: string }>(
    `select persona_id, type_id, issued_on::text as issued_on
     from public.qualifications where persona_id = any($1::uuid[])`,
    [personaIds],
  );
  const existingKeys = new Set(
    existingRows.rows.map((r) => qualificationKey(r.persona_id, r.type_id, r.issued_on)),
  );

  return {
    kind,
    headerErrors: [],
    rows: validateQualifications(parsed.rows, { personaIdsByDni, typesByName, existingKeys }),
  };
}

export async function previewImport(
  db: Db,
  kind: ImportKind,
  text: string,
): Promise<ImportPreview> {
  const v = await validate(db, kind, text);
  return { kind, headerErrors: v.headerErrors, rows: v.rows, counts: summarize(v.rows) };
}

/**
 * Re-parses and re-validates `text`, then writes every valid row. Must run inside ONE `withUser`
 * transaction: any failure rolls everything back.
 */
export async function commitImport(db: Db, kind: ImportKind, text: string): Promise<ImportPreview> {
  const v = await validate(db, kind, text);
  const counts = summarize(v.rows);
  const preview: ImportPreview = { kind, headerErrors: v.headerErrors, rows: v.rows, counts };
  if (v.headerErrors.length > 0 || counts.valid === 0) return preview;

  if (v.kind === "personas") {
    const create = v.rows.filter((r) => r.action === "create" && r.data).map((r) => r.data!);
    const update = v.rows.filter((r) => r.action === "update" && r.data).map((r) => r.data!);

    if (create.length > 0) {
      await db.query(
        `insert into public.personas (company_id, dni, full_name, crew_id, active)
         select public.current_company_id(), x.dni, x.full_name, x.crew_id, coalesce(x.active, true)
         from unnest($1::text[], $2::text[], $3::uuid[], $4::boolean[])
           as x(dni, full_name, crew_id, active)`,
        [
          create.map((d) => d.dni),
          create.map((d) => d.fullName),
          create.map((d) => d.crewId),
          create.map((d) => d.active),
        ],
      );
    }
    if (update.length > 0) {
      await db.query(
        `update public.personas p
         set full_name = x.full_name,
             crew_id = coalesce(x.crew_id, p.crew_id),
             active = coalesce(x.active, p.active)
         from unnest($1::text[], $2::text[], $3::uuid[], $4::boolean[])
           as x(dni, full_name, crew_id, active)
         where regexp_replace(p.dni, '[[:space:].-]', '', 'g') = x.dni and p.company_id = public.current_company_id()`,
        [
          update.map((d) => d.dni),
          update.map((d) => d.fullName),
          update.map((d) => d.crewId),
          update.map((d) => d.active),
        ],
      );
    }
  } else {
    const insert = v.rows.filter((r) => r.action === "insert" && r.data).map((r) => r.data!);
    if (insert.length > 0) {
      await db.query(
        `insert into public.qualifications (company_id, persona_id, type_id, issued_on, expires_on)
         select public.current_company_id(), x.persona_id, x.type_id, x.issued_on, x.expires_on
         from unnest($1::uuid[], $2::uuid[], $3::date[], $4::date[])
           as x(persona_id, type_id, issued_on, expires_on)`,
        [
          insert.map((d) => d.personaId),
          insert.map((d) => d.typeId),
          insert.map((d) => d.issuedOn),
          insert.map((d) => d.expiresOn),
        ],
      );
    }
  }
  return preview;
}
