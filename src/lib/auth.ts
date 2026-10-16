import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { authOptions } from "@/lib/auth-options";

export const auth = betterAuth({
  ...authOptions,
  database: pool,
  secret: env.authSecret,
  baseURL: env.siteUrl,
  plugins: [
    magicLink({
      // Invite-only: accounts are created by an admin, never from the login screen.
      disableSignUp: true,
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        // Unknown addresses get nothing (the caller sees the same response either way).
        const known = await pool.query("select 1 from users where lower(email) = lower($1)", [
          email,
        ]);
        if (known.rowCount === 0) return;
        await sendEmail({
          to: email,
          subject: "Ingresar a Vaquia",
          text: `Usar este enlace para ingresar (vence en 15 minutos):\n\n${url}`,
        });
      },
    }),
    // Must be last: lets server actions set the session cookie.
    nextCookies(),
  ],
});
