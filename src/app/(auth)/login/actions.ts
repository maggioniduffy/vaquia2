"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { t } from "@/i18n/es-AR";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/routes";

export type LoginState = { error?: string; info?: string; step?: "code"; email?: string };

function readEmail(formData: FormData): string {
  return String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

// True when every limit passes (all counters are incremented either way).
async function allowed(...checks: [string, { limit: number; windowSeconds: number }][]) {
  let ok = true;
  for (const [key, cfg] of checks) if (!(await hit(key, cfg)).ok) ok = false;
  return ok;
}

const TEN_MIN = 600;

export async function sendCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = readEmail(formData);
  if (!email) return { error: t.auth.genericError };
  const ip = await clientIp();
  if (
    !(await allowed(
      [`send:email:${email}`, { limit: 5, windowSeconds: TEN_MIN }],
      [`send:ip:${ip}`, { limit: 20, windowSeconds: TEN_MIN }],
    ))
  ) {
    return { error: t.auth.rateLimited };
  }

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

  const ip = await clientIp();
  if (
    !(await allowed(
      [`verify:email:${email}`, { limit: 10, windowSeconds: TEN_MIN }],
      [`verify:ip:${ip}`, { limit: 30, windowSeconds: TEN_MIN }],
    ))
  ) {
    return { step: "code", email, error: t.auth.rateLimited };
  }

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

// Temporary demo access. On unless GUEST_LOGIN_ENABLED=false.
export async function signInAsGuest(): Promise<void> {
  if (!env.guestLoginEnabled) throw new Error("Guest login is disabled");
  if (!(await allowed([`guest:ip:${await clientIp()}`, { limit: 5, windowSeconds: 3600 }]))) {
    throw new Error(t.auth.rateLimited);
  }
  await auth.api.signInAnonymous({ headers: await headers() });
  redirect("/");
}
