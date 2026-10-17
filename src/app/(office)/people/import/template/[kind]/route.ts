import { NextResponse } from "next/server";
import { templateCsv } from "@/lib/people/import";

const FILES = {
  personas: "plantilla-personal.csv",
  capacitaciones: "plantilla-capacitaciones.csv",
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "personas" && kind !== "capacitaciones") {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(templateCsv(kind), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FILES[kind]}"`,
    },
  });
}
