import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

// The server appends every outgoing email here (EMAIL_OUTBOX_FILE, see playwright.config.ts).
const OUTBOX = process.env.E2E_OUTBOX_FILE ?? path.resolve(".e2e-outbox.jsonl");

export const CODE_SENT = "Si el email corresponde a un usuario, enviamos un código de 6 dígitos.";

type OutboxLine = { to: string; subject: string; text: string; at: string };

export async function readOutbox(): Promise<OutboxLine[]> {
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
export async function latestCode(email: string, after: Date): Promise<string> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const matches = (await readOutbox()).filter(
      (line) => line.to === email && new Date(line.at).getTime() > after.getTime(),
    );
    const code = matches.at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    if (Date.now() > deadline) {
      throw new Error(`No OTP email for ${email} after ${after.toISOString()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function requestCode(page: Page, email: string): Promise<Date> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  const requestedAt = new Date();
  await page.getByRole("button", { name: "Enviar código", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: CODE_SENT })).toBeVisible();
  return requestedAt;
}

export async function submitCode(page: Page, code: string) {
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

export async function login(page: Page, email: string) {
  const requestedAt = await requestCode(page, email);
  await submitCode(page, await latestCode(email, requestedAt));
}
