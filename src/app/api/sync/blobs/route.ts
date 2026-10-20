import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { hit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";
import { MAX_ATTACHMENT_BYTES } from "@/lib/sync/envelope";
import { storeBlob } from "@/lib/sync/server/blobs";

export const dynamic = "force-dynamic";

// POST /api/sync/blobs — one signature PNG or photo per request (raw bytes; metadata in X-* headers).
// Logic lives in src/lib/sync/server/blobs.ts.
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = await hit(`sync-blob:${session.user.id}`, { limit: 240, windowSeconds: 60 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: "blob_rejected" }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: "blob_rejected" }, { status: 413 });

  const h = request.headers;
  const result = await withUser(session.user.id, (db) =>
    storeBlob(db, getStorage(), {
      companyId: h.get("x-company-id") ?? "",
      id: h.get("x-blob-id") ?? "",
      kind: h.get("x-blob-kind") ?? "",
      recordId: h.get("x-record-id"),
      mime: (h.get("content-type") ?? "").split(";")[0]!.trim(),
      sha256: h.get("x-blob-sha256") ?? "",
      bytes,
    }),
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
