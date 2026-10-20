// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VaquiaDb,
  type BlobRow,
  type DraftRow,
  type ReferenceRow,
  type RecordSubmission,
} from "@/lib/offline/db";
import { isUuidV7 } from "./uuid";

// Phase 2.4 — device outbox: blobs then record in one transaction, idempotent enqueue, sign-out
// cleanup that never drops unsynced work (spec/data-model.md#Sync endpoints, Outbox & retry).

// notifyEnqueued() would start a real runSync against the (mocked) global fetch; not part of these tests.
vi.mock("./trigger", () => ({ notifyEnqueued: vi.fn() }));

import { cleanupOnSignOut, countOutbox, enqueueRecord } from "./outbox";

const COMPANY_A = "aaaaaaaa-0000-7000-8000-00000000000a";
const COMPANY_B = "bbbbbbbb-0000-7000-8000-00000000000b";

let counter = 0;
const id = () => {
  counter += 1;
  return `dddd0000-0000-7000-8000-${String(counter).padStart(12, "0")}`;
};

let db: VaquiaDb;

beforeEach(async () => {
  await Dexie.delete("vaquia");
  db = new VaquiaDb();
});

afterEach(async () => {
  await db.delete();
});

const NOW = 1_700_000_000_000;

function submission(overrides: Partial<RecordSubmission> = {}): RecordSubmission {
  return {
    record_type_id: id(),
    occurred_at: "2026-10-19T10:00:00Z",
    crew_id: id(),
    location_id: id(),
    task_type_id: null,
    geo_lat: null,
    geo_lng: null,
    geo_accuracy: null,
    device_id: "device-1",
    client_created_at: "2026-10-19T10:00:00Z",
    amends_record_id: null,
    participants: [],
    signatures: [],
    attachments: [],
    ...overrides,
  };
}

async function putDraft(companyId = COMPANY_A): Promise<DraftRow> {
  const draft: DraftRow = {
    id: id(),
    company_id: companyId,
    record_type: "toolbox_talk",
    schema_version: 1,
    payload: { topic: "Charla" },
    updated_at: new Date(NOW).toISOString(),
  };
  await db.drafts.put(draft);
  return draft;
}

function blobRow(idValue: string, companyId = COMPANY_A, kind: BlobRow["kind"] = "signature"): BlobRow {
  return {
    id: idValue,
    company_id: companyId,
    kind,
    mime: "image/png",
    bytes: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }),
    sha256: "a".repeat(64),
  };
}

function signedSubmission(signatureIds: string[]): RecordSubmission {
  return submission({
    signatures: signatureIds.map((signatureId) => ({
      id: signatureId,
      persona_id: id(),
      signed_at: "2026-10-19T10:05:00Z",
      geo_lat: null,
      geo_lng: null,
      geo_accuracy: null,
      content_hash: "b".repeat(64),
    })),
  });
}

async function outboxRows() {
  return (await db.outbox.toArray()).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

describe("enqueueRecord", () => {
  it("queues blobs then the record in created_at order, with UUIDv7 outbox ids", async () => {
    const draft = await putDraft();
    const sigId = id();
    const photoId = id();
    await db.blobs.bulkPut([blobRow(sigId), blobRow(photoId, COMPANY_A, "photo")]);
    const sub = signedSubmission([sigId]);
    sub.attachments = [
      {
        id: photoId,
        mime: "image/png",
        size: 4,
        taken_at: "2026-10-19T10:06:00Z",
        geo_lat: null,
        geo_lng: null,
      },
    ];

    const result = await enqueueRecord({ draftId: draft.id, submission: sub, now: () => NOW }, db);

    expect(result.created).toBe(true);
    expect(result.blobOutboxIds).toHaveLength(2);
    const rows = await outboxRows();
    expect(rows.map((row) => row.kind)).toEqual(["blob", "blob", "record"]);
    expect(rows.map((row) => row.ref_id)).toEqual([sigId, photoId, draft.id]);
    expect(rows[2]!.id).toBe(result.recordOutboxId);
    for (const row of rows) {
      expect(isUuidV7(row.id)).toBe(true);
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(0);
      expect(row.next_attempt_at).toBeNull();
      expect(row.company_id).toBe(COMPANY_A);
    }
    // The draft is frozen with the submission it was enqueued with.
    expect((await db.drafts.get(draft.id))?.submission).toEqual(sub);
  });

  it("is idempotent: a second enqueue returns the existing record row and adds nothing", async () => {
    const draft = await putDraft();
    const sigId = id();
    await db.blobs.put(blobRow(sigId));
    const sub = signedSubmission([sigId]);

    const first = await enqueueRecord({ draftId: draft.id, submission: sub, now: () => NOW }, db);
    const again = await enqueueRecord(
      { draftId: draft.id, submission: { ...sub, device_id: "other-device" }, now: () => NOW + 5_000 },
      db,
    );

    expect(first.created).toBe(true);
    expect(again).toEqual({ recordOutboxId: first.recordOutboxId, blobOutboxIds: [], created: false });
    expect(await db.outbox.count()).toBe(2);
  });

  it("throws and leaves the outbox empty when a referenced blob is missing", async () => {
    const draft = await putDraft();
    const sub = signedSubmission([id()]);

    await expect(enqueueRecord({ draftId: draft.id, submission: sub, now: () => NOW }, db)).rejects.toThrow(
      /not found/,
    );
    expect(await db.outbox.count()).toBe(0);
    expect((await db.drafts.get(draft.id))?.submission).toBeUndefined();
  });

  it("throws when the draft does not exist", async () => {
    await expect(
      enqueueRecord({ draftId: id(), submission: submission(), now: () => NOW }, db),
    ).rejects.toThrow(/not found/);
    expect(await db.outbox.count()).toBe(0);
  });

  it("refuses a blob that belongs to another company", async () => {
    const draft = await putDraft(COMPANY_A);
    const foreignId = id();
    await db.blobs.put(blobRow(foreignId, COMPANY_B));
    await expect(
      enqueueRecord({ draftId: draft.id, submission: signedSubmission([foreignId]), now: () => NOW }, db),
    ).rejects.toThrow(/not found/);
    expect(await db.outbox.count()).toBe(0);
  });

  it("sets a photo's record_id to the draft when it was captured before the draft existed", async () => {
    const draft = await putDraft();
    const photoId = id();
    const photo = blobRow(photoId, COMPANY_A, "photo");
    photo.record_id = id(); // stale placeholder from the capture screen
    await db.blobs.put(photo);
    const sub = submission();
    sub.attachments = [
      {
        id: photoId,
        mime: "image/png",
        size: 4,
        taken_at: "2026-10-19T10:06:00Z",
        geo_lat: null,
        geo_lng: null,
      },
    ];

    await enqueueRecord({ draftId: draft.id, submission: sub, now: () => NOW }, db);
    expect((await db.blobs.get(photoId))?.record_id).toBe(draft.id);
  });
});

describe("countOutbox", () => {
  it("counts records only, with kept as error", () => {
    expect(
      countOutbox([
        { status: "pending", kind: "record" },
        { status: "failed", kind: "record" },
        { status: "sending", kind: "record" },
        { status: "kept", kind: "record" },
        { status: "pending", kind: "blob" },
        { status: "failed", kind: "blob" },
        { status: "kept", kind: "blob" },
      ]),
    ).toEqual({ pending: 2, syncing: 1, error: 1 });
  });

  it("is all zeroes for an empty outbox", () => {
    expect(countOutbox([])).toEqual({ pending: 0, syncing: 0, error: 0 });
  });
});

describe("cleanupOnSignOut", () => {
  async function seedCompany(companyId: string) {
    const draft = await putDraft(companyId);
    const blob = blobRow(id(), companyId);
    await db.blobs.put(blob);
    const reference: ReferenceRow = {
      company_id: companyId,
      key: "personas",
      data: [],
      fetched_at: new Date(NOW).toISOString(),
    };
    await db.reference.put(reference);
    return { draft, blob };
  }

  function cacheStorage() {
    return { delete: vi.fn(async () => true) } as unknown as Pick<CacheStorage, "delete">;
  }

  it("clears a company only when its outbox is empty, and the field-pages cache when the whole outbox is", async () => {
    const a = await seedCompany(COMPANY_A);
    const cache = cacheStorage();

    const result = await cleanupOnSignOut([COMPANY_A], db, cache);

    expect(result).toEqual({ clearedCompanies: [COMPANY_A], keptCompanies: [], cacheCleared: true });
    expect(await db.drafts.get(a.draft.id)).toBeUndefined();
    expect(await db.blobs.get(a.blob.id)).toBeUndefined();
    expect(await db.reference.where("company_id").equals(COMPANY_A).count()).toBe(0);
    expect(cache.delete).toHaveBeenCalledWith("field-pages");
  });

  it("keeps a company with unsynced rows and does not clear the shared cache", async () => {
    const a = await seedCompany(COMPANY_A);
    const b = await seedCompany(COMPANY_B);
    const draftB = await db.drafts.get(b.draft.id);
    await db.outbox.put({
      id: id(),
      company_id: COMPANY_B,
      kind: "record",
      ref_id: b.draft.id,
      status: "pending",
      attempts: 0,
      next_attempt_at: null,
      last_error: null,
      created_at: new Date(NOW).toISOString(),
    });
    const cache = cacheStorage();

    const result = await cleanupOnSignOut([COMPANY_A, COMPANY_B], db, cache);

    expect(result.clearedCompanies).toEqual([COMPANY_A]);
    expect(result.keptCompanies).toEqual([COMPANY_B]);
    expect(result.cacheCleared).toBe(false);
    expect(await db.drafts.get(a.draft.id)).toBeUndefined();
    expect(await db.blobs.get(a.blob.id)).toBeUndefined();
    expect(await db.drafts.get(b.draft.id)).toEqual(draftB);
    expect(await db.blobs.get(b.blob.id)).toBeDefined();
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it("counts kept (terminal) items as unsynced", async () => {
    const a = await seedCompany(COMPANY_A);
    await db.outbox.put({
      id: id(),
      company_id: COMPANY_A,
      kind: "record",
      ref_id: a.draft.id,
      status: "kept",
      attempts: 0,
      next_attempt_at: null,
      last_error: "read_only",
      created_at: new Date(NOW).toISOString(),
    });
    const cache = cacheStorage();

    const result = await cleanupOnSignOut([COMPANY_A], db, cache);

    expect(result).toEqual({ clearedCompanies: [], keptCompanies: [COMPANY_A], cacheCleared: false });
    expect(await db.drafts.get(a.draft.id)).toBeDefined();
    expect(cache.delete).not.toHaveBeenCalled();
  });
});
