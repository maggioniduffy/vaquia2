import { getDb, type BlobRow, type OutboxRow, type VaquiaDb } from "@/lib/offline/db";
import { backoffDelayMs } from "./backoff";
import type { RecordEnvelope } from "./envelope";
import { classifyResponse, type SyncOutcome, type TerminalCode } from "./outcome";

// Sync runner: walks the outbox in created_at order (blobs were enqueued before their record) and
// sends each due item. A record is sent only after every blob it references is on the server.
// Runs on the page (startup / visibilitychange / online / timer) and in the service worker
// (Background Sync); both go through runSync().

export type RunOptions = {
  db?: VaquiaDb;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  /** Retry items still in backoff (used when the connection just came back). */
  ignoreBackoff?: boolean;
  /** Skip the navigator.onLine shortcut (tests, SW). */
  assumeOnline?: boolean;
};

export type RunResult = {
  skipped?: "offline" | "locked";
  sent: number;
  /** Records the server accepted but stored as a conflict copy for HSE. */
  conflicts: number;
  retried: number;
  kept: number;
  /** Earliest ISO time an item becomes due again; null when nothing is scheduled. */
  nextAttemptAt: string | null;
};

const LOCK_NAME = "vaquia-sync";
let inflight: Promise<RunResult> | undefined;

const empty = (extra: Partial<RunResult> = {}): RunResult => ({
  sent: 0,
  conflicts: 0,
  retried: 0,
  kept: 0,
  nextAttemptAt: null,
  ...extra,
});

/** One run at a time per tab (in-memory) and per browser (Web Locks, when available). */
export function runSync(options: RunOptions = {}): Promise<RunResult> {
  if (inflight) return inflight;
  const run = async (): Promise<RunResult> => {
    if (typeof navigator !== "undefined" && "locks" in navigator) {
      const result = await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) =>
        lock ? drain(options) : empty({ skipped: "locked" }),
      );
      return result;
    }
    return drain(options);
  };
  inflight = run().finally(() => {
    inflight = undefined;
  });
  return inflight;
}

async function drain(options: RunOptions): Promise<RunResult> {
  if (!options.assumeOnline && typeof navigator !== "undefined" && navigator.onLine === false) {
    return empty({ skipped: "offline" });
  }
  const db = options.db ?? getDb();
  const ctx: Ctx = {
    db,
    fetchImpl: options.fetchImpl ?? ((...args) => fetch(...args)),
    now: options.now ?? Date.now,
    random: options.random ?? Math.random,
    result: empty(),
  };

  // We hold the lock, so a "sending" row is left over from a crashed run.
  await db.outbox.where("status").equals("sending").modify({ status: "pending" });

  const rows = (await db.outbox.where("status").anyOf("pending", "failed").toArray()).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  let halted = false;
  for (const row of rows) {
    if (halted) break;
    if (!options.ignoreBackoff && row.next_attempt_at && Date.parse(row.next_attempt_at) > ctx.now())
      continue;
    const outcome = row.kind === "blob" ? await sendBlobItem(ctx, row) : await sendRecordItem(ctx, row);
    if (outcome === "halt") halted = true;
  }

  const left = await db.outbox.where("status").equals("failed").toArray();
  const times = left.map((r) => r.next_attempt_at).filter((t): t is string => !!t).sort();
  ctx.result.nextAttemptAt = times[0] ?? null;
  return ctx.result;
}

type Ctx = {
  db: VaquiaDb;
  fetchImpl: typeof fetch;
  now: () => number;
  random: () => number;
  result: RunResult;
};

/** "halt" = connection-level problem: stop the run, the rest would fail the same way. */
type Step = "continue" | "halt";

async function sendBlobItem(ctx: Ctx, row: OutboxRow): Promise<Step> {
  const blob = await ctx.db.blobs.get(row.ref_id);
  if (!blob) return keep(ctx, row, "blob_rejected");
  await ctx.db.outbox.update(row.id, { status: "sending" });
  const outcome = await post(ctx, "/api/sync/blobs", blobRequest(row, blob));
  if (outcome.kind === "ok") {
    // The bytes stay in Dexie until the record is confirmed; only the outbox row is done.
    await ctx.db.outbox.delete(row.id);
    return "continue";
  }
  return settle(ctx, row, outcome);
}

function blobRequest(row: OutboxRow, blob: BlobRow): RequestInit {
  const headers: Record<string, string> = {
    "Content-Type": blob.mime,
    "X-Company-Id": row.company_id,
    "X-Blob-Id": blob.id,
    "X-Blob-Kind": blob.kind,
    "X-Blob-Sha256": blob.sha256,
  };
  if (blob.record_id) headers["X-Record-Id"] = blob.record_id;
  return { method: "POST", headers, body: blob.bytes };
}

async function sendRecordItem(ctx: Ctx, row: OutboxRow): Promise<Step> {
  const draft = await ctx.db.drafts.get(row.ref_id);
  if (!draft?.submission) return keep(ctx, row, "invalid");
  const { submission } = draft;
  const blobIds = [...submission.signatures.map((s) => s.id), ...submission.attachments.map((a) => a.id)];

  // Blobs first: wait while any of them is still queued; a rejected blob blocks the record.
  const queued = await ctx.db.outbox.where("ref_id").anyOf(blobIds).filter((r) => r.kind === "blob").toArray();
  if (queued.some((r) => r.status === "kept")) return keep(ctx, row, "blob_rejected");
  if (queued.length > 0) return "continue";

  const envelope: RecordEnvelope = {
    ...submission,
    company_id: draft.company_id,
    id: draft.id,
    schema_version: draft.schema_version,
    extension_version: draft.extension_version ?? null,
    payload: draft.payload,
  };
  await ctx.db.outbox.update(row.id, { status: "sending" });
  const outcome = await post(ctx, "/api/sync/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });
  if (outcome.kind === "ok") {
    // Only now is local data safe to drop (architecture.md: never delete before the server confirms).
    await ctx.db.transaction("rw", ctx.db.drafts, ctx.db.blobs, ctx.db.outbox, async () => {
      await ctx.db.blobs.bulkDelete(blobIds);
      await ctx.db.drafts.delete(draft.id);
      await ctx.db.outbox.delete(row.id);
    });
  }
  return settle(ctx, row, outcome);
}

async function post(ctx: Ctx, url: string, init: RequestInit): Promise<SyncOutcome> {
  let response: Response;
  try {
    response = await ctx.fetchImpl(url, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch {
    return { kind: "retry", code: "network" };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON (proxy error page, ...): classified by status alone
  }
  return classifyResponse(response.status, body, response.headers.get("Retry-After"));
}

async function keep(ctx: Ctx, row: OutboxRow, code: TerminalCode): Promise<Step> {
  await ctx.db.outbox.update(row.id, { status: "kept", last_error: code, next_attempt_at: null });
  ctx.result.kept++;
  return "continue";
}

async function settle(ctx: Ctx, row: OutboxRow, outcome: SyncOutcome): Promise<Step> {
  if (outcome.kind === "ok") {
    if (row.kind === "record") {
      ctx.result.sent++;
      if (outcome.conflict) ctx.result.conflicts++;
    }
    return "continue";
  }
  if (outcome.kind === "terminal") return keep(ctx, row, outcome.code);

  const attempts = row.attempts + 1;
  const delay = Math.max(backoffDelayMs(attempts, ctx.random), outcome.retryAfterMs ?? 0);
  await ctx.db.outbox.update(row.id, {
    status: "failed",
    attempts,
    last_error: outcome.code,
    next_attempt_at: new Date(ctx.now() + delay).toISOString(),
  });
  ctx.result.retried++;
  return outcome.code === "network" || outcome.code === "unauthorized" || outcome.code === "rate_limited"
    ? "halt"
    : "continue";
}
