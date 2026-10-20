import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createUser, ids, twoCompanies, withRollback, type TestDb } from "./helpers";

// Phase 2.1 — records schema (spec/data-model.md#Records): RLS isolation, insert forcing, children,
// signatures, file keys, immutability guards, form_schemas lifecycle, version pin, global-or-own
// refs, guest reads, append-only conflicts, and the shared triggers (read-only trial, audit).
const INSUFFICIENT_PRIVILEGE = "42501";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const GUARD = "P0001"; // reject_mutation() and the records/form_schemas guards
const READ_ONLY = "VQ001";

const TOOLBOX = "90000000-0000-7000-8000-000000000501";
const ATS = "90000000-0000-7000-8000-000000000502";
const TOOLBOX_SCHEMA = "90000000-0000-7000-8000-000000000601";
const TTYPE_GLOBAL = "90000000-0000-7000-8000-000000000301";

const supA = "aaaaaaaa-0000-7000-8000-000000000003"; // supervisor in A (author)
const supA2 = "aaaaaaaa-0000-7000-8000-000000000004"; // another supervisor in A
const managerA = "aaaaaaaa-0000-7000-8000-000000000005";
const adminA = "aaaaaaaa-0000-7000-8000-000000000006";
const guestA = "aaaaaaaa-0000-7000-8000-000000000007"; // anonymous guest, hse in A
// ids.userA = hse in A, ids.workerA = worker in A, ids.userB = admin in B.

const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);

let counter = 0;
// Client-style UUIDv7 ids (version nibble 7, variant 8).
function rid(): string {
  counter += 1;
  return `dddd0000-0000-7000-8000-${String(counter).padStart(12, "0")}`;
}

type Fx = {
  locA: string;
  crewA: string;
  personaA1: string;
  personaA2: string;
  typeA: string; // company record type of A, base v1 published
  ttypeA: string;
  locB: string;
  crewB: string;
  personaB: string;
  typeB: string;
  ttypeB: string;
};

async function seed(db: TestDb): Promise<Fx> {
  await twoCompanies(db);
  await createUser(db, supA, "a-sup@test.local");
  await createUser(db, supA2, "a-sup2@test.local");
  await createUser(db, managerA, "a-manager@test.local");
  await createUser(db, adminA, "a-admin@test.local");
  await createUser(db, guestA, "a-guest@test.local");
  await db.query("update users set is_anonymous = true where id = $1", [guestA]);
  await db.query(
    `insert into memberships (company_id, user_id, role) values
       ($1, $2, 'supervisor'), ($1, $3, 'supervisor'), ($1, $4, 'manager'), ($1, $5, 'admin'), ($1, $6, 'hse')`,
    [ids.companyA, supA, supA2, managerA, adminA, guestA],
  );
  const one = async (sql: string, params: unknown[]) => (await db.one(sql, params)).id as string;
  const locA = await one(
    "insert into locations (company_id, name) values ($1, 'Loc A') returning id",
    [ids.companyA],
  );
  const crewA = await one(
    "insert into crews (company_id, name, location_id) values ($1, 'Crew A', $2) returning id",
    [ids.companyA, locA],
  );
  const personaA1 = await one(
    "insert into personas (company_id, full_name, dni, crew_id) values ($1, 'P A1', 'A-1', $2) returning id",
    [ids.companyA, crewA],
  );
  const personaA2 = await one(
    "insert into personas (company_id, full_name, dni, crew_id) values ($1, 'P A2', 'A-2', $2) returning id",
    [ids.companyA, crewA],
  );
  const ttypeA = await one(
    "insert into task_types (company_id, code, name) values ($1, 'tarea_a', 'Tarea A') returning id",
    [ids.companyA],
  );
  const typeA = await one(
    "insert into record_types (company_id, code, name) values ($1, 'tipo_a', 'Tipo A') returning id",
    [ids.companyA],
  );
  await db.query(
    `insert into form_schemas (record_type_id, company_id, kind, version, status, published_at, schema)
     values ($1, $2, 'base', 1, 'published', now(), '{"title":"A","sections":[]}')`,
    [typeA, ids.companyA],
  );
  const locB = await one(
    "insert into locations (company_id, name) values ($1, 'Loc B') returning id",
    [ids.companyB],
  );
  const crewB = await one(
    "insert into crews (company_id, name, location_id) values ($1, 'Crew B', $2) returning id",
    [ids.companyB, locB],
  );
  const personaB = await one(
    "insert into personas (company_id, full_name, dni, crew_id) values ($1, 'P B', 'B-1', $2) returning id",
    [ids.companyB, crewB],
  );
  const ttypeB = await one(
    "insert into task_types (company_id, code, name) values ($1, 'tarea_b', 'Tarea B') returning id",
    [ids.companyB],
  );
  const typeB = await one(
    "insert into record_types (company_id, code, name) values ($1, 'tipo_b', 'Tipo B') returning id",
    [ids.companyB],
  );
  await db.query(
    `insert into form_schemas (record_type_id, company_id, kind, version, status, published_at, schema)
     values ($1, $2, 'base', 1, 'published', now(), '{"title":"B","sections":[]}')`,
    [typeB, ids.companyB],
  );
  return { locA, crewA, personaA1, personaA2, typeA, ttypeA, locB, crewB, personaB, typeB, ttypeB };
}

function insertSql(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  return {
    sql: `insert into ${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    params: cols.map((c) => row[c]),
  };
}

async function tryInsert(db: TestDb, table: string, row: Record<string, unknown>) {
  const { sql, params } = insertSql(table, row);
  return db.errorCode(sql, params);
}

async function mustInsert(
  db: TestDb,
  table: string,
  row: Record<string, unknown>,
): Promise<string> {
  const { sql, params } = insertSql(table, row);
  return (await db.one(sql, params)).id as string;
}

function recRow(f: Fx, o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: rid(),
    company_id: ids.companyA,
    record_type_id: TOOLBOX,
    schema_version: 1,
    occurred_at: "2026-10-19T10:00:00Z",
    crew_id: f.crewA,
    location_id: f.locA,
    payload: { topic: "x" },
    submission_hash: HASH,
    device_id: "dev-1",
    client_created_at: "2026-10-19T10:00:00Z",
    ...o,
  };
}

const partRow = (rec: string, persona: string, role = "signer", company = ids.companyA) => ({
  company_id: company,
  record_id: rec,
  persona_id: persona,
  role,
});

function sigRow(
  rec: string,
  persona: string,
  o: Record<string, unknown> = {},
): Record<string, unknown> {
  const id = rid();
  return {
    id,
    company_id: ids.companyA,
    record_id: rec,
    persona_id: persona,
    image_path: `${ids.companyA}/signatures/${id}.png`,
    signed_at: "2026-10-19T10:05:00Z",
    content_hash: HASH,
    ...o,
  };
}

function attRow(rec: string, o: Record<string, unknown> = {}): Record<string, unknown> {
  const id = rid();
  return {
    id,
    company_id: ids.companyA,
    record_id: rec,
    path: `${ids.companyA}/records/${rec}/${id}.jpg`,
    mime: "image/jpeg",
    size: 1000,
    taken_at: "2026-10-19T10:06:00Z",
    ...o,
  };
}

// A full chain for company A written by `user` (a supervisor/hse of A).
async function chainA(db: TestDb, f: Fx, user: string) {
  await db.as(user);
  const rec = await mustInsert(db, "records", recRow(f));
  await mustInsert(db, "record_participants", partRow(rec, f.personaA1));
  const sig = await mustInsert(db, "signatures", sigRow(rec, f.personaA1));
  const att = await mustInsert(db, "attachments", attRow(rec));
  const conflict = await mustInsert(db, "record_conflicts", {
    company_id: ids.companyA,
    record_id: rec,
    envelope: { a: 1 },
    device_id: "dev-2",
  });
  await db.as(null);
  return { rec, sig, att, conflict };
}

async function count(db: TestDb, table: string, where = "true", params: unknown[] = []) {
  return (await db.one(`select count(*)::int as n from ${table} where ${where}`, params))
    .n as number;
}

async function expireTrial(db: TestDb, company: string) {
  await db.query(
    "update companies set plan = 'trial', trial_ends_at = now() - interval '1 day' where id = $1",
    [company],
  );
}

describe("records: RLS isolation (company A vs B)", () => {
  it("each company sees only its own rows on all seven tables", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await chainA(db, f, supA);
      // Company B: admin B writes the same chain.
      await db.as(ids.userB);
      const recB = await mustInsert(
        db,
        "records",
        recRow(f, {
          company_id: ids.companyB,
          record_type_id: f.typeB,
          crew_id: f.crewB,
          location_id: f.locB,
        }),
      );
      await mustInsert(
        db,
        "record_participants",
        partRow(recB, f.personaB, "signer", ids.companyB),
      );
      const sigIdB = rid();
      await mustInsert(db, "signatures", {
        id: sigIdB,
        company_id: ids.companyB,
        record_id: recB,
        persona_id: f.personaB,
        image_path: `${ids.companyB}/signatures/${sigIdB}.png`,
        signed_at: "2026-10-19T10:05:00Z",
        content_hash: HASH,
      });
      const attIdB = rid();
      await mustInsert(db, "attachments", {
        id: attIdB,
        company_id: ids.companyB,
        record_id: recB,
        path: `${ids.companyB}/records/${recB}/${attIdB}.png`,
        mime: "image/png",
        size: 10,
        taken_at: "2026-10-19T10:06:00Z",
      });
      await mustInsert(db, "record_conflicts", {
        company_id: ids.companyB,
        record_id: recB,
        envelope: {},
        device_id: "dev-9",
      });

      for (const table of [
        "records",
        "record_participants",
        "signatures",
        "attachments",
        "record_conflicts",
      ]) {
        await db.as(ids.userB);
        expect(
          await count(db, table, "company_id = $1", [ids.companyB]),
          `B sees own ${table}`,
        ).toBe(1);
        expect(await count(db, table, "company_id = $1", [ids.companyA]), `B sees A ${table}`).toBe(
          0,
        );
        await db.as(ids.userA); // hse in A
        expect(
          await count(db, table, "company_id = $1", [ids.companyA]),
          `A sees own ${table}`,
        ).toBe(1);
        expect(await count(db, table, "company_id = $1", [ids.companyB]), `A sees B ${table}`).toBe(
          0,
        );
      }

      // record_types / form_schemas: globals + own, never the other company's.
      await db.as(ids.userA);
      expect(await count(db, "record_types", "company_id = $1", [ids.companyB])).toBe(0);
      expect(await count(db, "record_types", "company_id = $1", [ids.companyA])).toBe(1);
      expect(await count(db, "record_types", "company_id is null")).toBe(2);
      expect(await count(db, "form_schemas", "company_id = $1", [ids.companyB])).toBe(0);
      expect(await count(db, "form_schemas", "company_id = $1", [ids.companyA])).toBe(1);
      expect(await count(db, "form_schemas", "company_id is null")).toBe(2);
      await db.as(ids.userB);
      expect(await count(db, "record_types", "company_id = $1", [ids.companyA])).toBe(0);
      expect(await count(db, "form_schemas", "company_id = $1", [ids.companyA])).toBe(0);

      // Writes into the other company are rejected.
      await db.as(supA);
      expect(
        await tryInsert(
          db,
          "records",
          recRow(f, {
            company_id: ids.companyB,
            record_type_id: f.typeB,
            crew_id: f.crewB,
            location_id: f.locB,
          }),
        ),
      ).toMatch(/^(42501|23503)$/); // RLS check, or the version pin cannot see B's schema
      expect(
        await tryInsert(
          db,
          "record_participants",
          partRow(recB, f.personaB, "signer", ids.companyB),
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("a user in both companies only sees the active company's rows", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await chainA(db, f, ids.userA);
      // `both` is a worker in A and admin in B (active = newest membership = B).
      await db.as(ids.both);
      expect(await count(db, "records")).toBe(0);
    }));
});

describe("records: insert", () => {
  it("forces status, submitted_at and author_id regardless of the client values", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      const id = await mustInsert(
        db,
        "records",
        recRow(f, { status: "locked", author_id: supA2, submitted_at: "2020-01-01T00:00:00Z" }),
      );
      const row = await db.one(
        "select status, author_id, (submitted_at = now()) as now_ok from records where id = $1",
        [id],
      );
      expect(row.status).toBe("submitted");
      expect(row.author_id).toBe(supA);
      expect(row.now_ok).toBe(true);
    }));

  it("only supervisor/hse/admin insert; worker and manager are denied", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      for (const u of [supA, ids.userA, adminA]) {
        await db.as(u);
        expect(await tryInsert(db, "records", recRow(f)), u).toBeNull();
      }
      for (const u of [ids.workerA, managerA]) {
        await db.as(u);
        expect(await tryInsert(db, "records", recRow(f)), u).toBe(INSUFFICIENT_PRIVILEGE);
      }
    }));

  it("bounds: payload size, lat/lng ranges, geo pairs, hash shape, UUIDv7 client id", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      expect(
        await tryInsert(db, "records", recRow(f, { payload: { x: "a".repeat(262144) } })),
      ).toBe(CHECK_VIOLATION);
      expect(
        await tryInsert(db, "records", recRow(f, { payload: { x: "a".repeat(262000) } })),
      ).toBeNull();
      expect(await tryInsert(db, "records", recRow(f, { payload: JSON.stringify([1]) }))).toBe(
        CHECK_VIOLATION,
      );
      expect(await tryInsert(db, "records", recRow(f, { geo_lat: 91, geo_lng: 0 }))).toBe(
        CHECK_VIOLATION,
      );
      expect(await tryInsert(db, "records", recRow(f, { geo_lat: 0, geo_lng: 181 }))).toBe(
        CHECK_VIOLATION,
      );
      expect(await tryInsert(db, "records", recRow(f, { geo_lat: 10 }))).toBe(CHECK_VIOLATION);
      expect(await tryInsert(db, "records", recRow(f, { geo_accuracy: 5 }))).toBe(CHECK_VIOLATION);
      expect(
        await tryInsert(
          db,
          "records",
          recRow(f, { geo_lat: -38.95, geo_lng: -68.06, geo_accuracy: 12 }),
        ),
      ).toBeNull();
      expect(await tryInsert(db, "records", recRow(f, { submission_hash: "xyz" }))).toBe(
        CHECK_VIOLATION,
      );
      expect(
        await tryInsert(db, "records", recRow(f, { id: "11111111-1111-4111-8111-111111111111" })),
      ).toBe(CHECK_VIOLATION);
      expect(await tryInsert(db, "records", recRow(f, { device_id: " " }))).toBe(CHECK_VIOLATION);
    }));

  it("duplicate client id is a unique violation", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      const row = recRow(f);
      expect(await tryInsert(db, "records", row)).toBeNull();
      expect(await tryInsert(db, "records", { ...row, submission_hash: HASH2 })).toBe(
        UNIQUE_VIOLATION,
      );
    }));

  it("amends_record_id: own company only, never itself", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      const first = await mustInsert(db, "records", recRow(f));
      expect(await tryInsert(db, "records", recRow(f, { amends_record_id: first }))).toBeNull();
      const id = rid();
      expect(await tryInsert(db, "records", recRow(f, { id, amends_record_id: id }))).toBe(
        CHECK_VIOLATION,
      );
      expect(await tryInsert(db, "records", recRow(f, { amends_record_id: rid() }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
    }));
});

describe("records: version pin", () => {
  it("base version must exist as published or retired", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      expect(await tryInsert(db, "records", recRow(f, { schema_version: 2 }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
      await db.as(null);
      await db.query(
        `insert into form_schemas (record_type_id, kind, version, status, schema)
         values ($1, 'base', 2, 'draft', '{}')`,
        [TOOLBOX],
      );
      await db.as(supA);
      expect(await tryInsert(db, "records", recRow(f, { schema_version: 2 }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
      // publish v2 (retires nothing: the single-published index forces retiring v1 first), then retire v2
      await db.as(null);
      await db.query("update form_schemas set status = 'retired' where id = $1", [TOOLBOX_SCHEMA]);
      await db.query(
        "update form_schemas set status = 'published', published_at = now() where record_type_id = $1 and version = 2",
        [TOOLBOX],
      );
      await db.as(supA);
      expect(await tryInsert(db, "records", recRow(f, { schema_version: 2 }))).toBeNull();
      expect(await tryInsert(db, "records", recRow(f, { schema_version: 1 }))).toBeNull(); // retired still accepted
      expect(await tryInsert(db, "records", recRow(f, { schema_version: 3 }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
    }));

  it("a company type resolves to its own company's base schema only", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      expect(await tryInsert(db, "records", recRow(f, { record_type_id: f.typeA }))).toBeNull();
    }));

  it("extension: must exist for this company and the type must be global", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      expect(await tryInsert(db, "records", recRow(f, { extension_version: 1 }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
      await db.as(null);
      await db.query(
        `insert into form_schemas (record_type_id, company_id, kind, version, status, published_at, schema)
         values ($1, $2, 'extension', 1, 'published', now(), '{}'), ($1, $3, 'extension', 2, 'published', now(), '{}')`,
        [TOOLBOX, ids.companyA, ids.companyB],
      );
      await db.as(supA);
      expect(await tryInsert(db, "records", recRow(f, { extension_version: 1 }))).toBeNull();
      // v2 is company B's extension: not usable by A
      expect(await tryInsert(db, "records", recRow(f, { extension_version: 2 }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
      // company types never take extensions
      expect(
        await tryInsert(
          db,
          "records",
          recRow(f, { record_type_id: f.typeA, extension_version: 1 }),
        ),
      ).toBe(FOREIGN_KEY_VIOLATION);
    }));

  it("record_types.active is not checked (deactivated type still syncs)", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.query("update record_types set active = false where id = $1", [f.typeA]);
      await db.as(supA);
      expect(await tryInsert(db, "records", recRow(f, { record_type_id: f.typeA }))).toBeNull();
    }));
});

describe("records: global-or-own references", () => {
  it("record_type_id and task_type_id: global or own, never another company's", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      expect(await tryInsert(db, "records", recRow(f, { record_type_id: ATS }))).toBeNull();
      expect(await tryInsert(db, "records", recRow(f, { record_type_id: f.typeA }))).toBeNull();
      expect(await tryInsert(db, "records", recRow(f, { record_type_id: f.typeB }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
      expect(await tryInsert(db, "records", recRow(f, { task_type_id: TTYPE_GLOBAL }))).toBeNull();
      expect(await tryInsert(db, "records", recRow(f, { task_type_id: f.ttypeA }))).toBeNull();
      expect(await tryInsert(db, "records", recRow(f, { task_type_id: f.ttypeB }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
    }));

  it("crew, location and persona links are composite same-company FKs", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      expect(await tryInsert(db, "records", recRow(f, { crew_id: f.crewB }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
      expect(await tryInsert(db, "records", recRow(f, { location_id: f.locB }))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
      const rec = await mustInsert(db, "records", recRow(f));
      expect(await tryInsert(db, "record_participants", partRow(rec, f.personaB))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
    }));
});

describe("records: children (participants, signatures, attachments)", () => {
  it("insert only into the caller's own submitted record created in the same transaction", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      const own = await mustInsert(db, "records", recRow(f));
      // created in an earlier transaction (created_at != now())
      const old = await mustInsert(
        db,
        "records",
        recRow(f, { created_at: "2026-01-01T00:00:00Z" }),
      );
      expect(await tryInsert(db, "record_participants", partRow(own, f.personaA1))).toBeNull();
      expect(await tryInsert(db, "record_participants", partRow(old, f.personaA1))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(await tryInsert(db, "attachments", attRow(old))).toBe(INSUFFICIENT_PRIVILEGE);

      // someone else's record: another supervisor cannot attach children
      await db.as(supA2);
      expect(await tryInsert(db, "record_participants", partRow(own, f.personaA2))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(await tryInsert(db, "attachments", attRow(own))).toBe(INSUFFICIENT_PRIVILEGE);
      // hse can read but is not the author either
      await db.as(ids.userA);
      expect(await tryInsert(db, "record_participants", partRow(own, f.personaA2))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );

      // no longer submitted
      await db.as(null);
      await db.query("update records set status = 'accepted' where id = $1", [own]);
      await db.as(supA);
      expect(await tryInsert(db, "record_participants", partRow(own, f.personaA2))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      const p = await tryInsert(db, "signatures", sigRow(own, f.personaA1));
      expect(p).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("participants: role domain and uniqueness", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      const rec = await mustInsert(db, "records", recRow(f));
      expect(await tryInsert(db, "record_participants", partRow(rec, f.personaA1, "boss"))).toBe(
        CHECK_VIOLATION,
      );
      expect(
        await tryInsert(db, "record_participants", partRow(rec, f.personaA1, "attendee")),
      ).toBeNull();
      expect(
        await tryInsert(db, "record_participants", partRow(rec, f.personaA1, "attendee")),
      ).toBe(UNIQUE_VIOLATION);
      expect(
        await tryInsert(db, "record_participants", partRow(rec, f.personaA1, "signer")),
      ).toBeNull();
    }));

  it("signature persona must be a signer/attendee participant of the record", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      const rec = await mustInsert(db, "records", recRow(f));
      await mustInsert(db, "record_participants", partRow(rec, f.personaA1, "signer"));
      await mustInsert(db, "record_participants", partRow(rec, f.personaA2, "responsible"));
      expect(await tryInsert(db, "signatures", sigRow(rec, f.personaA1))).toBeNull();
      // responsible-only participant cannot sign
      expect(await tryInsert(db, "signatures", sigRow(rec, f.personaA2))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
      // persona that is not a participant at all
      const other = await mustInsert(db, "records", recRow(f));
      expect(await tryInsert(db, "signatures", sigRow(other, f.personaA1))).toBe(
        FOREIGN_KEY_VIOLATION,
      );
      // one signature per (record, persona)
      expect(await tryInsert(db, "signatures", sigRow(rec, f.personaA1))).toBe(UNIQUE_VIOLATION);
      // attendee also signs
      await mustInsert(db, "record_participants", partRow(rec, f.personaA2, "attendee"));
      expect(await tryInsert(db, "signatures", sigRow(rec, f.personaA2))).toBeNull();
    }));

  it("signature image_path and content_hash/id shape (check constraints)", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      const rec = await mustInsert(db, "records", recRow(f));
      await mustInsert(db, "record_participants", partRow(rec, f.personaA1, "signer"));
      const bad = async (o: Record<string, unknown>) =>
        tryInsert(db, "signatures", sigRow(rec, f.personaA1, o));
      expect(await bad({ image_path: `${ids.companyB}/signatures/${rid()}.png` })).toBe(
        CHECK_VIOLATION,
      );
      expect(await bad({ image_path: `${ids.companyA}/signatures/${rid()}.png` })).toBe(
        CHECK_VIOLATION,
      );
      expect(await bad({ image_path: "../x.png" })).toBe(CHECK_VIOLATION);
      const id = rid();
      expect(await bad({ id, image_path: `${ids.companyA}/signatures/${id}.jpg` })).toBe(
        CHECK_VIOLATION,
      );
      expect(await bad({ content_hash: "nothex" })).toBe(CHECK_VIOLATION);
      const v4 = "11111111-1111-4111-8111-111111111111";
      expect(await bad({ id: v4, image_path: `${ids.companyA}/signatures/${v4}.png` })).toBe(
        CHECK_VIOLATION,
      );
      expect(await bad({ geo_lat: 1 })).toBe(CHECK_VIOLATION);
      expect(await bad({})).toBeNull();
    }));

  it("attachment path, owner, mime and size (check constraints)", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      const rec = await mustInsert(db, "records", recRow(f));
      const other = await mustInsert(db, "records", recRow(f));
      const bad = async (o: Record<string, unknown>) =>
        tryInsert(db, "attachments", attRow(rec, o));
      expect(await bad({})).toBeNull();
      const id = rid();
      expect(await bad({ id, path: `${ids.companyA}/records/${other}/${id}.jpg` })).toBe(
        CHECK_VIOLATION,
      );
      expect(await bad({ id, path: `${ids.companyB}/records/${rec}/${id}.jpg` })).toBe(
        CHECK_VIOLATION,
      );
      expect(await bad({ id, path: `${ids.companyA}/records/${rec}/${id}.exe` })).toBe(
        CHECK_VIOLATION,
      );
      expect(await bad({ id, path: `${ids.companyA}/records/${rec}/../${id}.jpg` })).toBe(
        CHECK_VIOLATION,
      );
      expect(await bad({ path: "anything.jpg" })).toBe(CHECK_VIOLATION);
      expect(await bad({ mime: "application/pdf" })).toBe(CHECK_VIOLATION);
      expect(await bad({ size: 0 })).toBe(CHECK_VIOLATION);
      expect(await bad({ size: 5242881 })).toBe(CHECK_VIOLATION);
      expect(await bad({ geo_lng: 1 })).toBe(CHECK_VIOLATION);
      // exactly one owner: a null record_id is rejected
      const id2 = rid();
      await db.as(null); // owner: RLS would reject first
      expect(
        await tryInsert(db, "attachments", {
          ...attRow(rec, { id: id2 }),
          record_id: null,
          path: `${ids.companyA}/x/${id2}.jpg`,
        }),
      ).toBe(CHECK_VIOLATION);
    }));
});

describe("records: immutability guards", () => {
  it("records_guard: no delete, no payload update, only status changes, locked is frozen", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const { rec } = await chainA(db, f, supA);
      // owner (bypasses RLS) is bound too
      expect(await db.errorCode("delete from records where id = $1", [rec])).toBe(GUARD);
      expect(
        await db.errorCode("update records set payload = '{\"x\":1}' where id = $1", [rec]),
      ).toBe(GUARD);
      expect(
        await db.errorCode("update records set submission_hash = $2 where id = $1", [rec, HASH2]),
      ).toBe(GUARD);
      expect(
        await db.errorCode("update records set author_id = $2 where id = $1", [rec, supA2]),
      ).toBe(GUARD);
      expect(
        await db.errorCode("update records set status = 'accepted', payload = '{}' where id = $1", [
          rec,
        ]),
      ).toBe(GUARD);
      expect(
        await db.errorCode("update records set status = 'accepted' where id = $1", [rec]),
      ).toBeNull();
      expect(
        await db.errorCode("update records set status = 'locked' where id = $1", [rec]),
      ).toBeNull();
      expect(
        await db.errorCode("update records set status = 'accepted' where id = $1", [rec]),
      ).toBe(GUARD);
      expect((await db.one("select status from records where id = $1", [rec])).status).toBe(
        "locked",
      );
      // authenticated has select + insert only
      await db.as(supA);
      expect(
        await db.errorCode("update records set status = 'accepted' where id = $1", [rec]),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await db.errorCode("delete from records where id = $1", [rec])).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    }));

  it("children and conflicts are never updated or deleted (any role)", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const c = await chainA(db, f, supA);
      const cases: [string, string][] = [
        [
          "record_participants",
          (await db.one("select id from record_participants where record_id = $1", [c.rec]))
            .id as string,
        ],
        ["signatures", c.sig],
        ["attachments", c.att],
        ["record_conflicts", c.conflict],
      ];
      for (const [table, id] of cases) {
        expect(
          await db.errorCode(`update ${table} set company_id = company_id where id = $1`, [id]),
          `${table} update`,
        ).toBe(GUARD);
        expect(
          await db.errorCode(`delete from ${table} where id = $1`, [id]),
          `${table} delete`,
        ).toBe(GUARD);
        await db.as(ids.userA);
        expect(
          await db.errorCode(`update ${table} set company_id = company_id where id = $1`, [id]),
        ).toBe(INSUFFICIENT_PRIVILEGE);
        expect(await db.errorCode(`delete from ${table} where id = $1`, [id])).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
        await db.as(null);
      }
    }));
});

describe("form_schemas and record_types", () => {
  const draft = (extra: Record<string, unknown> = {}) => ({
    record_type_id: TOOLBOX,
    kind: "base",
    version: 5,
    status: "draft",
    schema: { title: "t" },
    ...extra,
  });

  it("seeds: global toolbox_talk and ats, schema equals the seed JSON files", () =>
    withRollback(async (db) => {
      const types = await db.query(
        "select id, code, company_id, active from record_types where company_id is null order by code",
      );
      expect(types.map((t) => [t.id, t.code, t.active])).toEqual([
        [ATS, "ats", true],
        [TOOLBOX, "toolbox_talk", true],
      ]);
      for (const [typeId, file] of [
        [TOOLBOX, "toolbox_talk"],
        [ATS, "ats"],
      ] as const) {
        const row = await db.one(
          "select kind, version, status, company_id, published_at is not null as pub, schema from form_schemas where record_type_id = $1",
          [typeId],
        );
        expect(row).toMatchObject({
          kind: "base",
          version: 1,
          status: "published",
          company_id: null,
          pub: true,
        });
        expect(row.schema).toEqual(
          JSON.parse(readFileSync(`src/forms/seeds/${file}.v1.json`, "utf8")),
        );
      }
    }));

  it("published is immutable: no delete, only published -> retired, retired is final", () =>
    withRollback(async (db) => {
      const id = TOOLBOX_SCHEMA;
      expect(await db.errorCode("delete from form_schemas where id = $1", [id])).toBe(GUARD);
      expect(await db.errorCode("update form_schemas set schema = '{}' where id = $1", [id])).toBe(
        GUARD,
      );
      expect(await db.errorCode("update form_schemas set version = 9 where id = $1", [id])).toBe(
        GUARD,
      );
      expect(
        await db.errorCode(
          "update form_schemas set published_by = null, published_at = now() where id = $1",
          [id],
        ),
      ).toBe(GUARD);
      expect(
        await db.errorCode(
          "update form_schemas set status = 'draft', published_at = null where id = $1",
          [id],
        ),
      ).toBe(GUARD);
      expect(
        await db.errorCode(
          "update form_schemas set status = 'retired', schema = '{}' where id = $1",
          [id],
        ),
      ).toBe(GUARD);
      expect(
        await db.errorCode("update form_schemas set status = 'retired' where id = $1", [id]),
      ).toBeNull();
      expect(
        await db.errorCode("update form_schemas set status = 'published' where id = $1", [id]),
      ).toBe(GUARD);
      expect(await db.errorCode("update form_schemas set schema = '{}' where id = $1", [id])).toBe(
        GUARD,
      );
      expect(await db.errorCode("delete from form_schemas where id = $1", [id])).toBe(GUARD);
    }));

  it("drafts are editable/deletable and can only be published (published_at required)", () =>
    withRollback(async (db) => {
      const a = await mustInsert(db, "form_schemas", draft());
      expect(
        await db.errorCode('update form_schemas set schema = \'{"title":"u"}\' where id = $1', [a]),
      ).toBeNull();
      expect(
        await db.errorCode(
          "update form_schemas set status = 'retired', published_at = now() where id = $1",
          [a],
        ),
      ).toBe(GUARD);
      expect(
        await db.errorCode("update form_schemas set status = 'published' where id = $1", [a]),
      ).toBe(CHECK_VIOLATION);
      expect(await db.errorCode("delete from form_schemas where id = $1", [a])).toBeNull();
      const b = await mustInsert(db, "form_schemas", draft());
      await db.query("update form_schemas set status = 'retired' where id = $1", [TOOLBOX_SCHEMA]);
      expect(
        await db.errorCode(
          "update form_schemas set status = 'published', published_at = now() where id = $1",
          [b],
        ),
      ).toBeNull();
      expect(await db.errorCode("update form_schemas set schema = '{}' where id = $1", [b])).toBe(
        GUARD,
      );
    }));

  it("constraints: one published per type x kind x company, unique version, extension rules", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      // second published base for the same global type
      expect(
        await tryInsert(
          db,
          "form_schemas",
          draft({ version: 2, status: "published", published_at: new Date() }),
        ),
      ).toBe(UNIQUE_VIOLATION);
      expect(await tryInsert(db, "form_schemas", draft({ version: 1 }))).toBe(UNIQUE_VIOLATION);
      // company base for a global type / global base for a company type
      expect(await tryInsert(db, "form_schemas", draft({ company_id: ids.companyA }))).toBe(
        CHECK_VIOLATION,
      );
      expect(
        await tryInsert(db, "form_schemas", draft({ record_type_id: f.typeA, version: 2 })),
      ).toBe(CHECK_VIOLATION);
      // extension: needs a company and a global type
      expect(await tryInsert(db, "form_schemas", draft({ kind: "extension" }))).toBe(
        CHECK_VIOLATION,
      );
      expect(
        await tryInsert(db, "form_schemas", draft({ kind: "extension", company_id: ids.companyA })),
      ).toBeNull();
      expect(
        await tryInsert(
          db,
          "form_schemas",
          draft({ kind: "extension", company_id: ids.companyA, record_type_id: f.typeA }),
        ),
      ).toBe(CHECK_VIOLATION);
      // status / published_at consistency, bad enum, non-object schema
      expect(await tryInsert(db, "form_schemas", draft({ version: 7, status: "published" }))).toBe(
        CHECK_VIOLATION,
      );
      expect(
        await tryInsert(db, "form_schemas", draft({ version: 8, published_at: new Date() })),
      ).toBe(CHECK_VIOLATION);
      expect(await tryInsert(db, "form_schemas", draft({ version: 9, status: "weird" }))).toBe(
        CHECK_VIOLATION,
      );
      expect(await tryInsert(db, "form_schemas", draft({ version: 10, schema: "[]" }))).toBe(
        CHECK_VIOLATION,
      );
    }));

  it("visibility: members read global + own published/retired; drafts only admin/hse; no writes", () =>
    withRollback(async (db) => {
      await seed(db);
      await mustInsert(db, "form_schemas", draft({ version: 6 })); // global draft
      await mustInsert(
        db,
        "form_schemas",
        draft({ kind: "extension", company_id: ids.companyA, version: 1 }),
      ); // A draft
      const drafts = (u: string) =>
        db.as(u).then(() => count(db, "form_schemas", "status = 'draft'"));
      expect(await drafts(supA)).toBe(0);
      expect(await drafts(ids.workerA)).toBe(0);
      expect(await drafts(managerA)).toBe(0);
      expect(await drafts(ids.userA)).toBe(2); // hse: global draft + own draft
      expect(await drafts(adminA)).toBe(2);
      expect(await drafts(ids.userB)).toBe(1); // B admin: global draft only
      // published/retired still readable by a worker
      await db.as(ids.workerA);
      expect(await count(db, "form_schemas", "status = 'published'")).toBe(3);
      // phase 2: select only
      await db.as(adminA);
      expect(await tryInsert(db, "form_schemas", draft({ version: 20 }))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(
        await db.errorCode("update form_schemas set schema = '{}' where id = $1", [TOOLBOX_SCHEMA]),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await tryInsert(db, "record_types", {
          company_id: ids.companyA,
          code: "nuevo",
          name: "Nuevo",
        }),
      ).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("record_types: code unique per company, may not shadow a global code, globals readable by all", () =>
    withRollback(async (db) => {
      await seed(db);
      expect(
        await tryInsert(db, "record_types", {
          company_id: ids.companyA,
          code: "toolbox_talk",
          name: "x",
        }),
      ).toBe(UNIQUE_VIOLATION);
      expect(
        await tryInsert(db, "record_types", {
          company_id: ids.companyA,
          code: "tipo_a",
          name: "dup",
        }),
      ).toBe(UNIQUE_VIOLATION);
      expect(
        await tryInsert(db, "record_types", {
          company_id: ids.companyB,
          code: "tipo_a",
          name: "other co",
        }),
      ).toBeNull();
      expect(
        await tryInsert(db, "record_types", { code: "toolbox_talk", name: "global dup" }),
      ).toBe(UNIQUE_VIOLATION);
      expect(
        await tryInsert(db, "record_types", {
          company_id: ids.companyA,
          code: "Bad Code",
          name: "x",
        }),
      ).toBe(CHECK_VIOLATION);
      for (const u of [ids.workerA, ids.userB, guestA]) {
        await db.as(u);
        expect(await count(db, "record_types", "company_id is null"), u).toBe(2);
      }
    }));
});

describe("records: read access", () => {
  it("author, or hse/manager/admin; other supervisors and workers only their own", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await chainA(db, f, supA);
      await chainA(db, f, supA2);
      const seen = async (u: string) => {
        await db.as(u);
        return [
          await count(db, "records"),
          await count(db, "record_participants"),
          await count(db, "signatures"),
          await count(db, "attachments"),
          await count(db, "record_conflicts"),
        ];
      };
      expect(await seen(supA)).toEqual([1, 1, 1, 1, 1]); // own chain only
      expect(await seen(supA2)).toEqual([1, 1, 1, 1, 1]);
      expect(await seen(ids.userA)).toEqual([2, 2, 2, 2, 2]); // hse
      expect(await seen(managerA)).toEqual([2, 2, 2, 2, 0]); // manager: records yes, conflicts are HSE-only
      expect(await seen(adminA)).toEqual([2, 2, 2, 2, 2]);
      expect(await seen(ids.workerA)).toEqual([0, 0, 0, 0, 0]);
    }));

  it("anonymous guest (users.is_anonymous) reads only their own records, even as hse", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await chainA(db, f, supA); // someone else's record in the shared company
      const own = await chainA(db, f, guestA);
      await db.as(guestA);
      expect(await count(db, "records")).toBe(1);
      expect((await db.one("select id from records")).id).toBe(own.rec);
      expect(await count(db, "record_participants")).toBe(1);
      expect(await count(db, "signatures")).toBe(1);
      expect(await count(db, "attachments")).toBe(1);
      // a non-guest hse reads both
      await db.as(ids.userA);
      expect(await count(db, "records")).toBe(2);
      // the same hse user as a guest loses that access
      await db.as(null);
      await db.query("update users set is_anonymous = true where id = $1", [ids.userA]);
      await db.as(ids.userA);
      expect(await count(db, "records")).toBe(0);
    }));
});

describe("records: children follow the visibility of their record", () => {
  it("a guest author sees their own record and its children only; hse flipped to guest loses the children too", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await chainA(db, f, supA); // not the guest's
      const own = await chainA(db, f, guestA);
      await db.as(guestA);
      expect((await db.query("select id from record_participants")).length).toBe(1);
      expect((await db.one("select record_id from signatures")).record_id).toBe(own.rec);
      expect((await db.one("select record_id from attachments")).record_id).toBe(own.rec);
      await db.as(ids.userA);
      expect(await count(db, "record_participants")).toBe(2);
      expect(await count(db, "signatures")).toBe(2);
      expect(await count(db, "attachments")).toBe(2);
      await db.as(null);
      await db.query("update users set is_anonymous = true where id = $1", [ids.userA]);
      await db.as(ids.userA);
      expect(await count(db, "records")).toBe(0);
      expect(await count(db, "record_participants")).toBe(0);
      expect(await count(db, "signatures")).toBe(0);
      expect(await count(db, "attachments")).toBe(0);
    }));

  it("drift guard: per user, the visible children are exactly the children of the visible records", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await chainA(db, f, supA);
      await chainA(db, f, supA2);
      await chainA(db, f, guestA);
      await chainA(db, f, ids.userA);
      for (const table of ["record_participants", "signatures", "attachments"]) {
        for (const u of [
          supA,
          supA2,
          ids.userA,
          managerA,
          adminA,
          ids.workerA,
          guestA,
          ids.userB,
        ]) {
          await db.as(u);
          const records = (await db.query("select id from records")).map((r) => r.id as string);
          const visible = (await db.query(`select id from ${table}`))
            .map((r) => r.id as string)
            .sort();
          await db.as(null);
          const expected = (
            await db.query(`select id from ${table} where record_id = any($1::uuid[])`, [records])
          )
            .map((r) => r.id as string)
            .sort();
          expect(visible, `${table} as ${u}`).toEqual(expected);
        }
      }
    }));
});

describe("record_conflicts", () => {
  it("insert by the author for a record they can see; spoofed author or invisible record denied", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const { rec } = await chainA(db, f, supA);
      const row = (o: Record<string, unknown> = {}) => ({
        company_id: ids.companyA,
        record_id: rec,
        envelope: { v: 1 },
        device_id: "dev-3",
        ...o,
      });
      await db.as(supA);
      expect(await tryInsert(db, "record_conflicts", row())).toBeNull();
      expect(await tryInsert(db, "record_conflicts", row({ author_id: supA2 }))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(await tryInsert(db, "record_conflicts", row({ envelope: JSON.stringify([]) }))).toBe(
        CHECK_VIOLATION,
      );
      expect(await tryInsert(db, "record_conflicts", row({ record_id: rid() }))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      // other supervisor cannot see the record -> denied (the endpoint maps this to 409 id_conflict)
      await db.as(supA2);
      expect(await tryInsert(db, "record_conflicts", row())).toBe(INSUFFICIENT_PRIVILEGE);
      // hse sees every record, may insert
      await db.as(ids.userA);
      expect(await tryInsert(db, "record_conflicts", row())).toBeNull();
      // worker and manager: no
      await db.as(ids.workerA);
      expect(await tryInsert(db, "record_conflicts", row())).toBe(INSUFFICIENT_PRIVILEGE);
      await db.as(managerA);
      expect(await tryInsert(db, "record_conflicts", row())).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("readable by hse/admin and by the submitter only; append-only for every role", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const c = await chainA(db, f, supA);
      for (const [u, n] of [
        [supA, 1],
        [supA2, 0],
        [ids.userA, 1],
        [adminA, 1],
        [managerA, 0],
        [ids.workerA, 0],
      ] as const) {
        await db.as(u);
        expect(await count(db, "record_conflicts"), u).toBe(n);
      }
      await db.as(null);
      expect(
        await db.errorCode("update record_conflicts set device_id = 'x' where id = $1", [
          c.conflict,
        ]),
      ).toBe(GUARD);
      expect(await db.errorCode("delete from record_conflicts where id = $1", [c.conflict])).toBe(
        GUARD,
      );
    }));
});

describe("records: shared triggers (read-only trial, audit)", () => {
  it("expired trial: every write on all seven tables raises VQ001 (authenticated and owner)", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const c = await chainA(db, f, supA);
      const partId = (
        await db.one("select id from record_participants where record_id = $1", [c.rec])
      ).id as string;
      await expireTrial(db, ids.companyA);

      // reads still work
      await db.as(supA);
      expect(await count(db, "records")).toBe(1);

      const newRec = recRow(f);
      const writes: [string, string, unknown[]][] = [
        [
          "record_types insert",
          ...Object.values(
            insertSql("record_types", { company_id: ids.companyA, code: "otro", name: "O" }),
          ),
        ] as [string, string, unknown[]],
        ["record_types update", "update record_types set name = 'z' where id = $1", [f.typeA]],
        ["record_types delete", "delete from record_types where id = $1", [f.typeA]],
        [
          "form_schemas insert",
          ...Object.values(
            insertSql("form_schemas", {
              record_type_id: TOOLBOX,
              kind: "extension",
              company_id: ids.companyA,
              version: 1,
              schema: {},
            }),
          ),
        ] as [string, string, unknown[]],
        ["records insert", ...Object.values(insertSql("records", newRec))] as [
          string,
          string,
          unknown[],
        ],
        ["records update", "update records set status = 'accepted' where id = $1", [c.rec]],
        ["records delete", "delete from records where id = $1", [c.rec]],
        [
          "participants insert",
          ...Object.values(insertSql("record_participants", partRow(c.rec, f.personaA2))),
        ] as [string, string, unknown[]],
        [
          "participants update",
          "update record_participants set role = 'signer' where id = $1",
          [partId],
        ],
        ["participants delete", "delete from record_participants where id = $1", [partId]],
        [
          "signatures insert",
          ...Object.values(insertSql("signatures", sigRow(c.rec, f.personaA1))),
        ] as [string, string, unknown[]],
        [
          "signatures update",
          "update signatures set content_hash = content_hash where id = $1",
          [c.sig],
        ],
        ["signatures delete", "delete from signatures where id = $1", [c.sig]],
        ["attachments insert", ...Object.values(insertSql("attachments", attRow(c.rec)))] as [
          string,
          string,
          unknown[],
        ],
        ["attachments update", "update attachments set size = size where id = $1", [c.att]],
        ["attachments delete", "delete from attachments where id = $1", [c.att]],
        [
          "conflicts insert",
          ...Object.values(
            insertSql("record_conflicts", {
              company_id: ids.companyA,
              record_id: c.rec,
              envelope: {},
              device_id: "d",
            }),
          ),
        ] as [string, string, unknown[]],
        [
          "conflicts update",
          "update record_conflicts set device_id = 'x' where id = $1",
          [c.conflict],
        ],
        ["conflicts delete", "delete from record_conflicts where id = $1", [c.conflict]],
      ];
      for (const role of ["authenticated", "owner"]) {
        for (const [label, sql, params] of writes) {
          // `authenticated` holds no grant for update/delete or for types/schemas (42501 comes first).
          if (
            role === "authenticated" &&
            !/^(records|participants|signatures|attachments|conflicts) insert$/.test(label)
          )
            continue;
          if (role === "authenticated") await db.as(supA);
          else await db.as(null);
          expect(await db.errorCode(sql, params), `${role}: ${label}`).toBe(READ_ONLY);
        }
      }
    }));

  it("expired trial: company form_schemas rows are read-only too (update/delete)", () =>
    withRollback(async (db) => {
      await seed(db);
      const fsId = (
        await db.one("select id from form_schemas where company_id = $1", [ids.companyA])
      ).id as string;
      await expireTrial(db, ids.companyA);
      expect(
        await db.errorCode("update form_schemas set status = 'retired' where id = $1", [fsId]),
      ).toBe(READ_ONLY);
      expect(await db.errorCode("delete from form_schemas where id = $1", [fsId])).toBe(READ_ONLY);
    }));

  it("global seed rows are not company-scoped: writable by the owner, not audited, unaffected by trial state", () =>
    withRollback(async (db) => {
      await seed(db);
      await expireTrial(db, ids.companyA);
      const before = await count(db, "audit_log");
      const id = await mustInsert(db, "record_types", { code: "tmp_global", name: "Tmp" });
      await db.query("update record_types set name = 'Tmp2' where id = $1", [id]);
      await db.query("delete from record_types where id = $1", [id]);
      const draftId = await mustInsert(db, "form_schemas", {
        record_type_id: ATS,
        kind: "base",
        version: 3,
        schema: {},
      });
      await db.query("update form_schemas set schema = '{\"a\":1}' where id = $1", [draftId]);
      await db.query("delete from form_schemas where id = $1", [draftId]);
      expect(await count(db, "audit_log")).toBe(before);
    }));

  it("audit rows are written for every record table and for company types/schemas", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const c = await chainA(db, f, supA);
      const partId = (
        await db.one("select id from record_participants where record_id = $1", [c.rec])
      ).id as string;
      const audited = (entity: string, entityId: string, action: string) =>
        count(
          db,
          "audit_log",
          "company_id = $1 and entity = $2 and entity_id = $3 and action = $4",
          [ids.companyA, entity, entityId, action],
        );
      expect(await audited("records", c.rec, "insert")).toBe(1);
      expect(await audited("record_participants", partId, "insert")).toBe(1);
      expect(await audited("signatures", c.sig, "insert")).toBe(1);
      expect(await audited("attachments", c.att, "insert")).toBe(1);
      expect(await audited("record_conflicts", c.conflict, "insert")).toBe(1);
      // audited as the acting user
      const a = await db.one(
        "select actor_id from audit_log where entity = 'records' and entity_id = $1",
        [c.rec],
      );
      expect(a.actor_id).toBe(supA);
      await db.query("update records set status = 'accepted' where id = $1", [c.rec]);
      expect(await audited("records", c.rec, "update")).toBe(1);
      // company type + schema rows are audited (split triggers), global ones are not
      expect(await audited("record_types", f.typeA, "insert")).toBe(1);
      const fsId = (
        await db.one("select id from form_schemas where company_id = $1", [ids.companyA])
      ).id as string;
      expect(await audited("form_schemas", fsId, "insert")).toBe(1);
      await db.query("update form_schemas set status = 'retired' where id = $1", [fsId]);
      expect(await audited("form_schemas", fsId, "update")).toBe(1);
      await db.query("update record_types set active = false where id = $1", [f.typeA]);
      expect(await audited("record_types", f.typeA, "update")).toBe(1);
      expect(
        await count(
          db,
          "audit_log",
          "entity in ('record_types','form_schemas') and entity_id in ($1, $2)",
          [TOOLBOX, TOOLBOX_SCHEMA],
        ),
      ).toBe(0);
    }));
});
