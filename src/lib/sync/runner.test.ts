// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  VaquiaDb,
  type BlobRow,
  type DraftRow,
  type OutboxRow,
  type OutboxStatus,
  type RecordSubmission,
} from "@/lib/offline/db";
import { runSync } from "./runner";

// Phase 2.4 — the sync runner walks the outbox in order, sends blobs before their record, keeps
// terminal items, backs off on retryable ones, halts on connection-level problems, and deletes
// local data only after the server confirms (spec/data-model.md#Sync endpoints, Outbox & retry).

const COMPANY = "aaaaaaaa-0000-7000-8000-00000000000a";
const NOW = 1_700_000_000_000;

let seq = 0;
const uuid = () => `eeee0000-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

let db: VaquiaDb;

beforeEach(async () => {
  await Dexie.delete("vaquia");
  db = new VaquiaDb();
});

afterEach(async () => {
  await db.delete();
});

function submission(signatureIds: string[] = []): RecordSubmission {
  return {
    record_type_id: uuid(),
    occurred_at: "2026-10-19T10:00:00Z",
    crew_id: uuid(),
    location_id: uuid(),
    task_type_id: null,
    geo_lat: null,
    geo_lng: null,
    geo_accuracy: null,
    device_id: "device-1",
    client_created_at: "2026-10-19T10:00:00Z",
    amends_record_id: null,
    participants: [],
    signatures: signatureIds.map((id) => ({
      id,
      persona_id: uuid(),
      signed_at: "2026-10-19T10:05:00Z",
      geo_lat: null,
      geo_lng: null,
      geo_accuracy: null,
      content_hash: "b".repeat(64),
    })),
    attachments: [],
  };
}

async function addRecord(
  opts: {
    signatureIds?: string[];
    createdAt?: number;
    status?: OutboxStatus;
    nextAttemptAt?: string | null;
  } = {},
) {
  const draft: DraftRow = {
    id: uuid(),
    company_id: COMPANY,
    record_type: "toolbox_talk",
    schema_version: 1,
    payload: { topic: "Charla" },
    updated_at: new Date(NOW).toISOString(),
    submission: submission(opts.signatureIds),
  };
  await db.drafts.put(draft);
  const row: OutboxRow = {
    id: uuid(),
    company_id: COMPANY,
    kind: "record",
    ref_id: draft.id,
    status: opts.status ?? "pending",
    attempts: 0,
    next_attempt_at: opts.nextAttemptAt ?? null,
    last_error: null,
    created_at: new Date(opts.createdAt ?? NOW).toISOString(),
  };
  await db.outbox.put(row);
  return { draft, row };
}

async function addBlob(
  blobId: string,
  opts: { createdAt?: number; nextAttemptAt?: string | null } = {},
) {
  const blob: BlobRow = {
    id: blobId,
    company_id: COMPANY,
    kind: "signature",
    mime: "image/png",
    bytes: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }),
    sha256: "c".repeat(64),
  };
  await db.blobs.put(blob);
  const row: OutboxRow = {
    id: uuid(),
    company_id: COMPANY,
    kind: "blob",
    ref_id: blobId,
    status: "pending",
    attempts: 0,
    next_attempt_at: opts.nextAttemptAt ?? null,
    last_error: null,
    created_at: new Date(opts.createdAt ?? NOW).toISOString(),
  };
  await db.outbox.put(row);
  return { blob, row };
}

type Call = { url: string; init: RequestInit };

const json = (status: number, body: unknown, headers?: Record<string, string>) => () =>
  new Response(JSON.stringify(body), { status, headers });

const okResponse = json(200, { ok: true });

function fetcher(handlers: Array<(call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), init: init ?? {} };
    calls.push(call);
    const handler = handlers[Math.min(calls.length - 1, handlers.length - 1)] ?? okResponse;
    return handler(call);
  }) as typeof fetch;
  return { calls, impl };
}

const run = (fetchImpl: typeof fetch, options: { ignoreBackoff?: boolean } = {}) =>
  runSync({ db, fetchImpl, now: () => NOW, random: () => 0, assumeOnline: true, ...options });

const header = (call: Call, name: string) => new Headers(call.init.headers as HeadersInit).get(name);

describe("runSync: ordering and blobs", () => {
  it("sends blobs before the record, then drops draft, blob bytes and outbox rows", async () => {
    const sigId = uuid();
    const { draft, row } = await addRecord({ signatureIds: [sigId], createdAt: NOW });
    const { blob } = await addBlob(sigId, { createdAt: NOW - 1_000 });
    const { calls, impl } = fetcher([okResponse, okResponse]);

    const result = await run(impl);

    expect(calls.map((call) => call.url)).toEqual(["/api/sync/blobs", "/api/sync/records"]);
    expect(header(calls[0]!, "X-Blob-Id")).toBe(sigId);
    expect(header(calls[0]!, "X-Blob-Kind")).toBe("signature");
    expect(header(calls[0]!, "X-Blob-Sha256")).toBe("c".repeat(64));
    expect(header(calls[1]!, "Content-Type")).toBe("application/json");
    expect(result).toMatchObject({ sent: 1, conflicts: 0, retried: 0, kept: 0, nextAttemptAt: null });
    expect(await db.outbox.get(row.id)).toBeUndefined();
    expect(await db.drafts.get(draft.id)).toBeUndefined();
    expect(await db.blobs.get(blob.id)).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
  });

  it("holds the record while one of its blobs is still queued", async () => {
    const sigId = uuid();
    const { row } = await addRecord({ signatureIds: [sigId], createdAt: NOW });
    await addBlob(sigId, {
      createdAt: NOW - 1_000,
      nextAttemptAt: new Date(NOW + 60_000).toISOString(), // still in backoff
    });
    const { calls, impl } = fetcher([okResponse, okResponse]);

    const first = await run(impl);

    expect(calls).toHaveLength(0);
    expect(first.sent).toBe(0);
    expect((await db.outbox.get(row.id))?.status).toBe("pending");

    // online/visibility triggers ignore backoff: the blob and then the record go out in one run.
    const second = await run(impl, { ignoreBackoff: true });
    expect(calls.map((call) => call.url)).toEqual(["/api/sync/blobs", "/api/sync/records"]);
    expect(second.sent).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it("keeps the record when a referenced blob was rejected", async () => {
    const sigId = uuid();
    const { draft, row } = await addRecord({ signatureIds: [sigId], createdAt: NOW });
    const { row: blobRow } = await addBlob(sigId, { createdAt: NOW - 1_000 });
    await db.outbox.update(blobRow.id, { status: "kept", last_error: "blob_rejected" });
    const { calls, impl } = fetcher([okResponse]);

    const result = await run(impl);

    expect(calls).toHaveLength(0);
    expect(result.kept).toBe(1);
    const kept = await db.outbox.get(row.id);
    expect(kept?.status).toBe("kept");
    expect(kept?.last_error).toBe("blob_rejected");
    expect(await db.drafts.get(draft.id)).toBeDefined();
  });
});

describe("runSync: terminal outcomes", () => {
  it("keeps a terminal item and never retries it", async () => {
    const { row } = await addRecord();
    const { calls, impl } = fetcher([json(422, { error: "invalid" })]);

    const first = await run(impl);

    expect(calls).toHaveLength(1);
    expect(first).toMatchObject({ sent: 0, retried: 0, kept: 1, nextAttemptAt: null });
    const kept = await db.outbox.get(row.id);
    expect(kept).toMatchObject({ status: "kept", last_error: "invalid", attempts: 0 });
    expect(kept?.next_attempt_at).toBeNull();

    const second = await run(impl, { ignoreBackoff: true });
    expect(calls).toHaveLength(1);
    expect(second.kept).toBe(0);
    expect((await db.outbox.get(row.id))?.status).toBe("kept");
  });

  it.each([
    [403, "read_only"],
    [403, "forbidden"],
    [409, "wrong_company"],
    [409, "id_conflict"],
    [422, "blob_rejected"],
    [409, "blob_conflict"],
  ] as const)("%i %s keeps the row", async (status, error) => {
    const { row } = await addRecord();
    const { impl } = fetcher([json(status, { error })]);

    await run(impl);

    expect(await db.outbox.get(row.id)).toMatchObject({ status: "kept", last_error: error });
  });

  it("counts a conflict copy as sent and still deletes the local draft", async () => {
    const { draft, row } = await addRecord();
    const { impl } = fetcher([json(200, { ok: true, conflict: true })]);

    const result = await run(impl);

    expect(result).toMatchObject({ sent: 1, conflicts: 1 });
    expect(await db.outbox.get(row.id)).toBeUndefined();
    expect(await db.drafts.get(draft.id)).toBeUndefined();
  });
});

describe("runSync: retryable outcomes", () => {
  it("marks a 5xx failed with attempts+1 and the next backoff time", async () => {
    const { draft, row } = await addRecord();
    const { impl } = fetcher([json(500, { error: "boom" })]);

    const result = await run(impl);

    const expected = new Date(NOW + 2_500).toISOString(); // attempts 1, random 0 → half of 5 s
    expect(result).toMatchObject({ sent: 0, retried: 1, kept: 0, nextAttemptAt: expected });
    expect(await db.outbox.get(row.id)).toMatchObject({
      status: "failed",
      attempts: 1,
      last_error: "server_error",
      next_attempt_at: expected,
    });
    // Nothing is dropped before the server confirms.
    expect(await db.drafts.get(draft.id)).toBeDefined();
  });

  it("respects Retry-After on 429", async () => {
    const { row } = await addRecord();
    const { impl } = fetcher([json(429, { error: "rate_limited" }, { "Retry-After": "30" })]);

    await run(impl);

    expect(await db.outbox.get(row.id)).toMatchObject({
      status: "failed",
      last_error: "rate_limited",
      next_attempt_at: new Date(NOW + 30_000).toISOString(),
    });
  });

  it("continues with the other items after an ordinary retry", async () => {
    await addRecord({ createdAt: NOW });
    await addRecord({ createdAt: NOW + 1 });
    const { calls, impl } = fetcher([json(500, { error: "boom" })]);

    const result = await run(impl);

    expect(calls).toHaveLength(2);
    expect(result.retried).toBe(2);
    expect((await db.outbox.toArray()).every((row) => row.status === "failed")).toBe(true);
  });

  it("halts on a network error without touching the rest", async () => {
    const first = await addRecord({ createdAt: NOW });
    const second = await addRecord({ createdAt: NOW + 1 });
    const { calls, impl } = fetcher([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);

    const result = await run(impl);

    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ retried: 1 });
    expect(await db.outbox.get(first.row.id)).toMatchObject({
      status: "failed",
      last_error: "network",
    });
    expect(await db.outbox.get(second.row.id)).toMatchObject({ status: "pending", attempts: 0 });
    expect(result.nextAttemptAt).toBe(new Date(NOW + 2_500).toISOString());
  });

  it("halts on 401", async () => {
    const first = await addRecord({ createdAt: NOW });
    const second = await addRecord({ createdAt: NOW + 1 });
    const { calls, impl } = fetcher([json(401, { error: "unauthorized" })]);

    await run(impl);

    expect(calls).toHaveLength(1);
    expect(await db.outbox.get(first.row.id)).toMatchObject({
      status: "failed",
      last_error: "unauthorized",
    });
    expect(await db.outbox.get(second.row.id)).toMatchObject({ status: "pending" });
  });

  it("halts on 429", async () => {
    const first = await addRecord({ createdAt: NOW });
    const second = await addRecord({ createdAt: NOW + 1 });
    const { calls, impl } = fetcher([json(429, {})]);

    await run(impl);

    expect(calls).toHaveLength(1);
    expect((await db.outbox.get(first.row.id))?.status).toBe("failed");
    expect((await db.outbox.get(second.row.id))?.status).toBe("pending");
  });
});

describe("runSync: crash recovery and deletion", () => {
  it("resets stale sending rows to pending at run start and processes them", async () => {
    const { draft, row } = await addRecord({ status: "sending" });
    const { calls, impl } = fetcher([okResponse]);

    const result = await run(impl);

    expect(calls).toHaveLength(1);
    expect(result.sent).toBe(1);
    expect(await db.outbox.get(row.id)).toBeUndefined();
    expect(await db.drafts.get(draft.id)).toBeUndefined();
  });

  it("deletes nothing until the record is confirmed", async () => {
    const sigId = uuid();
    const { draft, row } = await addRecord({ signatureIds: [sigId], createdAt: NOW });
    const { blob } = await addBlob(sigId, { createdAt: NOW - 1_000 });
    // Blob upload fails; the record is held, so nothing may be deleted.
    const failing = fetcher([json(500, { error: "boom" })]);
    await run(failing.impl);

    expect(failing.calls).toHaveLength(1);
    expect(await db.drafts.get(draft.id)).toBeDefined();
    expect(await db.blobs.get(blob.id)).toBeDefined();
    expect((await db.outbox.get(row.id))?.status).toBe("pending");

    // When the connection works again the blob and then the record succeed, and only then the
    // draft and blob bytes go away.
    const succeeding = fetcher([okResponse, okResponse]);
    const result = await run(succeeding.impl, { ignoreBackoff: true });
    expect(result.sent).toBe(1);
    expect(await db.drafts.get(draft.id)).toBeUndefined();
    expect(await db.blobs.get(blob.id)).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
  });
});
