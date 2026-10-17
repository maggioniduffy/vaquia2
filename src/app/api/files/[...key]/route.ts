import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { isSafeKey, isUuid } from "@/lib/storage/keys";

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse("Not found", { status: 404 });

// Authenticated download. The key must start with the caller's current company AND belong to a
// qualification that is visible under RLS; anything else is a 404 (no existence leak).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { key: segments } = await params;
  const key = segments.join("/");
  if (!isSafeKey(key) || !isUuid(segments[0] ?? "")) return notFound();

  const allowed = await withUser(session.user.id, async (db) => {
    const company = await db.query<{ id: string | null }>(
      "select public.current_company_id() as id",
    );
    if (company.rows[0]?.id !== segments[0]) return false;
    const found = await db.query("select 1 from public.qualifications where file_path = $1", [key]);
    return (found.rowCount ?? 0) > 0;
  });
  if (!allowed) return notFound();

  const file = await getStorage().get(key);
  if (!file) return notFound();

  const filename = segments[segments.length - 1] ?? "archivo";
  const headers = new Headers({
    "Content-Type": file.contentType,
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (file.size !== null) headers.set("Content-Length", String(file.size));
  return new NextResponse(file.body, { headers });
}
