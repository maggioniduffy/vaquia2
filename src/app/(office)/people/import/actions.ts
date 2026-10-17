"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { t } from "@/i18n/es-AR";
import { withUser } from "@/lib/db";
import { MAX_BYTES, type ImportCounts, type ImportKind, type RowResult } from "@/lib/people/import";
import { commitImport, previewImport, type ImportPreview } from "@/lib/people/import-db";
import { getSession } from "@/lib/session";

/** Row shape sent to the browser (no parsed payload). */
export type ClientRow = Pick<RowResult, "line" | "values" | "errors" | "note" | "action">;

export type ImportActionState =
  | { ok: true; kind: ImportKind; headerErrors: string[]; rows: ClientRow[]; counts: ImportCounts }
  | { ok: false; error: string };

const kindSchema = z.enum(["personas", "capacitaciones"]);

function toClient(p: ImportPreview): ImportActionState {
  return {
    ok: true,
    kind: p.kind,
    headerErrors: p.headerErrors,
    counts: p.counts,
    rows: p.rows.map((r) => ({
      line: r.line,
      values: r.values,
      errors: r.errors,
      note: r.note,
      action: r.action,
    })),
  };
}

async function readInput(
  formData: FormData,
): Promise<{ kind: ImportKind; text: string } | { error: string }> {
  const kind = kindSchema.safeParse(formData.get("kind"));
  const file = formData.get("file");
  if (!kind.success || !(file instanceof File) || file.size === 0) {
    return { error: t.import.noFile };
  }
  if (file.size > MAX_BYTES) return { error: t.import.fileTooLarge };
  return { kind: kind.data, text: await file.text() };
}

async function authorize(): Promise<{ userId: string } | { error: string }> {
  const session = await getSession();
  const role = session.active?.role;
  if (role !== "hse" && role !== "admin") return { error: t.import.forbidden };
  if (session.isGuest) return { error: t.import.guest };
  return { userId: session.userId };
}

/** Parses + validates against the DB. Writes nothing. */
export async function previewAction(formData: FormData): Promise<ImportActionState> {
  const auth = await authorize();
  if ("error" in auth) return { ok: false, error: auth.error };
  const input = await readInput(formData);
  if ("error" in input) return { ok: false, error: input.error };
  try {
    const preview = await withUser(auth.userId, (db) => previewImport(db, input.kind, input.text));
    return toClient(preview);
  } catch (error) {
    console.error("previewAction failed", error);
    return { ok: false, error: t.import.genericError };
  }
}

/**
 * Re-parses the re-uploaded file and re-validates it (nothing from the preview is trusted), then
 * writes all valid rows in one transaction: all commit or none.
 */
export async function commitAction(formData: FormData): Promise<ImportActionState> {
  const auth = await authorize();
  if ("error" in auth) return { ok: false, error: auth.error };
  const input = await readInput(formData);
  if ("error" in input) return { ok: false, error: input.error };
  try {
    const result = await withUser(auth.userId, (db) => commitImport(db, input.kind, input.text));
    revalidatePath("/people");
    return toClient(result);
  } catch (error) {
    console.error("commitAction failed", error);
    return { ok: false, error: t.import.commitError };
  }
}
