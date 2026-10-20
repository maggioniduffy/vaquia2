import { getDb, type OutboxRow, type RecordSubmission, type VaquiaDb } from "@/lib/offline/db";
import { notifyEnqueued } from "./trigger";
import { uuidv7 } from "./uuid";

// Device-side outbox. A record and its blobs are enqueued in ONE Dexie transaction, blobs first
// (created_at order is the send order), so a crash never leaves a record without its blobs.

export type EnqueueResult = { recordOutboxId: string; blobOutboxIds: string[]; created: boolean };

/**
 * Freezes `draftId` with its `submission` and queues its blobs then the record.
 * Idempotent: enqueueing a draft that already has an outbox row returns that row.
 * Throws when the draft or one of the referenced blobs is not on the device.
 */
export async function enqueueRecord(
  input: { draftId: string; submission: RecordSubmission; now?: () => number },
  db: VaquiaDb = getDb(),
): Promise<EnqueueResult> {
  const now = input.now ?? Date.now;
  const result = await db.transaction("rw", db.drafts, db.blobs, db.outbox, async () => {
    const draft = await db.drafts.get(input.draftId);
    if (!draft) throw new Error(`draft ${input.draftId} not found`);

    const existing = await db.outbox
      .where("ref_id")
      .equals(draft.id)
      .filter((r) => r.kind === "record")
      .first();
    if (existing) {
      return { recordOutboxId: existing.id, blobOutboxIds: [], created: false };
    }

    const blobIds = [
      ...input.submission.signatures.map((s) => s.id),
      ...input.submission.attachments.map((a) => a.id),
    ];
    const blobs = await db.blobs.bulkGet(blobIds);
    blobs.forEach((blob, i) => {
      if (!blob || blob.company_id !== draft.company_id)
        throw new Error(`blob ${blobIds[i]} not found for company ${draft.company_id}`);
    });

    await db.drafts.put({ ...draft, submission: input.submission, updated_at: new Date(now()).toISOString() });

    const base = now();
    let tick = 0;
    const row = (kind: OutboxRow["kind"], refId: string): OutboxRow => ({
      id: uuidv7(base + tick),
      company_id: draft.company_id,
      kind,
      ref_id: refId,
      status: "pending",
      attempts: 0,
      next_attempt_at: null,
      last_error: null,
      created_at: new Date(base + tick++).toISOString(),
    });

    const blobRows: OutboxRow[] = [];
    for (const blob of blobs) {
      if (!blob) continue;
      if (blob.kind === "photo" && blob.record_id !== draft.id)
        await db.blobs.put({ ...blob, record_id: draft.id });
      const already = await db.outbox
        .where("ref_id")
        .equals(blob.id)
        .filter((r) => r.kind === "blob")
        .first();
      if (!already) blobRows.push(row("blob", blob.id));
    }
    const recordRow = row("record", draft.id);
    await db.outbox.bulkAdd([...blobRows, recordRow]);
    return { recordOutboxId: recordRow.id, blobOutboxIds: blobRows.map((r) => r.id), created: true };
  });
  if (result.created) notifyEnqueued();
  return result;
}

export type OutboxCounts = {
  /** Waiting to be sent, or failed and scheduled for retry. */
  pending: number;
  syncing: number;
  /** Terminal-but-kept items that need a person (read_only, forbidden, ...). */
  error: number;
};

export function countOutbox(rows: Pick<OutboxRow, "status" | "kind">[]): OutboxCounts {
  const counts: OutboxCounts = { pending: 0, syncing: 0, error: 0 };
  // Blobs are an implementation detail of a record: the user counts records.
  for (const row of rows) {
    if (row.kind !== "record") continue;
    if (row.status === "kept") counts.error++;
    else if (row.status === "sending") counts.syncing++;
    else counts.pending++;
  }
  return counts;
}

/** True when the device still holds something the server has not confirmed (kept items included). */
export async function hasUnsynced(db: VaquiaDb = getDb(), companyId?: string): Promise<boolean> {
  const rows = companyId
    ? await db.outbox.where("company_id").equals(companyId).count()
    : await db.outbox.count();
  return rows > 0;
}

export type SignOutCleanup = {
  clearedCompanies: string[];
  keptCompanies: string[];
  cacheCleared: boolean;
};

/**
 * Sign-out cleanup (spec/data-model.md#Sync endpoints). A company's drafts, blobs and cached
 * reference data are removed only when its outbox is empty; otherwise everything of that company
 * stays so nothing unsynced is ever lost. The `field-pages` cache is not per company: it is
 * cleared only when the whole outbox is empty.
 */
export async function cleanupOnSignOut(
  companyIds: string[],
  db: VaquiaDb = getDb(),
  cacheStorage: Pick<CacheStorage, "delete"> | undefined = typeof caches === "undefined" ? undefined : caches,
): Promise<SignOutCleanup> {
  const result: SignOutCleanup = { clearedCompanies: [], keptCompanies: [], cacheCleared: false };
  for (const companyId of companyIds) {
    if (await hasUnsynced(db, companyId)) {
      result.keptCompanies.push(companyId);
      continue;
    }
    await db.transaction("rw", db.drafts, db.blobs, db.reference, async () => {
      await db.drafts.where("company_id").equals(companyId).delete();
      await db.blobs.where("company_id").equals(companyId).delete();
      await db.reference.where("company_id").equals(companyId).delete();
    });
    result.clearedCompanies.push(companyId);
  }
  if (cacheStorage && !(await hasUnsynced(db))) {
    result.cacheCleared = await cacheStorage.delete("field-pages");
  }
  return result;
}
