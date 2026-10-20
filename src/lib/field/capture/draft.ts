"use client";
import { useLiveQuery } from "dexie-react-hooks";
import type { Payload } from "@/forms/compile";
import { defaultValues } from "@/forms/render";
import { getDb, type DraftRow, type VaquiaDb } from "@/lib/offline/db";
import { sha256Blob } from "./png";
import { uuidv7 } from "@/lib/sync/uuid";
import { findField } from "./derive";
import type { CapturedGeo } from "./geo";
import type { PinnedSchemas } from "./schema";

// Local capture state. A draft is a normal DraftRow (so the sync engine can enqueue it) plus a
// `capture` bag with what is not part of the payload: timestamps, geo and the signatures taken.

export type CapturedSignature = { id: string; signed_at: string };

export type CaptureMeta = {
  /** Frozen at creation: when the record happened / was started on the device. */
  occurred_at: string;
  client_created_at: string;
  geo: CapturedGeo | null;
  geo_state: "pending" | "ok" | "unavailable";
  /** persona_id -> signature (blob id = signature id). Cleared whenever content changes. */
  signatures: Record<string, CapturedSignature>;
};

export type CaptureDraft = DraftRow & { capture?: CaptureMeta };

export const emptyMeta = (now: Date): CaptureMeta => ({
  occurred_at: now.toISOString(),
  client_created_at: now.toISOString(),
  geo: null,
  geo_state: "pending",
  signatures: {},
});

export async function createDraft(
  input: { companyId: string; recordTypeCode: string; pinned: PinnedSchemas; now?: Date },
  db: VaquiaDb = getDb(),
): Promise<CaptureDraft> {
  const now = input.now ?? new Date();
  const draft: CaptureDraft = {
    id: uuidv7(now.getTime()),
    company_id: input.companyId,
    record_type: input.recordTypeCode,
    schema_version: input.pinned.baseRow.version,
    extension_version: input.pinned.extensionRow?.version,
    payload: defaultValues(input.pinned.sections, now),
    updated_at: now.toISOString(),
    capture: emptyMeta(now),
  };
  await db.drafts.put(draft);
  return draft;
}

export async function getDraft(id: string, db: VaquiaDb = getDb()): Promise<CaptureDraft | undefined> {
  return db.drafts.get(id);
}

/** Drafts of a company that were never submitted, newest first. */
export function useOpenDrafts(companyId: string | null | undefined): CaptureDraft[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [];
    const rows = await getDb().drafts.where("company_id").equals(companyId).toArray();
    return rows
      .filter((d) => !d.submission)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [companyId]);
}

async function patch(
  db: VaquiaDb,
  id: string,
  change: (d: CaptureDraft) => Partial<CaptureDraft>,
): Promise<void> {
  await db.transaction("rw", db.drafts, async () => {
    const d = (await db.drafts.get(id)) as CaptureDraft | undefined;
    if (!d || d.submission) return; // submitted drafts are frozen
    await db.drafts.put({ ...d, ...change(d), updated_at: new Date().toISOString() } as DraftRow);
  });
}

export function savePayload(id: string, payload: Payload, db: VaquiaDb = getDb()): Promise<void> {
  return patch(db, id, () => ({ payload }));
}

/** Geo is best-effort and only applied while nobody has signed (signatures cover the geo). */
export function applyGeo(
  id: string,
  sections: PinnedSchemas["sections"],
  geo: CapturedGeo | null,
  db: VaquiaDb = getDb(),
): Promise<void> {
  return patch(db, id, (d) => {
    const meta = d.capture ?? emptyMeta(new Date());
    if (Object.keys(meta.signatures).length > 0) return {};
    const geoField = findField(sections, "geo");
    return {
      capture: { ...meta, geo, geo_state: geo ? "ok" : "unavailable" },
      payload: geoField
        ? geo
          ? { ...d.payload, [geoField.key]: geo }
          : Object.fromEntries(Object.entries(d.payload).filter(([k]) => k !== geoField.key))
        : d.payload,
    };
  });
}

/** Stores the PNG as a blob (before any enqueue) and records it for the persona. */
export async function saveSignature(
  input: { draftId: string; personaId: string; png: Blob; now?: Date },
  db: VaquiaDb = getDb(),
): Promise<CapturedSignature> {
  const signed_at = (input.now ?? new Date()).toISOString();
  const sha256 = await sha256Blob(input.png);
  return db.transaction("rw", db.drafts, db.blobs, async () => {
    const draft = (await db.drafts.get(input.draftId)) as CaptureDraft | undefined;
    if (!draft || draft.submission) throw new Error("draft is not editable");
    const meta = draft.capture ?? emptyMeta(new Date());
    const previous = meta.signatures[input.personaId];
    if (previous) await db.blobs.delete(previous.id);
    const sig: CapturedSignature = { id: uuidv7(), signed_at };
    await db.blobs.put({
      id: sig.id,
      company_id: draft.company_id,
      kind: "signature",
      mime: "image/png",
      bytes: input.png,
      sha256,
    });
    await db.drafts.put({
      ...draft,
      capture: { ...meta, signatures: { ...meta.signatures, [input.personaId]: sig } },
      updated_at: signed_at,
    } as DraftRow);
    return sig;
  });
}

/** Removes every signature (blobs included): content changed after signing. */
export async function clearSignatures(id: string, db: VaquiaDb = getDb()): Promise<void> {
  await db.transaction("rw", db.drafts, db.blobs, async () => {
    const draft = (await db.drafts.get(id)) as CaptureDraft | undefined;
    if (!draft || draft.submission || !draft.capture) return;
    const ids = Object.values(draft.capture.signatures).map((s) => s.id);
    if (ids.length === 0) return;
    await db.blobs.bulkDelete(ids);
    await db.drafts.put({
      ...draft,
      capture: { ...draft.capture, signatures: {} },
      updated_at: new Date().toISOString(),
    } as DraftRow);
  });
}

/** Deletes a never-submitted draft with its signature blobs. */
export async function discardDraft(id: string, db: VaquiaDb = getDb()): Promise<void> {
  await db.transaction("rw", db.drafts, db.blobs, async () => {
    const draft = (await db.drafts.get(id)) as CaptureDraft | undefined;
    if (!draft || draft.submission) return;
    await db.blobs.bulkDelete(Object.values(draft.capture?.signatures ?? {}).map((s) => s.id));
    await db.drafts.delete(id);
  });
}
