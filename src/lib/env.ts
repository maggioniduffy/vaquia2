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
  // Any SMTP server, e.g. Gmail: smtp.gmail.com, port 465, user = the Gmail address,
  // password = a Google app password (not the account password).
  get smtp() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    if (!host || !user || !password) return null;
    return { host, port: Number(process.env.SMTP_PORT ?? 465), user, password };
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "Vaquia <no-reply@vaquia.local>";
  },
  // Test-only: append outgoing emails as JSON lines to this file (see src/lib/email.ts).
  get emailOutboxFile() {
    return process.env.EMAIL_OUTBOX_FILE;
  },
  // Temporary guest sessions for demos: on unless GUEST_LOGIN_ENABLED=false. Guests join the
  // demo company created by db/migrations/*_demo_company.sql.
  get guestLoginEnabled() {
    return process.env.GUEST_LOGIN_ENABLED !== "false";
  },
};
