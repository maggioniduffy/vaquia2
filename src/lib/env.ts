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
  get siteUrl() {
    return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "Vaquia <no-reply@vaquia.local>";
  },
};
