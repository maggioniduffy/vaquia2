"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { t } from "@/i18n/es-AR";
import { withUser } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";
import { validDateRange } from "@/lib/people/import";
import { getSession } from "@/lib/session";
import { isReadOnlyError } from "@/lib/trial";
import { getStorage } from "@/lib/storage";
import {
  MAX_FILE_BYTES,
  qualificationFileKey,
  sanitizeFilename,
  sniffContentType,
} from "@/lib/storage/keys";

export type AddQualificationResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<"typeId" | "issuedOn" | "expiresOn" | "file", string>>;
    };

const e = t.qualifications.errors;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, e.invalidDate)
  .refine((v) => parseDateInput(v) === v && validDateRange(v), e.invalidDate);

const schema = z
  .object({
    personaId: z.uuid(),
    typeId: z.uuid({ error: e.required }),
    issuedOn: isoDate,
    expiresOn: isoDate.nullable(),
  })
  .refine((v) => v.expiresOn === null || v.expiresOn >= v.issuedOn, {
    path: ["expiresOn"],
    message: e.expiresBeforeIssued,
  });

class ActionError extends Error {
  constructor(
    message: string,
    readonly field?: "typeId" | "file",
  ) {
    super(message);
  }
}

const CANONICAL_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Adds a qualification (also used for renewals: always a NEW row, the old one is kept).
 * The row insert and the file upload share one transaction: if the upload fails nothing is saved.
 */
export async function addQualification(formData: FormData): Promise<AddQualificationResult> {
  const session = await getSession();
  const role = session.active?.role;
  if (role !== "hse" && role !== "admin") return { ok: false, error: e.forbidden };

  const parsed = schema.safeParse({
    personaId: text(formData, "personaId"),
    typeId: text(formData, "typeId"),
    issuedOn: text(formData, "issuedOn"),
    expiresOn: text(formData, "expiresOn") || null,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field === "personaId") return { ok: false, error: e.personaNotFound };
      fieldErrors[field] ??= issue.message;
    }
    return { ok: false, error: e.generic, fieldErrors };
  }
  const input = parsed.data;

  const raw = formData.get("file");
  const file = raw instanceof File && raw.size > 0 ? raw : null;
  let bytes: Uint8Array | null = null;
  let contentType = "";
  if (file) {
    if (session.isGuest) {
      return { ok: false, error: e.guestUpload, fieldErrors: { file: e.guestUpload } };
    }
    if (!getStorage().isAvailable) return { ok: false, error: t.storage.unavailable };
    if (file.size > MAX_FILE_BYTES) {
      return { ok: false, error: e.fileTooLarge, fieldErrors: { file: e.fileTooLarge } };
    }
    bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffContentType(bytes);
    if (!sniffed) return { ok: false, error: e.fileType, fieldErrors: { file: e.fileType } };
    contentType = sniffed;
  }

  try {
    await withUser(session.userId, async (db) => {
      const persona = await db.query<{ company_id: string }>(
        "select company_id from public.personas where id = $1",
        [input.personaId],
      );
      const companyId = persona.rows[0]?.company_id;
      if (!companyId) throw new ActionError(e.personaNotFound);

      const type = await db.query("select 1 from public.qualification_types where id = $1", [
        input.typeId,
      ]);
      if (type.rowCount === 0) throw new ActionError(e.typeNotAllowed, "typeId");

      const id = (await db.query<{ id: string }>("select public.uuid_generate_v7() as id")).rows[0]!
        .id;
      let key: string | null = null;
      if (file && bytes) {
        const ext = CANONICAL_EXT[contentType]!;
        const stem = sanitizeFilename(file.name).replace(/\.[^.]*$/, "");
        key = qualificationFileKey(companyId, id, `${stem}.${ext}`);
      }

      await db.query(
        `insert into public.qualifications (id, company_id, persona_id, type_id, issued_on, expires_on, file_path)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, companyId, input.personaId, input.typeId, input.issuedOn, input.expiresOn, key],
      );

      // Uploaded before COMMIT: if the commit fails an orphan object may remain (cleanup is future work).
      if (key && bytes) {
        try {
          await getStorage().put(key, bytes, contentType);
        } catch (error) {
          console.error("qualification file upload failed", error);
          throw new ActionError(e.uploadFailed, "file");
        }
      }
    });
  } catch (error) {
    if (error instanceof ActionError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.field ? { [error.field]: error.message } : undefined,
      };
    }
    if (isReadOnlyError(error)) return { ok: false, error: t.trial.readOnly };
    console.error("addQualification failed", error);
    return { ok: false, error: e.generic };
  }

  revalidatePath(`/people/${input.personaId}`);
  return { ok: true };
}
