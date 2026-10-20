import { z } from "zod";

// Wire format of POST /api/sync/records. Shared by the device (builds it) and the server (parses it).
// The server never trusts storage paths or hashes from here: paths are built from ids, the
// submission hash is computed server-side, a signature's content hash is recomputed and compared.

export const MAX_SIGNATURE_BYTES = 200 * 1024;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ATTACHMENT_EXT: Record<(typeof ATTACHMENT_MIMES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const uuid = z.uuid();
const iso = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const participantSchema = z.strictObject({
  persona_id: uuid,
  role: z.enum(["attendee", "signer", "responsible"]),
});

export const signatureSchema = z.strictObject({
  id: uuid,
  persona_id: uuid,
  signed_at: iso,
  geo_lat: lat.nullish(),
  geo_lng: lng.nullish(),
  geo_accuracy: z.number().min(0).nullish(),
  content_hash: hash,
});

export const attachmentSchema = z.strictObject({
  id: uuid,
  mime: z.enum(ATTACHMENT_MIMES),
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  taken_at: iso,
  geo_lat: lat.nullish(),
  geo_lng: lng.nullish(),
});

export const recordEnvelopeSchema = z.strictObject({
  company_id: uuid,
  id: uuid,
  record_type_id: uuid,
  schema_version: z.number().int().min(1),
  extension_version: z.number().int().min(1).nullish(),
  occurred_at: iso,
  crew_id: uuid,
  location_id: uuid,
  task_type_id: uuid.nullish(),
  payload: z.record(z.string(), z.unknown()),
  geo_lat: lat.nullish(),
  geo_lng: lng.nullish(),
  geo_accuracy: z.number().min(0).nullish(),
  device_id: z.string().trim().min(1).max(200),
  client_created_at: iso,
  amends_record_id: uuid.nullish(),
  participants: z.array(participantSchema).max(200),
  signatures: z.array(signatureSchema).max(200),
  attachments: z.array(attachmentSchema).max(50),
});

export type RecordEnvelope = z.infer<typeof recordEnvelopeSchema>;
export type EnvelopeSignature = z.infer<typeof signatureSchema>;
export type EnvelopeAttachment = z.infer<typeof attachmentSchema>;

/** Largest request body the records endpoint reads (payload ≤ 256 KB plus the rest of the envelope). */
export const MAX_RECORD_BODY_BYTES = 600 * 1024;
