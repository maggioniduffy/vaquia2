// Pure helpers for storage object keys (no I/O, safe to unit test and import anywhere).
// Key format: {company_id}/qualifications/{qualification_id}/{safe-filename}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export const ALLOWED_FILE_TYPES = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
} as const;

// Vercel caps request bodies at 4.5 MB, and the file travels through a Server Action.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

const EXT_TO_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export function contentTypeForName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_TYPE[ext] ?? "application/octet-stream";
}

/** Detects pdf/jpeg/png from magic bytes; null for anything else. */
export function sniffContentType(bytes: Uint8Array): string | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

/** ASCII-only, no path separators, no leading dots, max 100 chars. Keeps the extension. */
export function sanitizeFilename(name: string, fallbackExt?: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+/, "");
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  const stem = (dot > 0 ? cleaned.slice(0, dot) : cleaned).replace(/[._-]+$/, "");
  const limitedStem = (stem || "archivo").slice(0, Math.max(1, 100 - ext.length));
  const finalExt = ext || (fallbackExt ? `.${fallbackExt}` : "");
  return `${limitedStem}${finalExt}`;
}

/** Throws unless `key` is a relative, normalized, traversal-free path. */
export function assertSafeKey(key: string): void {
  if (!key || key.length > 512 || key.startsWith("/") || key.includes("\\") || key.includes("\0")) {
    throw new Error("Invalid storage key");
  }
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error("Invalid storage key");
  }
}

export function isSafeKey(key: string): boolean {
  try {
    assertSafeKey(key);
    return true;
  } catch {
    return false;
  }
}

export function qualificationFileKey(
  companyId: string,
  qualificationId: string,
  filename: string,
  fallbackExt?: string,
): string {
  if (!isUuid(companyId) || !isUuid(qualificationId)) throw new Error("Invalid storage key");
  const key = `${companyId}/qualifications/${qualificationId}/${sanitizeFilename(filename, fallbackExt)}`;
  assertSafeKey(key);
  return key;
}
