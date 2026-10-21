import { compileForm } from "@/forms/compile";
import type { FormExtension, FormSchema } from "@/forms/dsl";
import type { Storage } from "@/lib/storage";
import { computeContentHash, computeSubmissionHash } from "../canonical";
import { recordEnvelopeSchema, type RecordEnvelope } from "../envelope";
import { checkAccess, isDenied } from "./access";
import { attachmentKey, signatureKey } from "./keys";
import { fail, mapDbError, ok, type SyncDb, type SyncResult } from "./result";

/**
 * Idempotent upsert of one record with its participants, signatures and attachments
 * (spec/data-model.md#Sync endpoints). The caller owns the transaction (`withUser()`).
 *
 * Outcomes: `ok`; `ok` + `conflict: true` (same id, different submission hash: the envelope is
 * kept as a `record_conflicts` copy and the stored record is never touched); `id_conflict`; and
 * the terminal errors `read_only`, `forbidden`, `wrong_company`, `invalid`.
 */
export async function upsertRecord(db: SyncDb, storage: Storage, raw: unknown): Promise<SyncResult> {
  const parsed = recordEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const env = parsed.data;

  const access = await checkAccess(db, env.company_id);
  if (isDenied(access)) return access;
  if (access.isGuest && env.attachments.length > 0) return fail("forbidden");

  // The server recomputes what each signature signed; a mismatch means the content changed after signing.
  const contentHash = await computeContentHash(env);
  if (env.signatures.some((s) => s.content_hash !== contentHash)) return fail("invalid");

  const validated = await validatePayload(db, env);
  if (!validated.ok) return fail("invalid");

  const submissionHash = await computeSubmissionHash(env);

  // Blobs go first: they must already be stored (keys are rebuilt here, never read from the client).
  const keys = [
    ...env.signatures.map((s) => signatureKey(env.company_id, s.id)),
    ...env.attachments.map((a) => attachmentKey(env.company_id, env.id, a.id, a.mime)),
  ];
  if (keys.length > 0) {
    if (!storage.isAvailable) return fail("blob_missing");
    // Checked in parallel (one storage round trip, not one per blob); bodies are never read.
    // allSettled so every fetched body is cancelled even when another lookup rejects.
    const settled = await Promise.allSettled(keys.map((key) => storage.get(key)));
    await Promise.all(
      settled.map((s) => (s.status === "fulfilled" ? s.value?.body.cancel().catch(() => {}) : undefined)),
    );
    const rejected = settled.find((s) => s.status === "rejected");
    if (rejected) throw rejected.reason;
    if (settled.some((s) => s.status === "fulfilled" && !s.value)) return fail("blob_missing");
  }

  await db.query("savepoint sync_record");
  try {
    const result = await write(db, env, validated.payload, submissionHash);
    await db.query("release savepoint sync_record");
    return result;
  } catch (error) {
    await db.query("rollback to savepoint sync_record");
    const mapped = mapDbError(error);
    if (mapped) return mapped;
    throw error;
  }
}

async function validatePayload(
  db: SyncDb,
  env: RecordEnvelope,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false }> {
  const base = await db.query<{ schema: FormSchema }>(
    `select schema from public.form_schemas
      where record_type_id = $1 and kind = 'base' and version = $2 and status in ('published', 'retired')`,
    [env.record_type_id, env.schema_version],
  );
  if (!base.rows[0]) return { ok: false };
  let extension: FormExtension | null = null;
  if (env.extension_version) {
    const ext = await db.query<{ schema: FormExtension }>(
      `select schema from public.form_schemas
        where record_type_id = $1 and kind = 'extension' and company_id = $2 and version = $3
          and status in ('published', 'retired')`,
      [env.record_type_id, env.company_id, env.extension_version],
    );
    if (!ext.rows[0]) return { ok: false };
    extension = ext.rows[0].schema;
  }
  const result = compileForm(base.rows[0].schema, extension).safeParse(env.payload);
  return result.success ? { ok: true, payload: result.data } : { ok: false };
}

async function write(
  db: SyncDb,
  env: RecordEnvelope,
  payload: Record<string, unknown>,
  submissionHash: string,
): Promise<SyncResult> {
  const inserted = await db.query(
    `insert into public.records
       (id, company_id, record_type_id, schema_version, extension_version, occurred_at, crew_id,
        location_id, task_type_id, payload, submission_hash, geo_lat, geo_lng, geo_accuracy,
        device_id, client_created_at, amends_record_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17)
     on conflict (id) do nothing
     returning id`,
    [
      env.id,
      env.company_id,
      env.record_type_id,
      env.schema_version,
      env.extension_version ?? null,
      env.occurred_at,
      env.crew_id,
      env.location_id,
      env.task_type_id ?? null,
      JSON.stringify(payload),
      submissionHash,
      env.geo_lat ?? null,
      env.geo_lng ?? null,
      env.geo_accuracy ?? null,
      env.device_id,
      env.client_created_at,
      env.amends_record_id ?? null,
    ],
  );

  // Children only when THIS call inserted the record: their RLS needs the record's own transaction,
  // and a re-send must compare hashes first instead of re-inserting.
  if (inserted.rowCount === 1) {
    await insertChildren(db, env);
    return ok({ conflict: false });
  }
  return resolveExisting(db, env, submissionHash);
}

async function insertChildren(db: SyncDb, env: RecordEnvelope): Promise<void> {
  if (env.participants.length > 0) {
    await db.query(
      `insert into public.record_participants (company_id, record_id, persona_id, role)
       select $1, $2, p, r from unnest($3::uuid[], $4::text[]) as t(p, r)`,
      [env.company_id, env.id, env.participants.map((p) => p.persona_id), env.participants.map((p) => p.role)],
    );
  }
  for (const s of env.signatures) {
    await db.query(
      `insert into public.signatures
         (id, company_id, record_id, persona_id, image_path, signed_at, geo_lat, geo_lng, geo_accuracy, content_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        s.id,
        env.company_id,
        env.id,
        s.persona_id,
        signatureKey(env.company_id, s.id),
        s.signed_at,
        s.geo_lat ?? null,
        s.geo_lng ?? null,
        s.geo_accuracy ?? null,
        s.content_hash,
      ],
    );
  }
  for (const a of env.attachments) {
    await db.query(
      `insert into public.attachments (id, company_id, record_id, path, mime, size, taken_at, geo_lat, geo_lng)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        a.id,
        env.company_id,
        env.id,
        attachmentKey(env.company_id, env.id, a.id, a.mime),
        a.mime,
        a.size,
        a.taken_at,
        a.geo_lat ?? null,
        a.geo_lng ?? null,
      ],
    );
  }
}

async function resolveExisting(db: SyncDb, env: RecordEnvelope, submissionHash: string): Promise<SyncResult> {
  const existing = await db.query<{ submission_hash: string }>(
    "select submission_hash from public.records where id = $1 and company_id = $2",
    [env.id, env.company_id],
  );
  const row = existing.rows[0];
  if (!row) return fail("id_conflict"); // exists but invisible to this caller (other company / author)
  if (row.submission_hash === submissionHash) return ok({ conflict: false });

  // Same id, different content: keep this copy for HSE, never overwrite. A retry of the same
  // conflicting envelope must not pile up copies, so look for it first.
  const dup = await db.query(
    `select 1 from public.record_conflicts
      where record_id = $1 and envelope ->> 'submission_hash' = $2`,
    [env.id, submissionHash],
  );
  if ((dup.rowCount ?? 0) > 0) return ok({ conflict: true });
  try {
    await db.query("savepoint sync_conflict");
    await db.query(
      `insert into public.record_conflicts (company_id, record_id, envelope, device_id)
       values ($1, $2, $3::jsonb, $4)`,
      [env.company_id, env.id, JSON.stringify({ ...env, submission_hash: submissionHash }), env.device_id],
    );
    await db.query("release savepoint sync_conflict");
  } catch (error) {
    await db.query("rollback to savepoint sync_conflict");
    const code = (error as { code?: string }).code;
    if (code === "42501") return fail("id_conflict"); // insert denied: not the author nor hse/admin
    throw error;
  }
  return ok({ conflict: true });
}
