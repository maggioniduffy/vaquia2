import Dexie, { type EntityTable } from "dexie";

// Device-local store for the field PWA. Every row carries company_id so switching company on a
// shared device never mixes data. Rows are never deleted from this module: removal belongs to the
// sync engine (phase 2.4), and only after the server confirmed the record.

export type OutboxKind = "blob" | "record";
export type OutboxStatus = "pending" | "sending" | "failed" | "kept";
export type BlobKind = "signature" | "photo";

/** Local copy of a record being filled in. `id` is the client-generated UUIDv7 reused as the server record id. */
export type DraftRow = {
  id: string;
  company_id: string;
  record_type: string; // record_types.code
  /** Base schema version the draft started with; it keeps it (spec/forms.md#Offline). */
  schema_version: number;
  extension_version?: number;
  payload: Record<string, unknown>;
  updated_at: string; // ISO
};

export type OutboxRow = {
  id: string;
  company_id: string;
  kind: OutboxKind;
  /** blobs.id for kind=blob, drafts.id for kind=record. */
  ref_id: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: string | null; // ISO
  /** Machine code of the last failure (never free text). */
  last_error: string | null;
  created_at: string; // ISO; outbox order
};

export type BlobRow = {
  id: string;
  company_id: string;
  kind: BlobKind;
  mime: string;
  bytes: Blob;
  sha256: string;
};

export type ReferenceRow<T = unknown> = {
  company_id: string;
  key: string;
  data: T;
  fetched_at: string; // ISO
};

export class VaquiaDb extends Dexie {
  drafts!: EntityTable<DraftRow, "id">;
  outbox!: EntityTable<OutboxRow, "id">;
  blobs!: EntityTable<BlobRow, "id">;
  reference!: Dexie.Table<ReferenceRow, [string, string]>;

  constructor() {
    super("vaquia");
    this.version(1).stores({
      drafts: "id, company_id, [company_id+record_type], updated_at",
      outbox: "id, company_id, status, ref_id, created_at, [company_id+status]",
      blobs: "id, company_id, kind",
      reference: "[company_id+key], company_id",
    });
  }
}

let instance: VaquiaDb | undefined;

/** Lazily opened so importing this module on the server (SSR) never touches IndexedDB. */
export function getDb(): VaquiaDb {
  instance ??= new VaquiaDb();
  return instance;
}
