import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { CODE_SENT, latestCode } from "./helpers";

// Self-serve sign-up: new email (OTP) → /signup → /onboarding wizard → /dashboard with checklist.
// Creates real users and companies in the database the server uses. Companies cannot be deleted
// (audit_log is ON DELETE RESTRICT), so the e2e company names carry the E2E_PREFIX and stay.

// Next loads .env.local for the server; Playwright does not, and the spec needs DATABASE_URL.
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides DATABASE_URL directly.
}

const E2E_PREFIX = "E2E Onboarding";
const E2E_EMAIL_DOMAIN = "@e2e.test";
const SKIP_REASON = "creates real users and companies; runs once, in desktop-light";

const DNI = "30456789";
const PERSON = "Ana Pérez E2E";
const ALERT_CUIT = "El CUIT no es válido. Revisar los dígitos.";
const ALERT_DUPLICATE =
  "Esta empresa ya tiene una cuenta en Vaquia. Solicitar acceso al administrador de la empresa.";

// Valid AFIP CUIT (prefix 30, mod-11 check digit) with a random body, so every run is unique.
function randomCuit(): string {
  const body = `30${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const total = [...body].reduce((sum, digit, i) => sum + Number(digit) * weights[i]!, 0);
  const rest = total % 11;
  const check = rest === 0 ? 0 : 11 - rest;
  return check === 10 ? randomCuit() : `${body}${check}`;
}

function uniqueEmail(): string {
  return `e2e-onb-${Date.now()}-${randomInt(0, 1_000_000)}${E2E_EMAIL_DOMAIN}`;
}

function uniqueCompanyName(): string {
  return `${E2E_PREFIX} ${Date.now()}-${randomInt(0, 1_000_000)}`;
}

const createdEmails: string[] = [];
const createdCompanyNames: string[] = [];

// Owner connection (bypasses RLS). Used only for the duplicate-CUIT fixture and cleanup.
async function withOwnerDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// /signup: request the code, then submit it with the sign-up button (not the login one).
async function signUpWithCode(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  const requestedAt = new Date();
  await page.getByRole("button", { name: "Enviar código", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: CODE_SENT })).toBeVisible();
  const code = await latestCode(email, requestedAt);

  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

// Step 1 of the wizard: persona. Step 2 becomes visible on success.
async function fillPersonaStep(page: Page) {
  await expect(page.getByRole("heading", { name: "Crear la empresa" })).toBeVisible();
  await page.getByLabel("Nombre completo", { exact: true }).fill(PERSON);
  await page.getByLabel("DNI", { exact: true }).fill(DNI);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("Paso 2 de 2")).toBeVisible();
}

test.describe("self-serve onboarding", () => {
  test.afterAll(async () => {
    // Best effort: companies are RESTRICTed by audit_log, so they are expected to stay.
    await withOwnerDb(async (client) => {
      for (const name of createdCompanyNames) {
        await client.query("delete from companies where name = $1", [name]).catch((error) => {
          console.warn(`[e2e cleanup] company "${name}" kept: ${(error as Error).message}`);
        });
      }
      for (const email of createdEmails) {
        await client.query("delete from users where email = $1", [email]).catch((error) => {
          console.warn(`[e2e cleanup] user ${email} kept: ${(error as Error).message}`);
        });
      }
    });
  });

  test("new email signs up, creates the company and lands on the checklist with the trial", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop-light", SKIP_REASON);
    const email = uniqueEmail();
    const companyName = uniqueCompanyName();
    createdEmails.push(email);
    createdCompanyNames.push(companyName);

    await signUpWithCode(page, email);
    await fillPersonaStep(page);

    await page.getByLabel("Nombre de la empresa", { exact: true }).fill(companyName);
    await page.getByLabel("CUIT de la empresa", { exact: true }).fill(randomCuit());
    await page.getByRole("button", { name: "Crear empresa", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("onboarding-checklist")).toBeVisible();
    await expect(page.getByTestId("onboarding-checklist")).toContainText("0 de 4");
    await expect(page.getByTestId("trial-banner")).toContainText("quedan 30 días");
  });

  test("an invalid CUIT is blocked in the wizard and nothing is created", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop-light", SKIP_REASON);
    const email = uniqueEmail();
    createdEmails.push(email);

    await signUpWithCode(page, email);
    await fillPersonaStep(page);

    await page.getByLabel("Nombre de la empresa", { exact: true }).fill("E2E Cuit Invalido");
    // Last digit wrong: the check digit does not match (client shows it, server would reject).
    const valid = randomCuit();
    const wrongLast = (Number(valid.slice(-1)) + 1) % 10;
    await page
      .getByLabel("CUIT de la empresa", { exact: true })
      .fill(`${valid.slice(0, 10)}${wrongLast}`);

    await expect(page.getByRole("alert").filter({ hasText: ALERT_CUIT })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear empresa", exact: true })).toBeDisabled();
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("a CUIT that already belongs to a company shows the duplicate message", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop-light", SKIP_REASON);
    const email = uniqueEmail();
    const existingName = uniqueCompanyName();
    const cuit = randomCuit();
    createdEmails.push(email);
    createdCompanyNames.push(existingName);

    await withOwnerDb((client) =>
      client.query("insert into companies (name, cuit, plan) values ($1, $2, 'paid')", [
        existingName,
        cuit,
      ]),
    );

    await signUpWithCode(page, email);
    await fillPersonaStep(page);
    await page.getByLabel("Nombre de la empresa", { exact: true }).fill("E2E Duplicada");
    await page.getByLabel("CUIT de la empresa", { exact: true }).fill(cuit);
    await page.getByRole("button", { name: "Crear empresa", exact: true }).click();

    await expect(page.getByRole("alert").filter({ hasText: ALERT_DUPLICATE })).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});
