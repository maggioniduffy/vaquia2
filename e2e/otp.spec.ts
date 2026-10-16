import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

// The server appends every outgoing email here (EMAIL_OUTBOX_FILE, see playwright.config.ts).
const OUTBOX = process.env.E2E_OUTBOX_FILE ?? path.resolve(".e2e-outbox.jsonl");

// Seeded users used only by these tests (scripts/seed.mts). OTP state is per email on the server.
const OTP_EMAIL = "otp@petrosur.test";
const LOCK_EMAIL = "otp-lock@petrosur.test";
const UNKNOWN_EMAIL = "nobody@unknown.test";

const CODE_SENT = "Si el email corresponde a un usuario, enviamos un código de 6 dígitos.";
const CODE_INVALID = "El código es incorrecto. Revisarlo e intentar de nuevo.";
const TOO_MANY_ATTEMPTS = "Demasiados intentos. Pedir un código nuevo.";
const SKIP_REASON = "OTP state is shared per email; runs once, in desktop-light";

test.describe.configure({ mode: "serial" });

type OutboxLine = { to: string; subject: string; text: string; at: string };

async function readOutbox(): Promise<OutboxLine[]> {
  let raw: string;
  try {
    raw = await readFile(OUTBOX, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as OutboxLine);
}

// The outbox is not truncated between runs, so only lines written after `after` count.
async function latestCode(email: string, after: Date): Promise<string> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const matches = (await readOutbox()).filter(
      (line) => line.to === email && new Date(line.at).getTime() > after.getTime(),
    );
    const newest = matches[matches.length - 1];
    const code = newest?.text.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    if (Date.now() > deadline) {
      throw new Error(`No OTP email for ${email} after ${after.toISOString()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function requestCode(page: Page, email: string): Promise<Date> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Ingresar con código por email" }).click();
  await page.getByLabel("Email").fill(email);
  const requestedAt = new Date();
  await page.getByRole("button", { name: "Enviar código", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: CODE_SENT })).toBeVisible();
  return requestedAt;
}

async function submitCode(page: Page, code: string) {
  await page.getByLabel("Código", { exact: true }).fill(code);
  // Wait for the server action to answer so a previous alert cannot satisfy the next assertion.
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await answered;
}

function wrongCodeFor(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

test("code login: supervisor signs in with the emailed code", async ({ page }, info: TestInfo) => {
  test.skip(info.project.name !== "desktop-light", SKIP_REASON);
  const requestedAt = await requestCode(page, OTP_EMAIL);
  const code = await latestCode(OTP_EMAIL, requestedAt);

  await submitCode(page, code);

  await expect(page).toHaveURL(/\/field$/);
  await expect(page.getByTestId("company-name")).toHaveText("Petrosur Servicios SRL");
});

test("a wrong code shows the error and stays on the code step", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-light", SKIP_REASON);
  const requestedAt = await requestCode(page, OTP_EMAIL);
  const code = await latestCode(OTP_EMAIL, requestedAt);

  await submitCode(page, wrongCodeFor(code));

  await expect(page.getByRole("alert").filter({ hasText: CODE_INVALID })).toBeVisible();
  await expect(page.getByLabel("Código", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("three wrong codes lock the email; the right code is then refused", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-light", SKIP_REASON);
  const requestedAt = await requestCode(page, LOCK_EMAIL);
  const code = await latestCode(LOCK_EMAIL, requestedAt);

  // Better Auth counts attempts before comparing: the 3rd wrong code is still a plain
  // "incorrect" (the budget is 3 and it is spent on the 3rd check). The lock shows on the
  // next submission, even with the right code.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await submitCode(page, wrongCodeFor(code));
    await expect(page.getByRole("alert").filter({ hasText: CODE_INVALID })).toBeVisible();
  }
  await submitCode(page, code);

  await expect(page.getByRole("alert").filter({ hasText: TOO_MANY_ATTEMPTS })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: CODE_INVALID })).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test("an unknown email gets the same answer and no email is sent", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-light", SKIP_REASON);
  // requestCode asserts the same status message a known email gets.
  await requestCode(page, UNKNOWN_EMAIL);

  const sent = (await readOutbox()).filter((line) => line.to === UNKNOWN_EMAIL);
  expect(sent).toHaveLength(0);
});
