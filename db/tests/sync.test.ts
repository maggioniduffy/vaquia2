import { describe, expect, it } from "vitest";
import { computeContentHash, computeSubmissionHash, sha256Hex } from "@/lib/sync/canonical";
import type { RecordEnvelope } from "@/lib/sync/envelope";
import { storeBlob, type BlobInput } from "@/lib/sync/server/blobs";
import { signatureKey } from "@/lib/sync/server/keys";
import { upsertRecord } from "@/lib/sync/server/records";
import type { SyncDb, SyncResult } from "@/lib/sync/server/result";
import type { Storage } from "@/lib/storage";
import { createUser, ids, twoCompanies, withRollback, type TestDb } from "./helpers";

// Phase 2.4 — sync endpoints (spec/data-model.md#Sync endpoints): idempotent record upsert,
// conflict copies, terminal errors, write-once blobs. Runs as the `authenticated` role inside the
// outer rolled-back transaction, exactly like records.test.ts.

const TOOLBOX = "90000000-0000-7000-8000-000000000501";
const HASH = "a".repeat(64);
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const supA = "aaaaaaaa-0000-7000-8000-000000000003"; // supervisor in A
const supA2 = "aaaaaaaa-0000-7000-8000-000000000004"; // another supervisor in A
const guestA = "aaaaaaaa-0000-7000-8000-000000000007"; // anonymous hse in A
// helpers: ids.userA = hse in A, ids.workerA = worker in A, ids.userB = admin in B,
// ids.both = worker in A + admin in B.

let counter = 0;
// Client-style UUIDv7 ids (version nibble 7, variant 8).
function rid(): string {
  counter += 1;
  return `dddd0000-0000-7000-8000-${String(counter).padStart(12, "0")}`;
}

function png(size = 64): Uint8Array {
  const bytes = new Uint8Array(Math.max(size, PNG.length));
  bytes.set(PNG);
  return bytes;
}

const digest = (bytes: Uint8Array) => sha256Hex(bytes.slice().buffer as ArrayBuffer);

type FakeStorage = Storage & { files: Map<string, { bytes: Uint8Array; mime: string }> };

function memoryStorage(available = true): FakeStorage {
  const files = new Map<string, { bytes: Uint8Array; mime: string }>();
  return {
    isAvailable: available,
    files,
    async put(key, bytes, mime) {
      files.set(key, { bytes: bytes.slice(), mime });
    },
    async get(key) {
      const file = files.get(key);
      if (!file) return null;
      const bytes = new Uint8Array(file.bytes);
      return {
        body: new Blob([bytes]).stream(),
        contentType: file.mime,
        size: bytes.length,
      };
    },
  };
}

// Adapts TestDb's row-array query to the pg-style `{ rows, rowCount }` the server modules expect.
function syncDb(db: TestDb): SyncDb {
  return {
    async query(text: string, values: unknown[] = []) {
      const rows = await db.query(text, values);
      return { rows, rowCount: rows.length };
    },
  } as unknown as SyncDb;
}

type Fx = {
  locA: string;
  crewA: string;
  personaA1: string;
  personaA2: string;
  locB: string;
  crewB: string;
};

async function seed(db: TestDb): Promise<Fx> {
  await twoCompanies(db);
  await createUser(db, supA, "a-sup@test.local");
  await createUser(db, supA2, "a-sup2@test.local");
  await createUser(db, guestA, "a-guest@test.local");
  await db.query("update users set is_anonymous = true where id = $1", [guestA]);
  await db.query(
    `insert into memberships (company_id, user_id, role) values
       ($1, $2, 'supervisor'), ($1, $3, 'supervisor'), ($1, $4, 'hse')`,
    [ids.companyA, supA, supA2, guestA],
  );
  const one = async (sql: string, params: unknown[]) => (await db.one(sql, params)).id as string;
  const locA = await one("insert into locations (company_id, name) values ($1, 'Loc A') returning id", [
    ids.companyA,
  ]);
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
  const locB = await one("insert into locations (company_id, name) values ($1, 'Loc B') returning id", [
    ids.companyB,
  ]);
  const crewB = await one(
    "insert into crews (company_id, name, location_id) values ($1, 'Crew B', $2) returning id",
    [ids.companyB, locB],
  );
  return { locA, crewA, personaA1, personaA2, locB, crewB };
}

function envelopeOf(f: Fx, overrides: Partial<RecordEnvelope> = {}): RecordEnvelope {
  return {
    company_id: ids.companyA,
    id: rid(),
    record_type_id: TOOLBOX,
    schema_version: 1,
    extension_version: null,
    occurred_at: "2026-10-19T10:00:00Z",
    crew_id: f.crewA,
    location_id: f.locA,
    task_type_id: null,
    payload: { topic: "Charla", crew: f.crewA, location: f.locA, attendees: [f.personaA1] },
    geo_lat: null,
    geo_lng: null,
    geo_accuracy: null,
    device_id: "device-1",
    client_created_at: "2026-10-19T10:00:00Z",
    amends_record_id: null,
    participants: [{ persona_id: f.personaA1, role: "attendee" }],
    signatures: [],
    attachments: [],
    ...overrides,
  };
}

/** Adds a signature for `persona`, with the content hash the server will recompute. */
async function sign(
  env: RecordEnvelope,
  persona: string,
): Promise<{ env: RecordEnvelope; signatureId: string }> {
  const signatureId = rid();
  const unsigned: RecordEnvelope = {
    ...env,
    signatures: [
      {
        id: signatureId,
        persona_id: persona,
        signed_at: "2026-10-19T10:05:00Z",
        geo_lat: null,
        geo_lng: null,
        geo_accuracy: null,
        content_hash: "0".repeat(64),
      },
    ],
  };
  const contentHash = await computeContentHash(unsigned);
  return {
    env: {
      ...unsigned,
      signatures: unsigned.signatures.map((signature) => ({ ...signature, content_hash: contentHash })),
    },
    signatureId,
  };
}

async function putSignatureBlob(storage: FakeStorage, company: string, signatureId: string) {
  const bytes = png(32);
  const key = signatureKey(company, signatureId);
  await storage.put(key, bytes, "image/png");
  return key;
}

async function count(db: TestDb, table: string, where = "true", params: unknown[] = []) {
  return (await db.one(`select count(*)::int as n from ${table} where ${where}`, params)).n as number;
}

async function expireTrial(db: TestDb, company: string) {
  await db.query(
    "update companies set plan = 'trial', trial_ends_at = now() - interval '1 day' where id = $1",
    [company],
  );
}

async function insertRecord(
  db: TestDb,
  user: string,
  row: { id: string; company: string; crew: string; location: string; payload?: unknown },
) {
  await db.as(user);
  await db.query(
    `insert into public.records
       (id, company_id, record_type_id, schema_version, occurred_at, crew_id, location_id, payload,
        submission_hash, device_id, client_created_at)
     values ($1, $2, $3, 1, '2026-10-19T10:00:00Z', $4, $5, $6::jsonb, $7, 'device-x', '2026-10-19T10:00:00Z')`,
    [
      row.id,
      row.company,
      TOOLBOX,
      row.crew,
      row.location,
      JSON.stringify(row.payload ?? { topic: "seed" }),
      HASH,
    ],
  );
}

const expectResult = (result: SyncResult, status: number, body: Record<string, unknown>) => {
  expect({ status: result.status, body: result.body }).toEqual({ status, body });
};

describe("sync: upsertRecord", () => {
  it("double submit is ok, no conflict, and adds no child rows", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const { env } = await sign(envelopeOf(f), f.personaA1);
      const storage = memoryStorage();
      await putSignatureBlob(storage, ids.companyA, env.signatures[0]!.id);
      await db.as(supA);
      const sync = syncDb(db);

      const first = await upsertRecord(sync, storage, env);
      const second = await upsertRecord(sync, storage, env);

      expectResult(first, 200, { ok: true, conflict: false });
      expectResult(second, 200, { ok: true, conflict: false });
      await db.as(null);
      expect(await count(db, "records", "id = $1", [env.id])).toBe(1);
      expect(await count(db, "record_participants", "record_id = $1", [env.id])).toBe(1);
      expect(await count(db, "signatures", "record_id = $1", [env.id])).toBe(1);
      expect(await count(db, "record_conflicts", "record_id = $1", [env.id])).toBe(0);
      expect(
        await count(db, "audit_log", "entity = 'records' and action = 'insert' and entity_id = $1", [
          env.id,
        ]),
      ).toBe(1);
    }));

  it("same id + different hash keeps one conflict copy and never touches the stored record", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const first = envelopeOf(f);
      const storage = memoryStorage();
      await db.as(supA);
      const sync = syncDb(db);

      expectResult(await upsertRecord(sync, storage, first), 200, { ok: true, conflict: false });

      const conflicting: RecordEnvelope = {
        ...first,
        payload: { ...first.payload, topic: "Otro tema" },
      };
      expectResult(await upsertRecord(sync, storage, conflicting), 200, {
        ok: true,
        conflict: true,
      });

      await db.as(null);
      const stored = await db.one<{ payload: unknown; submission_hash: string }>(
        "select payload, submission_hash from records where id = $1",
        [first.id],
      );
      expect(stored.payload).toEqual(first.payload);
      expect(stored.submission_hash).toBe(await computeSubmissionHash(first));
      expect(await count(db, "record_conflicts", "record_id = $1", [first.id])).toBe(1);

      // Re-sending the same conflicting envelope adds no second copy.
      await db.as(supA);
      expectResult(await upsertRecord(sync, storage, conflicting), 200, {
        ok: true,
        conflict: true,
      });
      await db.as(null);
      expect(await count(db, "record_conflicts", "record_id = $1", [first.id])).toBe(1);
      expect(await count(db, "records", "id = $1", [first.id])).toBe(1);
      expect(await count(db, "record_participants", "record_id = $1", [first.id])).toBe(1);
    }));

  it("id_conflict when the id exists but belongs to another author", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const id = rid();
      await insertRecord(db, supA2, { id, company: ids.companyA, crew: f.crewA, location: f.locA });
      await db.as(supA);
      const sync = syncDb(db);

      const result = await upsertRecord(sync, memoryStorage(), envelopeOf(f, { id }));

      expectResult(result, 409, { error: "id_conflict" });
      await db.as(null);
      expect(await count(db, "records", "id = $1", [id])).toBe(1);
      expect(await count(db, "record_conflicts", "record_id = $1", [id])).toBe(0);
    }));

  it("id_conflict when the id exists in another company", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const id = rid();
      await insertRecord(db, ids.userB, {
        id,
        company: ids.companyB,
        crew: f.crewB,
        location: f.locB,
      });
      await db.as(supA);
      const sync = syncDb(db);

      const result = await upsertRecord(sync, memoryStorage(), envelopeOf(f, { id }));

      expectResult(result, 409, { error: "id_conflict" });
      await db.as(null);
      expect(await count(db, "records", "company_id = $1", [ids.companyA])).toBe(0);
      expect(await count(db, "records", "company_id = $1", [ids.companyB])).toBe(1);
    }));

  it("read_only when the trial expired while the device was offline", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await expireTrial(db, ids.companyA);
      await db.as(supA);

      const env = envelopeOf(f);
      const result = await upsertRecord(syncDb(db), memoryStorage(), env);

      expectResult(result, 403, { error: "read_only" });
      await db.as(null);
      expect(await count(db, "records", "id = $1", [env.id])).toBe(0);
    }));

  it("forbidden for a non-member and for a member whose role cannot write", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const sync = syncDb(db);

      await db.as(ids.userB); // admin in B, not a member of A
      expectResult(await upsertRecord(sync, memoryStorage(), envelopeOf(f)), 403, {
        error: "forbidden",
      });

      await db.as(ids.workerA); // member of A with no write role
      expectResult(await upsertRecord(sync, memoryStorage(), envelopeOf(f)), 403, {
        error: "forbidden",
      });
    }));

  it("wrong_company when the item's company is not the caller's active company", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      // Member of both; active company is B.
      await db.query("insert into user_settings (user_id, active_company_id) values ($1, $2)", [
        ids.both,
        ids.companyB,
      ]);
      await db.as(ids.both);

      const env = envelopeOf(f);
      const result = await upsertRecord(syncDb(db), memoryStorage(), env);

      expectResult(result, 409, { error: "wrong_company" });
      await db.as(null);
      expect(await count(db, "records", "id = $1", [env.id])).toBe(0);
    }));

  it("invalid on a malformed envelope, an invalid payload and a bad signature content hash", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);
      const sync = syncDb(db);
      const storage = memoryStorage();

      const badPayload = envelopeOf(f, { payload: { topic: 1 } });
      expectResult(await upsertRecord(sync, storage, {}), 422, { error: "invalid" });
      expectResult(await upsertRecord(sync, storage, badPayload), 422, { error: "invalid" });

      const { env } = await sign(envelopeOf(f), f.personaA1);
      const tampered: RecordEnvelope = {
        ...env,
        signatures: env.signatures.map((signature) => ({
          ...signature,
          content_hash: "f".repeat(64),
        })),
      };
      expectResult(await upsertRecord(sync, storage, tampered), 422, { error: "invalid" });
      await db.as(null);
      expect(await count(db, "records", "id in ($1, $2)", [badPayload.id, env.id])).toBe(0);
    }));

  it("invalid when the database rejects the payload (integrity error)", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      await db.as(supA);

      // Company A envelope pointing at company B's crew: composite FK violation → invalid.
      const env = envelopeOf(f, { crew_id: f.crewB });
      const result = await upsertRecord(syncDb(db), memoryStorage(), env);

      expectResult(result, 422, { error: "invalid" });
      await db.as(null);
      expect(await count(db, "records", "id = $1", [env.id])).toBe(0);
    }));

  it("blob_missing when a referenced signature blob is absent or storage is off", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const { env } = await sign(envelopeOf(f), f.personaA1);
      await db.as(supA);
      const sync = syncDb(db);

      expectResult(await upsertRecord(sync, memoryStorage(), env), 409, {
        error: "blob_missing",
      });

      const present = memoryStorage();
      await putSignatureBlob(present, ids.companyA, env.signatures[0]!.id);
      expectResult(await upsertRecord(sync, memoryStorage(false), env), 409, {
        error: "blob_missing",
      });
      await db.as(null);
      expect(await count(db, "records", "id = $1", [env.id])).toBe(0);
    }));

  it("guest with attachments is forbidden (guests may upload signatures only)", () =>
    withRollback(async (db) => {
      const f = await seed(db);
      const env = envelopeOf(f, {
        attachments: [
          {
            id: rid(),
            mime: "image/jpeg",
            size: 1_000,
            taken_at: "2026-10-19T10:06:00Z",
            geo_lat: null,
            geo_lng: null,
          },
        ],
      });
      await db.as(guestA);

      const result = await upsertRecord(syncDb(db), memoryStorage(), env);

      expectResult(result, 403, { error: "forbidden" });
      await db.as(null);
      expect(await count(db, "records", "id = $1", [env.id])).toBe(0);
    }));
});

describe("sync: storeBlob", () => {
  const blobInput = async (overrides: Partial<BlobInput> = {}): Promise<BlobInput> => {
    const bytes = overrides.bytes ?? png();
    return {
      companyId: ids.companyA,
      id: rid(),
      kind: "signature",
      mime: "image/png",
      sha256: await digest(bytes),
      bytes,
      ...overrides,
    };
  };

  it("is write-once: the same bytes twice are ok and stored once", () =>
    withRollback(async (db) => {
      await seed(db);
      const storage = memoryStorage();
      const input = await blobInput();
      await db.as(supA);
      const sync = syncDb(db);

      expectResult(await storeBlob(sync, storage, input), 200, { ok: true });
      expectResult(await storeBlob(sync, storage, input), 200, { ok: true });
      expect(storage.files.size).toBe(1);
      expect(storage.files.has(signatureKey(ids.companyA, input.id))).toBe(true);
    }));

  it("rejects different bytes under the same id with blob_conflict", () =>
    withRollback(async (db) => {
      await seed(db);
      const storage = memoryStorage();
      const first = await blobInput({ bytes: png(32) });
      await db.as(supA);
      const sync = syncDb(db);

      expectResult(await storeBlob(sync, storage, first), 200, { ok: true });
      const second = await blobInput({ id: first.id, bytes: png(64) });
      expectResult(await storeBlob(sync, storage, second), 409, { error: "blob_conflict" });
      // The first write is untouched.
      expect(storage.files.get(signatureKey(ids.companyA, first.id))?.bytes).toEqual(png(32));
    }));

  it("rejects a non-PNG signature, an oversized signature, a wrong mime and an oversized photo", () =>
    withRollback(async (db) => {
      await seed(db);
      const storage = memoryStorage();
      await db.as(supA);
      const sync = syncDb(db);

      const notPng = await blobInput({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) });
      expectResult(await storeBlob(sync, storage, notPng), 422, { error: "blob_rejected" });

      const tooBigSignature = await blobInput({ bytes: png(200 * 1024 + 1) });
      expectResult(await storeBlob(sync, storage, tooBigSignature), 422, {
        error: "blob_rejected",
      });

      const wrongMime = await blobInput({ mime: "application/pdf" });
      expectResult(await storeBlob(sync, storage, wrongMime), 422, { error: "blob_rejected" });

      const tooBigPhoto = await blobInput({
        kind: "photo",
        recordId: rid(),
        bytes: png(5 * 1024 * 1024 + 1),
      });
      expectResult(await storeBlob(sync, storage, tooBigPhoto), 422, { error: "blob_rejected" });

      expect(storage.files.size).toBe(0);
    }));

  it("rejects a photo uploaded by a guest (signatures only)", () =>
    withRollback(async (db) => {
      await seed(db);
      const input = await blobInput({ kind: "photo", recordId: rid() });
      await db.as(guestA);

      expectResult(await storeBlob(syncDb(db), memoryStorage(), input), 422, {
        error: "blob_rejected",
      });
    }));

  it("returns corrupt_upload when the sha256 does not match the bytes", () =>
    withRollback(async (db) => {
      await seed(db);
      const storage = memoryStorage();
      const input = await blobInput({ sha256: "0".repeat(64) });
      await db.as(supA);

      expectResult(await storeBlob(syncDb(db), storage, input), 400, {
        error: "corrupt_upload",
      });
      expect(storage.files.size).toBe(0);
    }));

  it("stores a photo under the server-built key and accepts an invalid uuid only as invalid", () =>
    withRollback(async (db) => {
      await seed(db);
      const storage = memoryStorage();
      const recordId = rid();
      const photo = await blobInput({ kind: "photo", recordId, bytes: png(48) });
      await db.as(supA);
      const sync = syncDb(db);

      expectResult(await storeBlob(sync, storage, photo), 200, { ok: true });
      expect(storage.files.has(`${ids.companyA}/records/${recordId}/${photo.id}.png`)).toBe(true);

      const badId = { ...photo, id: "11111111-1111-4111-8111-111111111111" };
      expectResult(await storeBlob(sync, storage, badId), 422, { error: "invalid" });
    }));

  it("terminal access errors come before any write", () =>
    withRollback(async (db) => {
      await seed(db);
      const storage = memoryStorage();
      const input = await blobInput();

      await expireTrial(db, ids.companyA);
      await db.as(supA);
      expectResult(await storeBlob(syncDb(db), storage, input), 403, { error: "read_only" });

      await db.as(ids.userB); // not a member of the envelope's company
      expectResult(await storeBlob(syncDb(db), storage, input), 403, { error: "forbidden" });
      expect(storage.files.size).toBe(0);
    }));
});
