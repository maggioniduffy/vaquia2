import { randomInt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { CODE_SENT, latestCode } from "./helpers";

// Invitation flow: admin grants access to a new email from a persona → the invitee signs up with
// that email (code from the outbox) → lands on /invitations → accepts → is in the company.
// The admin is a fresh self-serve user who creates their own company, so this does not depend on
// the seed. Companies cannot be deleted (audit_log RESTRICT), so the E2E_PREFIX name stays.

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides DATABASE_URL directly.
}

const E2E_PREFIX = "E2E Invitacion";
const E2E_EMAIL_DOMAIN = "@e2e.test";
const SKIP_REASON = "creates real users and companies; runs once, in desktop-light";

// Valid AFIP CUIT (prefix 30, mod-11 check digit) with a random body.
function randomCuit(): string {
  const body = `30${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const total = [...body].reduce((sum, digit, i) => sum + Number(digit) * weights[i]!, 0);
  const rest = total % 11;
  const check = rest === 0 ? 0 : 11 - rest;
  return check === 10 ? randomCuit() : `${body}${check}`;
}

const stamp = () => `${Date.now()}-${randomInt(0, 1_000_000)}`;
const uniqueEmail = (tag: string) => `e2e-inv-${tag}-${stamp()}${E2E_EMAIL_DOMAIN}`;

const createdEmails: string[] = [];
const createdCompanyNames: string[] = [];

async function withOwnerDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// /signup → code from the outbox → "Crear cuenta". Ends on `expectedPath` (after the redirect).
async function signUpWithCode(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  const requestedAt = new Date();
  await page.getByRole("button", { name: "Enviar código", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: CODE_SENT })).toBeVisible();
  const code = await latestCode(email, requestedAt);
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

test.describe("invitations", () => {
  test.afterAll(async () => {
    // Best effort: companies stay (audit_log RESTRICT); users with companies stay (created_by FK).
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

  test("admin grants access by email, the invitee accepts and lands in the company", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop-light", SKIP_REASON);
    const adminEmail = uniqueEmail("admin");
    const inviteeEmail = uniqueEmail("invitee");
    const companyName = `${E2E_PREFIX} ${stamp()}`;
    createdEmails.push(adminEmail, inviteeEmail);
    createdCompanyNames.push(companyName);

    // 1. Admin creates the company (wizard) with one persona.
    await signUpWithCode(page, adminEmail, /\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Crear la empresa" })).toBeVisible();
    await page.getByLabel("Nombre completo", { exact: true }).fill("Admin E2E");
    await page.getByLabel("DNI", { exact: true }).fill("30111222");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByLabel("Nombre de la empresa", { exact: true }).fill(companyName);
    await page.getByLabel("CUIT de la empresa", { exact: true }).fill(randomCuit());
    await page.getByRole("button", { name: "Crear empresa", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // 2. Grant access to a second persona: the wizard's persona is already the admin's own
    // (it has access), so the invitee's persona is inserted with no membership.
    const personaId = await withOwnerDb(async (client) => {
      const r = await client.query<{ id: string }>(
        `insert into personas (company_id, full_name, dni)
           select c.id, $2, $3 from companies c where c.name = $1
         returning id`,
        [companyName, "Invitado E2E", `99${String(randomInt(0, 100_000_000)).padStart(8, "0")}`],
      );
      return r.rows[0]!.id;
    });
    await page.goto(`/people/${personaId}`);
    await page.getByRole("button", { name: "Dar acceso", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Correo electrónico").fill(inviteeEmail);
    await dialog.getByRole("button", { name: "Dar acceso", exact: true }).click();
    await expect(page.getByText("Invitación enviada.", { exact: true })).toBeVisible();

    // 3. Admin signs out; the invitee signs up with the invited email.
    await page.context().clearCookies();
    await signUpWithCode(page, inviteeEmail, /\/invitations$/);

    // 4. The invitation is listed for that email; accepting puts them in the company.
    await expect(page.getByRole("heading", { name: "Invitaciones", exact: true })).toBeVisible();
    await expect(page.getByText(companyName)).toBeVisible();
    await page.getByRole("button", { name: "Aceptar", exact: true }).click();

    await expect(page).not.toHaveURL(/\/invitations$/);
    await expect(page.getByTestId("company-name")).toHaveText(companyName);
  });
});
