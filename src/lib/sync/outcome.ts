// How the device interprets a sync response. Terminal codes are kept on the device and flagged
// (never retried blindly, never dropped); everything else retries with backoff.

export const TERMINAL_CODES = [
  "read_only", // VQ001: trial expired while offline
  "forbidden", // membership revoked / role lost
  "wrong_company", // item belongs to a company that is not the active one
  "id_conflict", // the id exists and is not visible to the caller
  "invalid", // payload / envelope rejected by the server (retrying cannot help)
  "blob_rejected", // wrong type, too large, rejected for guests
  "blob_conflict", // same blob id already stored with different bytes
] as const;
export type TerminalCode = (typeof TERMINAL_CODES)[number];

export type RetryCode = "unauthorized" | "rate_limited" | "server_error" | "network" | "blob_missing";

export type SyncOutcome =
  | { kind: "ok"; conflict: boolean }
  | { kind: "terminal"; code: TerminalCode }
  | { kind: "retry"; code: RetryCode; retryAfterMs?: number };

const isTerminal = (value: unknown): value is TerminalCode =>
  typeof value === "string" && (TERMINAL_CODES as readonly string[]).includes(value);

/** Body shape of every endpoint: `{ ok: true, conflict? }` or `{ error: code }`. */
export function classifyResponse(
  status: number,
  body: unknown,
  retryAfter?: string | null,
): SyncOutcome {
  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300 && obj.ok === true) {
    return { kind: "ok", conflict: obj.conflict === true };
  }
  if (isTerminal(obj.error)) return { kind: "terminal", code: obj.error };
  if (status === 401) return { kind: "retry", code: "unauthorized" };
  if (obj.error === "blob_missing") return { kind: "retry", code: "blob_missing" };
  if (status === 429) {
    const seconds = Number(retryAfter);
    return {
      kind: "retry",
      code: "rate_limited",
      retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
    };
  }
  return { kind: "retry", code: "server_error" };
}
