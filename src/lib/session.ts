import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { withUser } from "@/lib/db";

export type Role = "worker" | "supervisor" | "hse" | "manager" | "admin";

export type CompanyMembership = {
  companyId: string;
  name: string;
  role: Role;
  isActive: boolean;
};

export type Session = {
  userId: string;
  email: string;
  companies: CompanyMembership[];
  active: CompanyMembership | null;
};

type CompanyRow = { company_id: string; name: string; role: Role; is_active: boolean };

// Validated session (cookie → sessions table). Redirects to /login if missing or expired.
export const getUserId = cache(async (): Promise<{ userId: string; email: string }> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return { userId: session.user.id, email: session.user.email };
});

// One lookup per request.
export const getSession = cache(async (): Promise<Session> => {
  const { userId, email } = await getUserId();
  const rows = await withUser(userId, async (db) => {
    const result = await db.query<CompanyRow>(
      "select company_id, name, role, is_active from public.my_companies()",
    );
    return result.rows;
  });

  const companies = rows.map((row) => ({
    companyId: row.company_id,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
  }));

  return {
    userId,
    email,
    companies,
    active: companies.find((c) => c.isActive) ?? null,
  };
});

const FIELD_ROLES: readonly Role[] = ["worker", "supervisor"];

export function homePathFor(role: Role | undefined): "/field" | "/dashboard" {
  return role && FIELD_ROLES.includes(role) ? "/field" : "/dashboard";
}
