import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { anonymous, emailOTP } from "better-auth/plugins";
import { t } from "@/i18n/es-AR";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { authOptions } from "@/lib/auth-options";

// Guests always join this company (migration demo_company); it must have plan = 'demo'.
const DEMO_COMPANY_ID = "30000000-0000-7000-8000-000000000001";
const GUEST_EMAIL_DOMAIN = "guest.vaquia.invalid";

// Vercel preview deployments are served from per-deploy hosts; trust them besides the main URL.
const trustedOrigins = [
  env.siteUrl,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  ...authOptions,
  database: pool,
  secret: env.authSecret,
  baseURL: env.siteUrl,
  trustedOrigins,
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const isGuest = (user as { isAnonymous?: boolean | null }).isAnonymous === true;
          if (!isGuest || !env.guestLoginEnabled) return;
          // Owner pool on purpose: auth-side provisioning, there is no tenant session yet.
          await pool.query(
            `insert into memberships (company_id, user_id, role)
             select $1, $2, 'hse'
             where exists (select 1 from companies where id = $1 and plan = 'demo')`,
            [DEMO_COMPANY_ID, user.id],
          );
        },
      },
    },
  },
  plugins: [
    emailOTP({
      // Invite-only: accounts are created by an admin. With sign-up disabled the plugin
      // silently skips unknown emails, so the caller sees the same response either way.
      disableSignUp: true,
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") return;
        await sendEmail({
          to: email,
          subject: t.email.otpSubject,
          text: `${t.email.otpBody} ${otp}\n\n${t.email.otpValidity}`,
        });
      },
    }),
    // Temporary demo feature (see docs/spec/architecture.md). Disabled unless flagged on.
    ...(env.guestLoginEnabled
      ? [
          anonymous({
            emailDomainName: GUEST_EMAIL_DOMAIN,
            generateName: () => t.guest.name,
            schema: { user: { fields: { isAnonymous: "is_anonymous" } } },
          }),
        ]
      : []),
    // Must be last: lets server actions set the session cookie.
    nextCookies(),
  ],
});
