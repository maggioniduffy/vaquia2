import type { BetterAuthOptions } from "better-auth";

// Table/column mapping shared by the app and the schema generator. Tables live in `public`
// with snake_case columns; ids are uuid so tenant tables can reference users(id).
export const authOptions = {
  advanced: { database: { generateId: "uuid" } },
  user: {
    modelName: "users",
    fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
  },
  session: {
    // Signed cookie copy of the session, re-validated against the DB after 60 s: saves one query
    // per request. A revoked session stays usable for up to 60 s (tenant access is still enforced
    // by RLS against live memberships on every query).
    cookieCache: { enabled: true, maxAge: 60 },
    modelName: "sessions",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
    },
  },
  account: {
    modelName: "accounts",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "verifications",
    fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
  },
} satisfies Partial<BetterAuthOptions>;

// Linking only happens when the provider reports the email as verified (no `trustedProviders`,
// which would link even with email_verified = false).
export const accountLinking = { enabled: true } satisfies NonNullable<
  BetterAuthOptions["account"]
>["accountLinking"];

/**
 * True when a user about to be created through an OAuth callback has an email the provider did
 * not verify. Such a user would let an attacker pre-register a victim's email (account takeover
 * once the victim signs in by OTP), so creation is refused. OTP users are created verified and
 * guests never go through `/callback/*`.
 */
export function isUnverifiedSocialSignUp(
  user: { emailVerified?: boolean | null },
  context: { path?: string } | null | undefined,
): boolean {
  const path = context?.path ?? "";
  return path.startsWith("/callback/") && user.emailVerified !== true;
}

// Known `?error=` values on /login (anything else is ignored).
export const LOGIN_ERRORS = ["google"] as const;
export type LoginError = (typeof LOGIN_ERRORS)[number];

export function parseLoginError(value: unknown): LoginError | null {
  return LOGIN_ERRORS.find((e) => e === value) ?? null;
}
