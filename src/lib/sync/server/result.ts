import type { PoolClient } from "pg";
import type { TerminalCode } from "../outcome";

/** What the sync modules need from a transaction: the caller (route or test) owns `withUser()`. */
export type SyncDb = Pick<PoolClient, "query">;

export type SyncResult = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

export const ok = (extra: Record<string, unknown> = {}): SyncResult => ({
  status: 200,
  body: { ok: true, ...extra },
});

type ErrorCode = TerminalCode | "blob_missing" | "unavailable";
const STATUS: Record<ErrorCode, number> = {
  read_only: 403,
  forbidden: 403,
  wrong_company: 409,
  id_conflict: 409,
  invalid: 422,
  blob_rejected: 422,
  blob_conflict: 409,
  blob_missing: 409,
  unavailable: 503,
};

export const fail = (error: ErrorCode): SyncResult => ({ status: STATUS[error], body: { error } });

/** Maps the SQLSTATEs the record tables can raise to a sync outcome; null = unexpected (500). */
export function mapDbError(error: unknown): SyncResult | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === "VQ001") return fail("read_only");
  if (code === "42501") return fail("forbidden");
  // 23xxx integrity (FK / check / unique), 22xxx bad data, P0001 immutability guards
  if (code && (code.startsWith("23") || code.startsWith("22") || code === "P0001")) return fail("invalid");
  return null;
}
