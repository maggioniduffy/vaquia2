// Canonical JSON + sha256, shared by the device and the server (Web Crypto exists in both).
// The server recomputes `submission_hash` and each signature's `content_hash` from the same
// functions, so a device and the server can never disagree on how an envelope is serialized.

import type { RecordEnvelope } from "./envelope";

/** JSON with object keys sorted recursively and `undefined` dropped; arrays keep their order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortKeys(v)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return toHex(await globalThis.crypto.subtle.digest("SHA-256", data));
}

/** What a signature signs: everything about the record except signatures and attachments. */
export type SignableEnvelope = Omit<RecordEnvelope, "signatures" | "attachments"> &
  Partial<Pick<RecordEnvelope, "signatures" | "attachments">>;

function core(e: SignableEnvelope) {
  return {
    id: e.id,
    company_id: e.company_id,
    record_type_id: e.record_type_id,
    schema_version: e.schema_version,
    extension_version: e.extension_version ?? null,
    occurred_at: new Date(e.occurred_at).toISOString(),
    crew_id: e.crew_id,
    location_id: e.location_id,
    task_type_id: e.task_type_id ?? null,
    geo_lat: e.geo_lat ?? null,
    geo_lng: e.geo_lng ?? null,
    geo_accuracy: e.geo_accuracy ?? null,
    device_id: e.device_id,
    client_created_at: new Date(e.client_created_at).toISOString(),
    amends_record_id: e.amends_record_id ?? null,
    payload: e.payload,
    participants: [...e.participants]
      .map((p) => ({ persona_id: p.persona_id, role: p.role }))
      .sort((a, b) => (a.persona_id + a.role).localeCompare(b.persona_id + b.role)),
  };
}

/** sha256 of the canonical envelope without signatures (spec/data-model.md#Rules, Hashes). */
export function computeContentHash(envelope: SignableEnvelope): Promise<string> {
  return sha256Hex(canonicalJson(core(envelope)));
}

/** sha256 of the canonical envelope including signature ids and content hashes. */
export function computeSubmissionHash(envelope: RecordEnvelope): Promise<string> {
  const signatures = [...envelope.signatures]
    .map((s) => ({ id: s.id, persona_id: s.persona_id, content_hash: s.content_hash }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return sha256Hex(canonicalJson({ ...core(envelope), signatures }));
}
