// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileForm, type Payload } from "@/forms/compile";
import type { FormSchema } from "@/forms/dsl";
import ats from "@/forms/seeds/ats.v1.json";
import toolboxTalk from "@/forms/seeds/toolbox_talk.v1.json";
import { t } from "@/i18n/es-AR";
import { VaquiaDb } from "@/lib/offline/db";
import { computeContentHash } from "@/lib/sync/canonical";
import type { RecordEnvelope } from "@/lib/sync/envelope";
import type { RefFormSchema } from "@/lib/offline/reference-types";
import type { PinnedSchemas } from "./schema";
import { createDraft, savePayload, saveSignature, type CaptureDraft } from "./draft";
import { submitDraft, validateDraft } from "./submit";

// Phase 2.5/2.6 — submit: validate with the pinned versions, build the envelope, freeze the draft and
// queue blobs then the record. The stored payload is the compiled output the content hash covers.

const COMPANY = "aaaaaaaa-0000-7000-8000-00000000000a";
const NOW = new Date("2026-10-19T10:00:00Z");
const toolbox = toolboxTalk as unknown as FormSchema;
const atsSchema = ats as unknown as FormSchema;

function pinned(schema: FormSchema, code: string): PinnedSchemas {
  const baseRow: RefFormSchema = {
    id: `schema-${code}`,
    record_type_id: `type-${code}`,
    record_type: code,
    company_id: null,
    kind: "base",
    version: 1,
    schema,
    published_at: NOW.toISOString(),
  };
  return { baseRow, base: schema, sections: schema.sections };
}

const toolboxPinned = pinned(toolbox, "toolbox_talk");
const atsPinned = pinned(atsSchema, "ats");

const png = () =>
  new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
    type: "image/png",
  });

const toolboxPayload: Payload = {
  topic: "Uso del arnés de seguridad",
  crew: "c1",
  location: "l1",
  attendees: ["p1", "p2"],
  notes: "Recordatorio",
};

let db: VaquiaDb;

beforeEach(async () => {
  await Dexie.delete("vaquia");
  db = new VaquiaDb();
});

afterEach(async () => {
  await db.delete();
});

async function draftWith(
  schema: PinnedSchemas,
  code: string,
  payload: Payload,
  signers: string[] = [],
) {
  const draft = await createDraft({ companyId: COMPANY, recordTypeCode: code, pinned: schema, now: NOW }, db);
  await savePayload(draft.id, payload, db);
  for (const personaId of signers)
    await saveSignature({ draftId: draft.id, personaId, png: png() }, db);
  return draft;
}

describe("validateDraft", () => {
  it("returns the compiled payload: unknown keys are stripped", () => {
    const result = validateDraft(toolboxPinned, { ...toolboxPayload, injected: "x" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parsed).toEqual(toolboxPayload);
  });

  it("maps a missing required field to the renderer's message", () => {
    const result = validateDraft(toolboxPinned, { ...toolboxPayload, topic: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.topic).toBe(t.forms.required);
  });

  it("maps a bad value at a nested path", () => {
    const payload = {
      ...toolboxPayload,
      attendees: ["p1", 42],
    };
    const result = validateDraft(toolboxPinned, payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["attendees.1"]).toBe(t.capture.invalidValue);
    }
  });

  it("reports dotted paths for groups and their items (ats)", () => {
    const payload = {
      task_type: "tt1",
      steps: [
        { step: "Aislar", hazards: [{ controls: "Bloquear" }] },
        { step: "Verificar", hazards: [{ hazard: "Caída", controls: "Arnés" }] },
      ],
      ppe: {},
      participants: ["p1"],
    };
    const result = validateDraft(atsPinned, payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["steps.0.hazards.0.hazard"]).toBe(t.forms.required);
      expect(result.errors["steps.0.hazards.0.controls"]).toBeUndefined();
    }
  });
});

describe("submitDraft", () => {
  it("freezes the draft, queues blobs before the record and hashes the compiled payload", async () => {
    const draft = await draftWith(toolboxPinned, "toolbox_talk", toolboxPayload, ["p1", "p2"]);
    // The payload changed after it was saved: submit must store what it validated.
    await savePayload(draft.id, { ...toolboxPayload, injected: "x" }, db);

    const result = await submitDraft(draft.id, toolboxPinned, db);
    expect(result).toEqual({ ok: true });

    const saved = (await db.drafts.get(draft.id)) as CaptureDraft;
    const expected = compileForm(toolbox).safeParse({ ...toolboxPayload, injected: "x" });
    expect(expected.success).toBe(true);
    if (expected.success) expect(saved.payload).toEqual(expected.data);
    expect(saved.payload).not.toHaveProperty("injected");

    // The envelope the runner will POST is built from the frozen draft; the hash must match it.
    const envelope: RecordEnvelope = {
      ...saved.submission!,
      company_id: saved.company_id,
      id: saved.id,
      schema_version: saved.schema_version,
      extension_version: saved.extension_version ?? null,
      payload: saved.payload,
    };
    const contentHash = await computeContentHash(envelope);
    expect(saved.submission?.signatures).toHaveLength(2);
    for (const signature of saved.submission?.signatures ?? [])
      expect(signature.content_hash).toBe(contentHash);
    expect(saved.submission?.participants).toEqual([
      { persona_id: "p1", role: "attendee" },
      { persona_id: "p2", role: "attendee" },
    ]);
    expect(saved.submission?.crew_id).toBe("c1");
    expect(saved.submission?.location_id).toBe("l1");

    const rows = (await db.outbox.toArray()).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    expect(rows.map((r) => r.kind)).toEqual(["blob", "blob", "record"]);
    expect(rows.map((r) => r.ref_id)).toEqual([
      ...(saved.submission?.signatures.map((s) => s.id) ?? []),
      draft.id,
    ]);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("submitting twice is a no-op (the draft is frozen)", async () => {
    const draft = await draftWith(toolboxPinned, "toolbox_talk", toolboxPayload, ["p1", "p2"]);
    await submitDraft(draft.id, toolboxPinned, db);
    const count = await db.outbox.count();

    expect(await submitDraft(draft.id, toolboxPinned, db)).toEqual({ ok: false, reason: "frozen" });
    expect(await db.outbox.count()).toBe(count);
  });

  it("rejects an invalid payload and leaves the draft editable", async () => {
    const draft = await draftWith(
      toolboxPinned,
      "toolbox_talk",
      { ...toolboxPayload, topic: "" },
      ["p1", "p2"],
    );

    const result = await submitDraft(draft.id, toolboxPinned, db);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") expect(result.errors.topic).toBe(t.forms.required);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.drafts.get(draft.id))?.submission).toBeUndefined();
  });

  it("reports missing_context when the form carries no crew/location", async () => {
    const loose: FormSchema = {
      title: "Sin contexto",
      sections: [
        {
          key: "main",
          title: "Main",
          fields: [
            { key: "topic", type: "text", label: "Tema", required: true },
            {
              key: "people",
              type: "persona",
              label: "Personas",
              multiple: true,
              role: "signer",
              signature: true,
            },
          ],
        },
      ],
    };
    const draft = await draftWith(pinned(loose, "suelto"), "suelto", { topic: "X", people: ["p1"] }, [
      "p1",
    ]);

    expect(await submitDraft(draft.id, pinned(loose, "suelto"), db)).toEqual({
      ok: false,
      reason: "missing_context",
    });
    expect(await db.outbox.count()).toBe(0);
  });

  it("reports missing_signatures when a required signer has not signed", async () => {
    const draft = await draftWith(toolboxPinned, "toolbox_talk", toolboxPayload, ["p1"]);

    expect(await submitDraft(draft.id, toolboxPinned, db)).toEqual({
      ok: false,
      reason: "missing_signatures",
    });
    expect(await db.outbox.count()).toBe(0);
  });

  it("reports no_draft for an unknown id", async () => {
    expect(await submitDraft("01900000-0000-7000-8000-00000000ffff", toolboxPinned, db)).toEqual({
      ok: false,
      reason: "no_draft",
    });
  });

  // KNOWN PRODUCT GAP (reported, not fixed here): the ats@1 seed declares task_type, steps, ppe,
  // participants and geo, but no crew/location field, while submitDraft requires both. An ATS
  // draft therefore can never be submitted. This test pins the current behavior so the suite is
  // honest about it; when the seed gains crew/location it must be updated to expect success.
  it("the ats@1 seed cannot be submitted: it has no crew/location field", async () => {
    const payload: Payload = {
      task_type: "tt1",
      steps: [{ step: "Aislar", hazards: [{ hazard: "Eléctrico", controls: "Bloquear" }] }],
      ppe: {},
      participants: ["p1"],
    };
    const draft = await draftWith(atsPinned, "ats", payload, ["p1"]);

    expect(await submitDraft(draft.id, atsPinned, db)).toEqual({
      ok: false,
      reason: "missing_context",
    });
  });
});
