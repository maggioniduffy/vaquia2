function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

// Server-only configuration. Read lazily so `next build` works without secrets.
export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("BETTER_AUTH_SECRET");
  },
  // Vercel preview deployments get a per-deploy URL; fall back to it when no explicit URL is set.
  get siteUrl() {
    return (
      process.env.BETTER_AUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    );
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "Vaquia <no-reply@vaquia.local>";
  },
  // Test-only: append outgoing emails as JSON lines to this file (see src/lib/email.ts).
  get emailOutboxFile() {
    return process.env.EMAIL_OUTBOX_FILE;
  },
  // Temporary guest sessions for demos. Needs the flag AND a demo company to attach guests to.
  get guestLoginEnabled() {
    return process.env.GUEST_LOGIN_ENABLED === "true" && Boolean(process.env.GUEST_COMPANY_ID);
  },
  get guestCompanyId() {
    return process.env.GUEST_COMPANY_ID;
  },
};
