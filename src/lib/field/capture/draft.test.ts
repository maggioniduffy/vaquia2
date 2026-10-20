// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RefFormSchema } from "@/lib/offline/reference-types";
import { isUuidV7 } from "@/lib/sync/uuid";
import { VaquiaDb, type RecordSubmission } from "@/lib/offline/db";
import ats from "@/forms/seeds/ats.v1.json";
import toolboxTalk from "@/forms/seeds/toolbox_talk.v1.json";
import type { FormSchema } from "@/forms/dsl";
import type { PinnedSchemas } from "./schema";
import {
  applyGeo,
  clearSignatures,
  createDraft,
  discardDraft,
  emptyMeta,
  getDraft,
  savePayload,
  saveSignature,
  type CaptureDraft,
} from "./draft";

// Phase 2.5 — the local draft: schema pinning at creation, payload autosave, signature blobs and the
// rule that changing content after signing clears every signature (spec/forms.md#Offline capture).

const COMPANY = "aaaaaaaa-0000-7000-8000-00000000000a";
const NOW = new Date("2026-10-19T10:00:00Z");

const toolbox = toolboxTalk as unknown as FormSchema;
const atsSchema = ats as unknown as FormSchema;

function pinned(schema: FormSchema, code: string, version = 1, extensionVersion?: number): PinnedSchemas {
  const baseRow: RefFormSchema = {
    id: `schema-${code}-${version}`,
    record_type_id: `type-${code}`,
    record_type: code,
    company_id: null,
    kind: "base",
    version,
    schema,
    published_at: NOW.toISOString(),
  };
  return {
    baseRow,
    extensionRow:
      extensionVersion == null
        ? undefined
        : {
            ...baseRow,
            id: `schema-${code}-ext-${extensionVersion}`,
            kind: "extension",
            version: extensionVersion,
          },
    base: schema,
    sections: schema.sections,
  };
}

const toolboxPinned = pinned(toolbox, "toolbox_talk");

const png = (byte = 0x89) =>
  new Blob([new Uint8Array([byte, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
    type: "image/png",
  });

const meta = (draft: CaptureDraft) => draft.capture!;

let db: VaquiaDb;

beforeEach(async () => {
  await Dexie.delete("vaquia");
  db = new VaquiaDb();
});

afterEach(async () => {
  await db.delete();
});

async function draftOf(schema = toolboxPinned, code = "toolbox_talk") {
  return createDraft({ companyId: COMPANY, recordTypeCode: code, pinned: schema, now: NOW }, db);
}

describe("createDraft", () => {
  it("stores a UUIDv7 draft with the pinned schema versions and empty metadata", async () => {
    const extension = pinned(toolbox, "toolbox_talk", 2, 3);
    const draft = await createDraft(
      { companyId: COMPANY, recordTypeCode: "toolbox_talk", pinned: extension, now: NOW },
      db,
    );

    expect(isUuidV7(draft.id)).toBe(true);
    expect(draft).toMatchObject({
      company_id: COMPANY,
      record_type: "toolbox_talk",
      schema_version: 2,
      extension_version: 3,
      payload: {},
      updated_at: NOW.toISOString(),
    });
    expect(draft.capture).toEqual(emptyMeta(NOW));
    expect(await getDraft(draft.id, db)).toEqual(draft);
  });

  it("seeds fields whose default is 'now'", async () => {
    const schema: FormSchema = {
      title: "Con fecha",
      sections: [
        {
          key: "main",
          title: "Main",
          fields: [
            { key: "fecha", type: "date", label: "Fecha", default: "now" },
            { key: "hora", type: "time", label: "Hora", default: "now" },
          ],
        },
      ],
    };
    const draft = await draftOf(pinned(schema, "con_fecha"), "con_fecha");
    expect(draft.payload).toEqual({ fecha: "2026-10-19", hora: "07:00" }); // ART (UTC-3)
  });
});

describe("savePayload", () => {
  it("updates the payload and the autosave timestamp", async () => {
    const draft = await draftOf();
    const before = draft.updated_at;

    await savePayload(draft.id, { topic: "Charla", crew: "c1" }, db);

    const saved = await getDraft(draft.id, db);
    expect(saved?.payload).toEqual({ topic: "Charla", crew: "c1" });
    expect(saved?.updated_at).not.toBe(before);
  });

  it("does nothing once the draft was submitted (frozen)", async () => {
    const draft = await draftOf();
    await db.drafts.put({ ...draft, submission: {} as RecordSubmission });

    await savePayload(draft.id, { topic: "Cambio tardío" }, db);

    expect((await getDraft(draft.id, db))?.payload).toEqual({});
  });
});

describe("signatures", () => {
  it("stores the PNG as a blob and records it for the persona", async () => {
    const draft = await draftOf();

    const sig = await saveSignature(
      { draftId: draft.id, personaId: "p1", png: png(), now: new Date("2026-10-19T10:05:00Z") },
      db,
    );

    expect(isUuidV7(sig.id)).toBe(true);
    expect(sig.signed_at).toBe("2026-10-19T10:05:00.000Z");
    expect(meta((await getDraft(draft.id, db))!).signatures.p1).toEqual(sig);
    const blob = await db.blobs.get(sig.id);
    expect(blob).toMatchObject({ company_id: COMPANY, kind: "signature", mime: "image/png" });
    expect(blob?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("replaces a previous signature of the same persona and deletes its blob", async () => {
    const draft = await draftOf();
    const first = await saveSignature({ draftId: draft.id, personaId: "p1", png: png(0x89) }, db);
    const second = await saveSignature({ draftId: draft.id, personaId: "p1", png: png(0x90) }, db);

    expect(second.id).not.toBe(first.id);
    expect(await db.blobs.get(first.id)).toBeUndefined();
    expect(await db.blobs.get(second.id)).toBeDefined();
    expect(Object.keys(meta((await getDraft(draft.id, db))!).signatures)).toEqual(["p1"]);
  });

  it("clearing after a content edit removes every signature and its blob", async () => {
    const draft = await draftOf();
    await saveSignature({ draftId: draft.id, personaId: "p1", png: png() }, db);
    await saveSignature({ draftId: draft.id, personaId: "p2", png: png() }, db);
    expect(await db.blobs.count()).toBe(2);

    // CaptureForm.onChange calls clearSignatures before autosaving the edited payload.
    await clearSignatures(draft.id, db);
    await savePayload(draft.id, { topic: "Otro tema" }, db);

    const saved = await getDraft(draft.id, db);
    expect(meta(saved!).signatures).toEqual({});
    expect(saved?.payload).toEqual({ topic: "Otro tema" });
    expect(await db.blobs.count()).toBe(0);
  });

  it("refuses to sign a submitted draft", async () => {
    const draft = await draftOf();
    await db.drafts.put({ ...draft, submission: {} as RecordSubmission });

    await expect(
      saveSignature({ draftId: draft.id, personaId: "p1", png: png() }, db),
    ).rejects.toThrow(/not editable/);
    expect(await db.blobs.count()).toBe(0);
  });
});

describe("applyGeo", () => {
  it("stores the position in the payload and the metadata", async () => {
    const draft = await draftOf();
    const geo = { lat: -38.95, lng: -68.06, accuracy: 12 };

    await applyGeo(draft.id, toolbox.sections, geo, db);

    const saved = await getDraft(draft.id, db);
    expect(meta(saved!).geo).toEqual(geo);
    expect(meta(saved!).geo_state).toBe("ok");
    expect(saved?.payload.geo).toEqual(geo);
  });

  it("clears the geo field when the position is unavailable", async () => {
    const draft = await draftOf();
    await applyGeo(draft.id, toolbox.sections, { lat: 1, lng: 2, accuracy: 3 }, db);
    await applyGeo(draft.id, toolbox.sections, null, db);

    const saved = await getDraft(draft.id, db);
    expect(meta(saved!).geo).toBeNull();
    expect(meta(saved!).geo_state).toBe("unavailable");
    expect(saved?.payload).not.toHaveProperty("geo");
  });

  it("does not change a signed draft (signatures cover the geo)", async () => {
    const draft = await draftOf();
    await saveSignature({ draftId: draft.id, personaId: "p1", png: png() }, db);
    const signed = await getDraft(draft.id, db);

    await applyGeo(draft.id, toolbox.sections, { lat: 1, lng: 2, accuracy: 3 }, db);

    const saved = await getDraft(draft.id, db);
    expect(meta(saved!).geo).toEqual(meta(signed!).geo);
    expect(saved?.payload).toEqual(signed?.payload);
  });
});

describe("discardDraft", () => {
  it("deletes an unsubmitted draft with its signature blobs", async () => {
    const draft = await draftOf(pinned(atsSchema, "ats"), "ats");
    const sig = await saveSignature({ draftId: draft.id, personaId: "p1", png: png() }, db);

    await discardDraft(draft.id, db);

    expect(await getDraft(draft.id, db)).toBeUndefined();
    expect(await db.blobs.get(sig.id)).toBeUndefined();
  });

  it("keeps a submitted draft (its record may still be queued)", async () => {
    const draft = await draftOf();
    await db.drafts.put({ ...draft, submission: {} as RecordSubmission });

    await discardDraft(draft.id, db);

    expect(await getDraft(draft.id, db)).toBeDefined();
  });
});
