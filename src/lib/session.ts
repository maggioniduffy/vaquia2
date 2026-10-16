import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

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

// One lookup per request. Redirects to /login if there is no valid session.
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) redirect("/login");

  const { data, error } = await supabase.rpc("my_companies");
  if (error) throw error;

  const companies: CompanyMembership[] = (data ?? []).map((row) => ({
    companyId: row.company_id,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
  }));

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    companies,
    active: companies.find((c) => c.isActive) ?? null,
  };
});

const FIELD_ROLES: readonly Role[] = ["worker", "supervisor"];

export function homePathFor(role: Role | undefined): "/field" | "/dashboard" {
  return role && FIELD_ROLES.includes(role) ? "/field" : "/dashboard";
}
