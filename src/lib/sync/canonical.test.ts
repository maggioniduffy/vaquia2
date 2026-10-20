// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canonicalJson, computeContentHash, computeSubmissionHash, sha256Hex } from "./canonical";
import type { RecordEnvelope } from "./envelope";

// Phase 2.4 — device and server must agree on the canonical envelope, so key order and participant
// order must never change a hash (spec/data-model.md#Rules, Hashes).

const COMPANY = "aaaaaaaa-0000-7000-8000-00000000000a";
const RECORD = "dddd0000-0000-7000-8000-000000000001";
const CREW = "dddd0000-0000-7000-8000-000000000002";
const LOCATION = "dddd0000-0000-7000-8000-000000000003";
const PERSONA_1 = "dddd0000-0000-7000-8000-000000000011";
const PERSONA_2 = "dddd0000-0000-7000-8000-000000000012";
const SIGNATURE_1 = "dddd0000-0000-7000-8000-000000000021";
const SIGNATURE_2 = "dddd0000-0000-7000-8000-000000000022";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function base() {
  return {
    id: RECORD,
    company_id: COMPANY,
    record_type_id: "90000000-0000-7000-8000-000000000501",
    schema_version: 1,
    extension_version: null,
    occurred_at: "2026-10-19T10:00:00Z",
    crew_id: CREW,
    location_id: LOCATION,
    task_type_id: null,
    geo_lat: null,
    geo_lng: null,
    geo_accuracy: null,
    device_id: "device-1",
    client_created_at: "2026-10-19T10:00:00Z",
    amends_record_id: null,
    payload: { topic: "Charla", notes: { weather: "windy", ppe: ["helmet", "gloves"] } },
    participants: [
      { persona_id: PERSONA_1, role: "attendee" as const },
      { persona_id: PERSONA_2, role: "signer" as const },
    ],
  };
}

function envelope(signatures: RecordEnvelope["signatures"]): RecordEnvelope {
  return { ...base(), signatures, attachments: [] };
}

const signature = (id: string, persona_id: string, content_hash: string) => ({
  id,
  persona_id,
  signed_at: "2026-10-19T10:05:00Z",
  geo_lat: null,
  geo_lng: null,
  geo_accuracy: null,
  content_hash,
});

describe("canonicalJson", () => {
  it("sorts object keys recursively and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(canonicalJson([2, 1, 3])).toBe("[2,1,3]");
  });

  it("drops undefined object values and writes null inside arrays", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson([1, undefined])).toBe("[1,null]");
  });
});

describe("sha256Hex", () => {
  it("matches the known SHA-256 of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("computeContentHash", () => {
  it("ignores object key order, top-level and nested", async () => {
    const a = base();
    const b = {
      participants: [...a.participants].reverse(),
      payload: { notes: { ppe: ["helmet", "gloves"], weather: "windy" }, topic: "Charla" },
      amends_record_id: null,
      client_created_at: a.client_created_at,
      device_id: a.device_id,
      geo_accuracy: null,
      geo_lng: null,
      geo_lat: null,
      task_type_id: null,
      location_id: a.location_id,
      crew_id: a.crew_id,
      occurred_at: a.occurred_at,
      extension_version: null,
      schema_version: 1,
      record_type_id: a.record_type_id,
      company_id: a.company_id,
      id: a.id,
    };
    expect(await computeContentHash(b)).toBe(await computeContentHash(a));
  });

  it("ignores signatures and attachments (what a signature does not cover)", async () => {
    const signed = envelope([signature(SIGNATURE_1, PERSONA_1, HASH_A)]);
    const bare = base();
    expect(await computeContentHash(signed)).toBe(await computeContentHash(bare));
  });

  it("changes when the signed content changes", async () => {
    const a = base();
    const b = { ...a, payload: { ...a.payload, topic: "Otro tema" } };
    const c = { ...a, occurred_at: "2026-10-19T11:00:00Z" };
    expect(await computeContentHash(b)).not.toBe(await computeContentHash(a));
    expect(await computeContentHash(c)).not.toBe(await computeContentHash(a));
  });
});

describe("computeSubmissionHash", () => {
  it("ignores signature order but covers ids and content hashes", async () => {
    const one = signature(SIGNATURE_1, PERSONA_1, HASH_A);
    const two = signature(SIGNATURE_2, PERSONA_2, HASH_B);
    const forward = await computeSubmissionHash(envelope([one, two]));
    const reversed = await computeSubmissionHash(envelope([two, one]));
    expect(reversed).toBe(forward);
    expect(await computeSubmissionHash(envelope([one]))).not.toBe(forward);
  });

  it("changes with the payload and with a signature's content hash", async () => {
    const one = signature(SIGNATURE_1, PERSONA_1, HASH_A);
    const original = envelope([one]);
    const otherPayload = { ...original, payload: { ...original.payload, topic: "Otro tema" } };
    const otherHash = envelope([signature(SIGNATURE_1, PERSONA_1, HASH_B)]);
    const originalHash = await computeSubmissionHash(original);
    expect(await computeSubmissionHash(otherPayload)).not.toBe(originalHash);
    expect(await computeSubmissionHash(otherHash)).not.toBe(originalHash);
  });
});
