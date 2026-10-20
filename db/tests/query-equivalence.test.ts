import { describe, expect, it } from "vitest";
import { ATTENTION_SQL, COUNT_HABILITACIONES_SQL } from "@/lib/office/queries";
import { FITNESS_ROWS_SQL } from "@/lib/people/fitness";
import { CREWS_SQL, personasSql } from "@/lib/people/queries";
import { PERSONA_HISTORY_SQL } from "@/lib/people/qualifications";
import { ids, twoCompanies, withRollback, type TestDb } from "./helpers";

// The office/people queries were rewritten to avoid scanning the company-wide status views
// (personas x task types x requirements). The LEGACY_* strings below are the previous view-based
// queries; every rewritten query must return exactly the same rows on the same data, per tenant.
const QT_INDUCCION = "90000000-0000-7000-8000-000000000201";
const QT_ALTURA = "90000000-0000-7000-8000-000000000202";
const QT_CONFINADO = "90000000-0000-7000-8000-000000000203";
const QT_MANEJO = "90000000-0000-7000-8000-000000000204";
const QT_PRIMEROS = "90000000-0000-7000-8000-000000000205";
const QT_CALIENTE = "90000000-0000-7000-8000-000000000206";
const QT_RADIO = "90000000-0000-7000-8000-000000000210"; // required by no task type
const TT_ALTURA = "90000000-0000-7000-8000-000000000302";
const TT_ELECTRICO = "90000000-0000-7000-8000-000000000305";

const LEGACY_COUNT = `select count(distinct persona_id)::int as n
  from public.qualification_status where status in ('expired', 'expiring')`;

const LEGACY_ATTENTION = `select persona_id, full_name, crew_name, qualification_name, expires_on, status from (
  select distinct on (qs.persona_id, qs.qualification_type_id)
         p.id as persona_id, p.full_name, c.name as crew_name,
         qt.name as qualification_name, to_char(qs.expires_on, 'YYYY-MM-DD') as expires_on, qs.status
    from public.qualification_status qs
    join public.personas p on p.company_id = qs.company_id and p.id = qs.persona_id
    join public.qualification_types qt on qt.id = qs.qualification_type_id
    left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
   where qs.status = 'expired' or (qs.status = 'expiring' and qs.days_left <= $1)
   order by qs.persona_id, qs.qualification_type_id) a
   order by expires_on, full_name
   limit 50`;

const legacyPersonas = (where: string) => `
  select p.id, p.full_name, p.dni, p.crew_id, c.name as crew_name, p.active,
    coalesce(uf.n, 0)::int as unfit_tasks, coalesce(ex.n, 0)::int as expiring_count
  from public.personas p
  left join (select persona_id, count(*) as n from public.persona_task_fitness
    where not apto group by persona_id) uf on uf.persona_id = p.id
  left join (select persona_id, count(distinct qualification_type_id) as n
    from public.qualification_status where status = 'expiring' group by persona_id) ex
    on ex.persona_id = p.id
  left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
  ${where}
  order by lower(p.full_name), p.id
  limit 500`;

const LEGACY_CREWS = `
  select c.id, c.name, c.supervisor_persona_id, s.full_name as supervisor_name,
         c.location_id, l.name as location_name,
         (select count(*) from public.personas p
           where p.company_id = c.company_id and p.crew_id = c.id)::int as persona_count
    from public.crews c
    left join public.personas s on s.company_id = c.company_id and s.id = c.supervisor_persona_id
    left join public.locations l on l.company_id = c.company_id and l.id = c.location_id
   order by lower(c.name), c.id`;

const LEGACY_FITNESS = `
  select p.id as persona_id, p.full_name, p.dni, c.name as crew_name, f.apto,
    coalesce((select json_agg(json_build_object('name', qt.name, 'status', qs.status,
                'expires_on', qs.expires_on, 'days_left', qs.days_left) order by qt.name)
                from public.qualification_status qs
                join public.qualification_types qt on qt.id = qs.qualification_type_id
               where qs.persona_id = f.persona_id and qs.task_type_id = f.task_type_id
                 and qs.status <> 'valid'), '[]'::json) as issues,
    coalesce((select json_agg(json_build_object('name', qt.name, 'status', qs.status,
                'expires_on', qs.expires_on, 'days_left', qs.days_left) order by qt.name)
                from public.qualification_status qs
                join public.qualification_types qt on qt.id = qs.qualification_type_id
               where qs.persona_id = f.persona_id and qs.task_type_id = f.task_type_id), '[]'::json) as cells
    from public.persona_task_fitness f
    join public.personas p on p.company_id = f.company_id and p.id = f.persona_id
    left join public.crews c on c.company_id = p.company_id and c.id = p.crew_id
   where f.task_type_id = $1
     and ($2::uuid is null or p.crew_id = $2)
     and ($3::uuid is null or c.location_id = $3)`;

const LEGACY_HISTORY = `
  select q.id, q.type_id, qt.name as type_name,
         q.issued_on::text as issued_on, q.expires_on::text as expires_on,
         q.file_path, q.created_at::text as created_at,
         (cq.qualification_id is not null) as is_current
    from public.qualifications q
    join public.qualification_types qt on qt.id = q.type_id
    left join public.current_qualifications cq on cq.qualification_id = q.id
   where q.persona_id = $1
   order by q.issued_on desc, q.created_at desc, q.id desc`;

type PersonaKey = "renewed" | "ties" | "inactive" | "none" | "mixed" | "unrequired" | "custom";

type Fx = {
  locA: string;
  crewA: string;
  crewEmpty: string;
  p: Record<PersonaKey, string>;
  pB: string;
  crewB: string;
  customTask: string;
};

async function one(db: TestDb, sql: string, params: unknown[]) {
  return (await db.one(sql, params)).id as string;
}

// issued/expires: day offsets from today_art() (null = no expiry); createdAgoMin orders renewals
// issued the same day (created_at desc is the second tie-break, id desc the third).
async function qual(
  db: TestDb,
  company: string,
  persona: string,
  type: string,
  issued: number,
  expires: number | null,
  createdAgoMin = 0,
) {
  return one(
    db,
    `insert into qualifications (company_id, persona_id, type_id, issued_on, expires_on, created_at)
     values ($1, $2, $3, public.today_art() + $4::int, public.today_art() + $5::int,
             now() - ($6::int * interval '1 minute')) returning id`,
    [company, persona, type, issued, expires, createdAgoMin],
  );
}

async function seed(db: TestDb): Promise<Fx> {
  await twoCompanies(db);
  const A = ids.companyA;
  const locA = await one(
    db,
    "insert into locations (company_id, name) values ($1, 'L') returning id",
    [A],
  );
  const crewA = await one(
    db,
    "insert into crews (company_id, name, location_id) values ($1, 'Crew A', $2) returning id",
    [A, locA],
  );
  const crewEmpty = await one(
    db,
    "insert into crews (company_id, name) values ($1, 'Vacía') returning id",
    [A],
  );
  const persona = (name: string, active: boolean, crew: string | null) =>
    one(
      db,
      "insert into personas (company_id, full_name, dni, active, crew_id) values ($1, $2, $2, $3, $4) returning id",
      [A, name, active, crew],
    );
  const p: Record<PersonaKey, string> = {
    renewed: await persona("Ana renovada", true, crewA),
    ties: await persona("Beto empates", true, crewA),
    inactive: await persona("Carla inactiva", false, crewA),
    none: await persona("Dario sin nada", true, null),
    mixed: await persona("Eva mixta", true, null),
    unrequired: await persona("Fede no requerida", true, null),
    custom: await persona("Gus tarea propia", true, null),
  };
  // Company task type + requirement (manejo defensivo) on top of the global ones.
  const customTask = await one(
    db,
    "insert into task_types (company_id, code, name) values ($1, 'tarea_a', 'Tarea A') returning id",
    [A],
  );
  await db.query(
    "insert into task_requirements (company_id, task_type_id, qualification_type_id) values ($1, $2, $3)",
    [A, customTask, QT_MANEJO],
  );

  // renewed: altura old expired -> renewal expiring; confinado expired; induccion valid.
  await qual(db, A, p.renewed, QT_ALTURA, -400, -35);
  await qual(db, A, p.renewed, QT_ALTURA, -100, 5);
  await qual(db, A, p.renewed, QT_CONFINADO, -300, -3);
  await qual(db, A, p.renewed, QT_INDUCCION, -10, 300);
  // ties: same issued_on, created_at breaks it (newer one valid); caliente: same everything -> id.
  await qual(db, A, p.ties, QT_ALTURA, -50, -1, 60);
  await qual(db, A, p.ties, QT_ALTURA, -50, 200, 5);
  await qual(db, A, p.ties, QT_CALIENTE, -20, 10, 0);
  await qual(db, A, p.ties, QT_CALIENTE, -20, -2, 0);
  // inactive: expired but must not count anywhere.
  await qual(db, A, p.inactive, QT_ALTURA, -400, -30);
  // mixed: no-expiry altura (valid), primeros auxilios expiring in 20 days, expiring exactly in 30.
  await qual(db, A, p.mixed, QT_ALTURA, -10, null);
  await qual(db, A, p.mixed, QT_PRIMEROS, -300, 20);
  await qual(db, A, p.mixed, QT_CONFINADO, -300, 30);
  // unrequired: expired but no task type requires it.
  await qual(db, A, p.unrequired, QT_RADIO, -400, -10);
  // custom: company requirement expired.
  await qual(db, A, p.custom, QT_MANEJO, -800, -20);

  // Company B: its own data must never leak into A's results (and the reverse).
  const crewB = await one(
    db,
    "insert into crews (company_id, name) values ($1, 'Crew B') returning id",
    [ids.companyB],
  );
  const pB = await one(
    db,
    "insert into personas (company_id, full_name, dni, crew_id) values ($1, 'Bruno B', 'B-1', $2) returning id",
    [ids.companyB, crewB],
  );
  await qual(db, ids.companyB, pB, QT_ALTURA, -400, -9);
  return { locA, crewA, crewEmpty, p, pB, crewB, customTask };
}

async function same(db: TestDb, legacy: string, current: string, params: unknown[] = []) {
  const a = await db.query(legacy, params);
  const b = await db.query(current, params);
  expect(b).toEqual(a);
  return b;
}

describe("rewritten office/people queries match the previous view-based queries", () => {
  it("countHabilitaciones", () =>
    withRollback(async (db) => {
      await seed(db);
      // A: renewed, mixed and custom for sure (the ties persona depends on the id tie-break);
      // inactive and the not-required type are excluded. B: its single expired persona.
      await db.as(ids.userA);
      const a = await same(db, LEGACY_COUNT, COUNT_HABILITACIONES_SQL);
      expect(a[0]!.n).toBeGreaterThanOrEqual(3);
      expect(a[0]!.n).toBeLessThanOrEqual(4);
      await db.as(ids.userB);
      const b = await same(db, LEGACY_COUNT, COUNT_HABILITACIONES_SQL);
      expect(b[0]!.n).toBe(1);
    }));

  it("listAttention (same rows, same order, per tenant, any horizon)", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      for (const days of [0, 7, 15, 30]) {
        await db.as(ids.userA);
        const rowsA = await same(db, LEGACY_ATTENTION, ATTENTION_SQL, [days]);
        const personasA = new Set(rowsA.map((r) => r.persona_id));
        expect(personasA.has(f.p.inactive)).toBe(false);
        expect(personasA.has(f.p.unrequired)).toBe(false);
        expect(personasA.has(f.pB)).toBe(false);
        await db.as(ids.userB);
        const rowsB = await same(db, LEGACY_ATTENTION, ATTENTION_SQL, [days]);
        expect(rowsB.map((r) => r.persona_id)).toEqual([f.pB]);
      }
      await db.as(ids.userA);
      const rows = await db.query(ATTENTION_SQL, [7]);
      expect(rows.length).toBeGreaterThan(0);
    }));

  it("listPersonas (unfiltered, filtered, inactive) and listCrews", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      for (const user of [ids.userA, ids.userB]) {
        await db.as(user);
        const all = personasSql({ q: "", crew: "", active: "" });
        await same(db, legacyPersonas(""), all.sql, all.params);
        const active = personasSql({ q: "", crew: "", active: "1" });
        await same(db, legacyPersonas("where p.active"), active.sql, active.params);
        const crew = personasSql({ q: "", crew: f.crewA, active: "" });
        await same(db, legacyPersonas("where p.crew_id = $1"), crew.sql, crew.params);
        const none = personasSql({ q: "", crew: "none", active: "" });
        await same(db, legacyPersonas("where p.crew_id is null"), none.sql, none.params);
        await same(db, LEGACY_CREWS, CREWS_SQL);
      }
      await db.as(ids.userA);
      const crews = await db.query(CREWS_SQL);
      expect(crews.map((c) => [c.name, c.persona_count])).toEqual([
        ["Crew A", 3],
        ["Vacía", 0],
      ]);
      const personas = await db.query(personasSql({ q: "", crew: "", active: "" }).sql);
      expect(personas).toHaveLength(7);
      const unfit = Object.fromEntries(personas.map((r) => [r.id, r.unfit_tasks]));
      expect(unfit[f.p.inactive]).toBe(0); // the views skip inactive personas
    }));

  it("personas page applies the limit before the counters", () =>
    withRollback(async (db) => {
      await seed(db);
      await db.as(ids.userA);
      const { sql } = personasSql({ q: "", crew: "", active: "" });
      expect(sql).toMatch(/with page as \([\s\S]*limit 500\)/);
    }));

  it("fitness rows (issues + cells) for every task type, with and without crew/location", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const sort = (rows: Record<string, unknown>[]) =>
        [...rows].sort((a, b) => String(a.persona_id).localeCompare(String(b.persona_id)));
      for (const user of [ids.userA, ids.userB]) {
        await db.as(user);
        const tasks = await db.query("select id from task_types order by id");
        for (const t of tasks) {
          for (const [crew, loc] of [
            [null, null],
            [f.crewA, null],
            [null, f.locA],
            [f.crewEmpty, null],
          ]) {
            const params = [t.id, crew, loc];
            const a = sort(await db.query(LEGACY_FITNESS, params));
            const b = sort(await db.query(FITNESS_ROWS_SQL, params));
            expect(b).toEqual(a);
          }
        }
      }
      await db.as(ids.userA);
      const rows = await db.query(FITNESS_ROWS_SQL, [TT_ALTURA, null, null]);
      expect(rows.length).toBe(6); // active personas of A only
      const electrico = await db.query(FITNESS_ROWS_SQL, [TT_ELECTRICO, null, null]);
      const eva = electrico.find((r) => r.persona_id === f.p.mixed)!;
      expect((eva.issues as unknown[]).length).toBe(1);
      const none = rows.find((r) => r.persona_id === f.p.none)!;
      expect(none.cells).toEqual([expect.objectContaining({ status: "missing" })]);
    }));

  it("persona qualification history incl. renewal tie-breaks (issued_on, created_at, id)", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(ids.userA);
      for (const persona of Object.values(f.p)) {
        await same(db, LEGACY_HISTORY, PERSONA_HISTORY_SQL, [persona]);
      }
      const ties = await db.query(PERSONA_HISTORY_SQL, [f.p.ties]);
      expect(ties.filter((r) => r.is_current)).toHaveLength(2); // altura + caliente
      const altura = ties.filter((r) => r.type_id === QT_ALTURA);
      expect(altura.map((r) => r.is_current)).toEqual([true, false]); // newer created_at wins
      // another tenant's persona is invisible through the rewritten query too
      expect(await db.query(PERSONA_HISTORY_SQL, [f.pB])).toEqual([]);
      await db.as(ids.userB);
      expect(await db.query(PERSONA_HISTORY_SQL, [f.p.renewed])).toEqual([]);
      expect(await db.query(PERSONA_HISTORY_SQL, [f.pB])).toHaveLength(1);
    }));
});

describe("qualifications index", () => {
  it("serves the latest-per-type ordering (issued_on, created_at, id desc) from one index", () =>
    withRollback(async (db) => {
      const def = await db.one(
        "select indexdef from pg_indexes where indexname = 'qualifications_persona_type_idx'",
      );
      expect(def.indexdef).toContain(
        "(company_id, persona_id, type_id, issued_on DESC, created_at DESC, id DESC)",
      );
    }));
});
