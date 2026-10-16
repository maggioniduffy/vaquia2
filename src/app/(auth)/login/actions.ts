"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { t } from "@/i18n/es-AR";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";

export type LoginState = { error?: string; info?: string; step?: "code"; email?: string };

function readEmail(formData: FormData): string {
  return String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
}

export async function sendCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = readEmail(formData);
  if (!email) return { error: t.auth.genericError };

  try {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  } catch {
    return { error: t.auth.genericError };
  }
  // Same answer whether or not the email exists, to avoid account enumeration.
  return { step: "code", email, info: t.auth.codeSent };
}

export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = readEmail(formData);
  const otp = String(formData.get("code") ?? "").trim();
  if (!email) return { error: t.auth.genericError };
  if (!/^\d{6}$/.test(otp)) return { step: "code", email, error: t.auth.codeInvalid };

  try {
    await auth.api.signInEmailOTP({ body: { email, otp }, headers: await headers() });
  } catch (error) {
    const code =
      error instanceof APIError ? (error.body as { code?: string } | undefined)?.code : undefined;
    const message =
      code === "TOO_MANY_ATTEMPTS"
        ? t.auth.codeTooManyAttempts
        : code === "OTP_EXPIRED"
          ? t.auth.codeExpired
          : t.auth.codeInvalid;
    return { step: "code", email, error: message };
  }
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

// Temporary demo access. Only available when GUEST_LOGIN_ENABLED and GUEST_COMPANY_ID are set.
export async function signInAsGuest(): Promise<void> {
  if (!env.guestLoginEnabled) throw new Error("Guest login is disabled");
  await auth.api.signInAnonymous({ headers: await headers() });
  redirect("/");
}
