import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// Emails are appended here by the server (src/lib/email.ts). Specs read it to get OTP codes.
const outboxFile = process.env.E2E_OUTBOX_FILE ?? path.resolve(".e2e-outbox.jsonl");
process.env.E2E_OUTBOX_FILE = outboxFile;

// Fixed id of the seeded "Empresa Demo" company (scripts/seed.mts), used as GUEST_COMPANY_ID.
const GUEST_COMPANY_ID = "30000000-0000-7000-8000-000000000001";

// webServer.env replaces process.env when set, so carry the rest of the environment over
// (DATABASE_URL, BETTER_AUTH_SECRET, ...). Playwright's type wants string values only.
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

// Login → shell must render in light and dark, on mobile and desktop (phase 0 acceptance).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    { name: "desktop-dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
    { name: "mobile-light", use: { ...devices["Pixel 7"], colorScheme: "light" } },
    { name: "mobile-dark", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...inheritedEnv,
          EMAIL_OUTBOX_FILE: outboxFile,
          GUEST_LOGIN_ENABLED: "true",
          GUEST_COMPANY_ID,
        },
      },
});
