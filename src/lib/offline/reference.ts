"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type ReferenceRow } from "@/lib/offline/db";
import { REFERENCE_KEYS, type ReferenceKey } from "@/lib/offline/reference-keys";
import type { ReferencePayload, RefFormSchema } from "@/lib/offline/reference-types";

export type RefreshResult =
  | { ok: true; companyId: string }
  | { ok: false; reason: "offline" | "unauthorized" | "no_company" | "error" };

let inflight: Promise<RefreshResult> | undefined;

/**
 * Fetches /api/sync/reference and stores it in Dexie under the payload's company_id.
 * Never deletes local data in other companies. Concurrent calls share one request.
 */
export function refreshReference(): Promise<RefreshResult> {
  inflight ??= doRefresh().finally(() => {
    inflight = undefined;
  });
  return inflight;
}

async function doRefresh(): Promise<RefreshResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return { ok: false, reason: "offline" };
  let res: Response;
  try {
    res = await fetch("/api/sync/reference", { cache: "no-store", credentials: "same-origin" });
  } catch {
    return { ok: false, reason: "offline" };
  }
  if (res.status === 401) return { ok: false, reason: "unauthorized" };
  if (res.status === 409) return { ok: false, reason: "no_company" };
  if (!res.ok) return { ok: false, reason: "error" };

  const payload = (await res.json()) as ReferencePayload;
  const db = getDb();
  const companyId = payload.company_id;

  await db.transaction("rw", db.reference, async () => {
    // A draft keeps the schema versions it started with: keep every schema row ever seen, add new ones.
    const prev = await db.reference.get([companyId, "form_schemas"]);
    const byId = new Map<string, RefFormSchema>(
      ((prev?.data as RefFormSchema[] | undefined) ?? []).map((s) => [s.id, s]),
    );
    for (const s of payload.form_schemas) byId.set(s.id, s);

    const rows: ReferenceRow[] = REFERENCE_KEYS.map((key) => ({
      company_id: companyId,
      key,
      data: key === "form_schemas" ? [...byId.values()] : payload[key],
      fetched_at: payload.fetched_at,
    }));
    // Rewrite only rows whose data changed: every put re-fires the live queries reading that key
    // (an open capture form re-renders on each app foreground otherwise). "personas" is always
    // written because its fetched_at is the "last updated" shown to the user.
    const current = await db.reference.bulkGet(rows.map((r) => [companyId, r.key]));
    const changed = rows.filter(
      (row, i) =>
        row.key === "personas" || JSON.stringify(current[i]?.data) !== JSON.stringify(row.data),
    );
    await db.reference.bulkPut(changed);
  });
  return { ok: true, companyId };
}

/** Live reference list for a company (undefined while loading, [] when never fetched). */
export function useReference<K extends ReferenceKey>(
  companyId: string | null | undefined,
  key: K,
): ReferencePayload[K] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [] as unknown as ReferencePayload[K];
    const row = await getDb().reference.get([companyId, key]);
    return (row?.data ?? []) as ReferencePayload[K];
  }, [companyId, key]);
}

/** When the reference data of a company was last fetched (ISO), if ever. */
export function useReferenceFetchedAt(companyId: string | null | undefined): string | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return undefined;
    return (await getDb().reference.get([companyId, "personas"]))?.fetched_at;
  }, [companyId]);
}
