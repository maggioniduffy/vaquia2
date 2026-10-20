import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { MAX_RECORD_BODY_BYTES } from "@/lib/sync/envelope";
import { upsertRecord } from "@/lib/sync/server/records";

export const dynamic = "force-dynamic";

// POST /api/sync/records — idempotent upsert of one record envelope (JSON).
// Logic lives in src/lib/sync/server/records.ts.
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const text = await request.text();
  if (text.length > MAX_RECORD_BODY_BYTES) return NextResponse.json({ error: "invalid" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  const result = await withUser(session.user.id, (db) => upsertRecord(db, getStorage(), body));
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
