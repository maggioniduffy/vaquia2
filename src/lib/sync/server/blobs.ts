import type { Storage } from "@/lib/storage";
import { sniffContentType } from "@/lib/storage/keys";
import { sha256Hex } from "../canonical";
import {
  ATTACHMENT_MIMES,
  MAX_ATTACHMENT_BYTES,
  MAX_SIGNATURE_BYTES,
} from "../envelope";
import { isUuidV7 } from "../uuid";
import { checkAccess, isDenied } from "./access";
import { attachmentKey, signatureKey } from "./keys";
import { fail, ok, type SyncDb, type SyncResult } from "./result";

export type BlobInput = {
  companyId: string;
  id: string;
  kind: string;
  recordId?: string | null;
  mime: string;
  /** sha256 the device computed; a mismatch means the upload was corrupted in transit. */
  sha256: string;
  bytes: Uint8Array;
};

const isWebp = (b: Uint8Array) =>
  b.length > 12 &&
  [0x52, 0x49, 0x46, 0x46].every((x, i) => b[i] === x) &&
  [0x57, 0x45, 0x42, 0x50].every((x, i) => b[8 + i] === x);

function sniffsAs(mime: string, bytes: Uint8Array): boolean {
  if (mime === "image/webp") return isWebp(bytes);
  return sniffContentType(bytes) === mime;
}

async function readAll(body: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  return new Response(body).arrayBuffer();
}

/**
 * Stores one blob. Write-once: the same sha256 under the same key is `ok` (idempotent re-send), a
 * different one is `409 blob_conflict`. Exists-then-put is not atomic (the storage driver has no
 * conditional put yet); keys embed a UUIDv7 generated on one device, so a race needs two devices
 * sending different bytes for the same id.
 */
export async function storeBlob(db: SyncDb, storage: Storage, input: BlobInput): Promise<SyncResult> {
  const access = await checkAccess(db, input.companyId);
  if (isDenied(access)) return access;

  if (!isUuidV7(input.id)) return fail("invalid");
  const isSignature = input.kind === "signature";
  if (!isSignature && input.kind !== "photo") return fail("invalid");
  if (input.bytes.length === 0) return fail("blob_rejected");

  let key: string;
  if (isSignature) {
    if (input.mime !== "image/png" || input.bytes.length > MAX_SIGNATURE_BYTES) return fail("blob_rejected");
    if (!sniffsAs("image/png", input.bytes)) return fail("blob_rejected");
    key = signatureKey(input.companyId, input.id);
  } else {
    if (access.isGuest) return fail("blob_rejected"); // demo guests: signatures only
    const mime = input.mime as (typeof ATTACHMENT_MIMES)[number];
    if (!ATTACHMENT_MIMES.includes(mime) || input.bytes.length > MAX_ATTACHMENT_BYTES)
      return fail("blob_rejected");
    if (!sniffsAs(mime, input.bytes)) return fail("blob_rejected");
    if (!input.recordId || !isUuidV7(input.recordId)) return fail("invalid");
    key = attachmentKey(input.companyId, input.recordId, input.id, mime);
  }

  const copy = input.bytes.slice().buffer;
  const digest = await sha256Hex(copy);
  if (digest !== input.sha256.toLowerCase()) return { status: 400, body: { error: "corrupt_upload" } };

  if (!storage.isAvailable) return fail("unavailable");
  const existing = await storage.get(key);
  if (existing) {
    const stored = await sha256Hex(await readAll(existing.body));
    return stored === digest ? ok() : fail("blob_conflict");
  }
  await storage.put(key, input.bytes, input.mime);
  return ok();
}
