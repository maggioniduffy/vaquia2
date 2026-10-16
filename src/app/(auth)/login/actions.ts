"use server";

import { redirect } from "next/navigation";
import { t } from "@/i18n/es-AR";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error: error.code === "invalid_credentials" ? t.auth.invalidCredentials : t.auth.genericError,
    };
  }
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = readEmail(formData);
  if (!email) return { error: t.auth.genericError };

  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Invite-only: never create accounts from the login screen.
      shouldCreateUser: false,
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  // Same answer whether or not the email exists (unknown emails are rejected as signups), to avoid
  // account enumeration. Only surface errors the user can act on.
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return { error: t.auth.genericError };
  }
  return { info: t.auth.magicLinkSent };
}
