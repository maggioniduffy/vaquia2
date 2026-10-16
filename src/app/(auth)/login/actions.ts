"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { t } from "@/i18n/es-AR";
import { auth } from "@/lib/auth";
import { safeNextPath } from "@/lib/routes";

export type LoginState = { error?: string; info?: string };

function readEmail(formData: FormData): string {
  return String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
}

export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: t.auth.invalidCredentials };

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (error) {
    if (
      error instanceof APIError &&
      (error.status === "UNAUTHORIZED" || error.statusCode === 401)
    ) {
      return { error: t.auth.invalidCredentials };
    }
    return { error: t.auth.genericError };
  }
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = readEmail(formData);
  if (!email) return { error: t.auth.genericError };

  const next = safeNextPath(String(formData.get("next") ?? ""));
  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: next, errorCallbackURL: "/login" },
      headers: await headers(),
    });
  } catch {
    return { error: t.auth.genericError };
  }
  // Same answer whether or not the email exists, to avoid account enumeration.
  return { info: t.auth.magicLinkSent };
}
