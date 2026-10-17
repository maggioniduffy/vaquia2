import { expect, test, type TestInfo } from "@playwright/test";
import { latestCode, requestCode, submitCode } from "./helpers";

// Seeded users used only by these tests (scripts/seed.mts). OTP state is per email on the server.
const OTP_EMAIL = "otp@petrosur.test";
const LOCK_EMAIL = "otp-lock@petrosur.test";
const UNKNOWN_EMAIL = "nobody@unknown.test";

const CODE_INVALID = "El código es incorrecto. Revisarlo e intentar de nuevo.";
const TOO_MANY_ATTEMPTS = "Demasiados intentos. Pedir un código nuevo.";
const SKIP_REASON = "OTP edge cases run once, in desktop-light";

test.describe.configure({ mode: "serial" });

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

test("an unknown email gets the same answer and a code (open sign-up)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-light", SKIP_REASON);
  // Phase 1b: sign-up is open, so an unknown email is a new user and receives a code like any other.
  // requestCode asserts the same status message a known email gets.
  const requestedAt = await requestCode(page, UNKNOWN_EMAIL);

  expect(await latestCode(UNKNOWN_EMAIL, requestedAt)).toMatch(/^\d{6}$/);
});
