import { compileForm, type Payload } from "@/forms/compile";
import type { FormErrors } from "@/forms/render";
import { t } from "@/i18n/es-AR";
import { getDb, type RecordSubmission, type VaquiaDb } from "@/lib/offline/db";
import { computeContentHash } from "@/lib/sync/canonical";
import type { EnvelopeSignature } from "@/lib/sync/envelope";
import { enqueueRecord } from "@/lib/sync/outbox";
import { contextOf, participantsOf, signerIds } from "./derive";
import { getDeviceId } from "./device";
import type { CaptureDraft } from "./draft";
import type { PinnedSchemas } from "./schema";

export type SubmitFailure =
  | { reason: "invalid"; errors: FormErrors }
  | { reason: "missing_context" | "missing_signatures" | "frozen" | "no_draft" };
export type SubmitResult = { ok: true } | ({ ok: false } & SubmitFailure);

/** Zod issue paths -> messages by dotted path (matches the renderer's `errors`). */
export function toFormErrors(issues: { path: PropertyKey[]; message: string }[]): FormErrors {
  const out: FormErrors = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".");
    out[key] ??= i.message === "required" ? t.forms.required : t.capture.invalidValue;
  }
  return out;
}

/** Validates with the draft's pinned schemas; `parsed` is the exact payload the server will store. */
export function validateDraft(
  pinned: PinnedSchemas,
  payload: Payload,
): { ok: true; parsed: Payload } | { ok: false; errors: FormErrors } {
  const res = compileForm(pinned.base, pinned.extension).safeParse(payload);
  return res.success ? { ok: true, parsed: res.data } : { ok: false, errors: toFormErrors(res.error.issues) };
}

/**
 * Validates, builds the envelope (content hash per signature), then freezes the draft and queues
 * blobs + record in one transaction (enqueueRecord). Signature PNGs are already in Dexie.
 */
export async function submitDraft(
  draftId: string,
  pinned: PinnedSchemas,
  db: VaquiaDb = getDb(),
): Promise<SubmitResult> {
  const draft = (await db.drafts.get(draftId)) as CaptureDraft | undefined;
  if (!draft) return { ok: false, reason: "no_draft" };
  if (draft.submission) return { ok: false, reason: "frozen" };
  const meta = draft.capture;
  if (!meta) return { ok: false, reason: "no_draft" };

  const valid = validateDraft(pinned, draft.payload);
  if (!valid.ok) return { ok: false, reason: "invalid", errors: valid.errors };
  const { parsed } = valid;

  const ctx = contextOf(pinned.sections, parsed);
  if (!ctx.crew_id || !ctx.location_id) return { ok: false, reason: "missing_context" };

  const signers = signerIds(pinned.sections, parsed);
  if (signers.some((id) => !meta.signatures[id])) return { ok: false, reason: "missing_signatures" };

  const geo = meta.geo;
  const core = {
    company_id: draft.company_id,
    id: draft.id,
    record_type_id: pinned.baseRow.record_type_id,
    schema_version: draft.schema_version,
    extension_version: draft.extension_version ?? null,
    occurred_at: meta.occurred_at,
    crew_id: ctx.crew_id,
    location_id: ctx.location_id,
    task_type_id: ctx.task_type_id ?? null,
    payload: parsed,
    geo_lat: geo?.lat ?? null,
    geo_lng: geo?.lng ?? null,
    geo_accuracy: geo?.accuracy ?? null,
    device_id: getDeviceId(),
    client_created_at: meta.client_created_at,
    amends_record_id: null,
    participants: participantsOf(pinned.sections, parsed),
  };
  const content_hash = await computeContentHash(core);
  const signatures: EnvelopeSignature[] = signers.map((personaId) => {
    const s = meta.signatures[personaId]!;
    return {
      id: s.id,
      persona_id: personaId,
      signed_at: s.signed_at,
      geo_lat: geo?.lat ?? null,
      geo_lng: geo?.lng ?? null,
      geo_accuracy: geo?.accuracy ?? null,
      content_hash,
    };
  });

  const submission: RecordSubmission = {
    record_type_id: core.record_type_id,
    occurred_at: core.occurred_at,
    crew_id: ctx.crew_id,
    location_id: ctx.location_id,
    task_type_id: core.task_type_id,
    geo_lat: core.geo_lat,
    geo_lng: core.geo_lng,
    geo_accuracy: core.geo_accuracy,
    device_id: core.device_id,
    client_created_at: core.client_created_at,
    amends_record_id: null,
    participants: core.participants,
    signatures,
    attachments: [],
  };

  // The runner sends draft.payload as-is: store the validated output the hash was computed on.
  await db.drafts.update(draft.id, { payload: parsed });
  await enqueueRecord({ draftId: draft.id, submission }, db);
  return { ok: true };
}
