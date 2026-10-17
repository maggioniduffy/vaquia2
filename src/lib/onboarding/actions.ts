"use server";

import { redirect } from "next/navigation";
import { t } from "@/i18n/es-AR";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { onboardingSchema } from "./schema";

export type OnboardingState = {
  error?: string;
  fieldErrors?: Partial<Record<"fullName" | "dni" | "companyName" | "cuit", string>>;
  values?: { fullName: string; dni: string; companyName: string; cuit: string };
};

const e = t.onboarding.errors;

const PG_MESSAGE_FIELD: Record<string, keyof NonNullable<OnboardingState["fieldErrors"]>> = {
  invalid_name: "companyName",
  invalid_full_name: "fullName",
  invalid_cuit: "cuit",
  invalid_dni: "dni",
};
const PG_MESSAGE_TEXT: Record<string, string> = {
  invalid_name: e.invalidName,
  invalid_full_name: e.invalidFullName,
  invalid_cuit: e.invalidCuit,
  invalid_dni: e.invalidDni,
};

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

// The database function is the authority (guest / already-member checks live there too); the
// zod pass only gives clean field errors before the round trip.
export async function createCompany(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const values = {
    fullName: str(formData, "fullName"),
    dni: str(formData, "dni"),
    companyName: str(formData, "companyName"),
    cuit: str(formData, "cuit"),
  };
  const session = await getSession();
  if (session.isGuest || session.active) return { error: e.notAllowed, values };

  const parsed = onboardingSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: NonNullable<OnboardingState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]) as keyof typeof fieldErrors;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, values };
  }
  const { fullName, dni, companyName, cuit } = parsed.data;

  try {
    await withUser(session.userId, (db) =>
      db.query("select public.create_company($1, $2, $3, $4) as id", [
        companyName,
        cuit,
        fullName,
        dni,
      ]),
    );
  } catch (err) {
    const { code, message } = err as { code?: string; message?: string };
    if (code === "23505") return { error: e.duplicate, values };
    if (code === "42501") return { error: e.notAllowed, values };
    const field = code === "22023" && message ? PG_MESSAGE_FIELD[message] : undefined;
    if (field && message) return { fieldErrors: { [field]: PG_MESSAGE_TEXT[message] }, values };
    return { error: e.generic, values };
  }
  redirect("/dashboard");
}
