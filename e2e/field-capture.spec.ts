import { createHash, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { CODE_SENT, latestCode } from "./helpers";

// Field capture offline (phase 2.8): with the network off, a supervisor fills a toolbox talk, signs
// for every attendee on the canvas and submits; back online the outbox syncs it, the server holds
// exactly one record with its participants and signatures, and a replayed envelope is idempotent.
// The service worker is off outside production; the Dexie outbox works once the page is loaded.
// Each run creates its own company through self-serve sign-up. Companies cannot be deleted
// (audit_log RESTRICT), so the E2E_PREFIX name stays.

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides DATABASE_URL directly.
}

const E2E_PREFIX = "E2E Captura";
const E2E_EMAIL_DOMAIN = "@e2e.test";
const SKIP_REASON = "creates real users and companies; runs once, in desktop-light";
const ATTENDEES = ["Persona Uno E2E", "Persona Dos E2E"];

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

async function withOwnerDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Self-serve sign-up + wizard; leaves the user logged in on /dashboard.
async function createCompany(page: Page, email: string, companyName: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  const requestedAt = new Date();
  await page.getByRole("button", { name: "Enviar código", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: CODE_SENT })).toBeVisible();
  await page.getByLabel("Código", { exact: true }).fill(await latestCode(email, requestedAt));
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Nombre completo", { exact: true }).fill("Supervisor E2E Captura");
  await page.getByLabel("DNI", { exact: true }).fill(String(randomInt(10_000_000, 99_999_999)));
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Nombre de la empresa", { exact: true }).fill(companyName);
  await page.getByLabel("CUIT de la empresa", { exact: true }).fill(randomCuit());
  await page.getByRole("button", { name: "Crear empresa", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

// Direct local-DB setup: location, crew in it, two personas in the crew; the user becomes supervisor.
async function seedCrew(companyName: string, email: string) {
  return withOwnerDb(async (client) => {
    const company = (
      await client.query<{ id: string }>("select id from companies where name = $1", [companyName])
    ).rows[0]!;
    await client.query(
      `update memberships set role = 'supervisor'
        where company_id = $1 and user_id = (select id from users where email = $2)`,
      [company.id, email],
    );
    const location = (
      await client.query<{ id: string }>(
        "insert into locations (company_id, name) values ($1, $2) returning id",
        [company.id, "Pozo E2E 1"],
      )
    ).rows[0]!;
    const crew = (
      await client.query<{ id: string }>(
        "insert into crews (company_id, name, location_id) values ($1, $2, $3) returning id",
        [company.id, "Cuadrilla E2E", location.id],
      )
    ).rows[0]!;
    for (const name of ATTENDEES) {
      await client.query(
        "insert into personas (company_id, full_name, dni, crew_id) values ($1, $2, $3, $4)",
        [company.id, name, String(randomInt(10_000_000, 99_999_999)), crew.id],
      );
    }
    return { companyId: company.id };
  });
}

// Draws a stroke on the (single open) signature canvas with mouse moves.
async function drawSignature(canvas: Locator, page: Page) {
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const x = box.x + 20;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x + i * 12, y + (i % 2 === 0 ? 25 : -25), { steps: 3 });
  }
  await page.mouse.up();
}

test("offline toolbox talk syncs once back online and a replay is idempotent", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop-light", SKIP_REASON);
  const email = `e2e-cap-${stamp()}${E2E_EMAIL_DOMAIN}`;
  const companyName = `${E2E_PREFIX} ${stamp()}`;
  const topic = `Charla offline ${stamp()}`;

  // 1. Company, supervisor, crew + location, two personas.
  await createCompany(page, email, companyName);
  const { companyId } = await seedCrew(companyName, email);

  // The record envelope the runner sends, to replay it later.
  const posted: string[] = [];
  const recordResponses: { status: number; body: string }[] = [];
  page.on("response", async (response) => {
    const request = response.request();
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/sync/records") {
      posted.push(request.postData() ?? "");
      recordResponses.push({ status: response.status(), body: await response.text() });
    }
  });

  // 2. Open the capture deep link online and wait for the reference cache (crew shows up).
  await page.goto("/field/capture#/new/toolbox_talk");
  const topicInput = page.getByLabel("Tema", { exact: true });
  await expect(topicInput).toBeVisible();
  const crewSelect = page.getByLabel("Cuadrilla", { exact: true });
  await expect(crewSelect.locator("option", { hasText: "Cuadrilla E2E" })).toHaveCount(1);
  await expect(page.getByLabel("Locación", { exact: true }).locator("option", { hasText: "Pozo E2E 1" })).toHaveCount(1);

  // 3. Offline: fill, sign, submit.
  await context.setOffline(true);
  await topicInput.fill(topic);
  await crewSelect.selectOption({ label: "Cuadrilla E2E" });
  // Location auto-fills from the crew.
  await expect(page.getByLabel("Locación", { exact: true })).toHaveValue(/.+/);
  await page.getByRole("button", { name: /^Agregar 2 personas de la cuadrilla$/ }).click();
  await expect(page.getByText("2 asistentes", { exact: false }).or(page.getByText(ATTENDEES[0]!).first())).toBeVisible();
  await page.getByRole("button", { name: "Continuar a firmas", exact: true }).click();

  for (const name of ATTENDEES) {
    const row = page.getByRole("listitem").filter({ hasText: name });
    await row.getByRole("button", { name: "Firmar", exact: true }).click();
    await drawSignature(row.locator("canvas"), page);
    await row.getByRole("button", { name: "Confirmar firma", exact: true }).click();
    await expect(row.getByText(/^Firmó /)).toBeVisible();
  }
  await page.getByRole("button", { name: "Guardar y enviar", exact: true }).click();
  await expect(page.getByText("Guardado. Se envía cuando haya conexión.")).toBeVisible();

  // The sync indicator shows the pending record; nothing reached the server.
  const indicator = page.getByRole("link", { name: /pendiente/ }).first();
  await expect(indicator).toBeVisible();
  await expect(indicator).toContainText("1 pendiente");
  expect(posted).toHaveLength(0);
  expect(
    await withOwnerDb(async (c) => (await c.query("select 1 from records where company_id = $1", [companyId])).rowCount),
  ).toBe(0);

  // 4. Back online: the `online` event triggers the runner.
  await context.setOffline(false);
  await expect(page.getByRole("link", { name: "Sincronizado" }).first()).toBeVisible({ timeout: 30_000 });

  const rows = await withOwnerDb(async (c) => {
    const records = await c.query<{ id: string; payload: Record<string, unknown> }>(
      `select r.id, r.payload from records r join record_types t on t.id = r.record_type_id
        where r.company_id = $1 and t.code = 'toolbox_talk'`,
      [companyId],
    );
    const id = records.rows[0]?.id;
    const participants = await c.query(
      "select p.full_name, rp.role from record_participants rp join personas p on p.id = rp.persona_id where rp.record_id = $1",
      [id],
    );
    const signatures = await c.query<{ image_path: string; content_hash: string; full_name: string }>(
      `select s.image_path, s.content_hash, p.full_name from signatures s
         join personas p on p.id = s.persona_id where s.record_id = $1`,
      [id],
    );
    return { records: records.rows, participants: participants.rows, signatures: signatures.rows };
  });
  expect(rows.records).toHaveLength(1);
  expect(rows.records[0]!.payload.topic).toBe(topic);
  expect(rows.participants.map((p) => p.full_name).sort()).toEqual([...ATTENDEES].sort());
  expect(rows.participants.every((p) => p.role === "attendee")).toBe(true);
  expect(rows.signatures.map((s) => s.full_name).sort()).toEqual([...ATTENDEES].sort());

  // Signature files are in the dev storage driver (local disk) and match their content hash.
  const storageRoot = path.resolve(process.env.STORAGE_DIR ?? ".storage");
  for (const sig of rows.signatures) {
    expect(sig.content_hash).toMatch(/^[0-9a-f]{64}$/);
    const bytes = await readFile(path.join(storageRoot, sig.image_path));
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sig.content_hash);
  }

  // 5. Duplicate submit: replay the same envelope; ok without conflict, still one record.
  expect(posted.length).toBeGreaterThanOrEqual(1);
  expect(recordResponses.at(-1)).toMatchObject({ status: 200 });
  const envelope = posted.at(-1)!;
  const replay = await page.request.post("/api/sync/records", {
    data: envelope,
    headers: { "content-type": "application/json" },
  });
  expect(replay.status()).toBe(200);
  const replayBody = (await replay.json()) as { ok?: boolean; conflict?: boolean };
  expect(replayBody.ok).toBe(true);
  expect(replayBody.conflict).toBeFalsy();

  const after = await withOwnerDb(async (c) => ({
    records: (await c.query("select 1 from records where company_id = $1", [companyId])).rowCount,
    conflicts: (await c.query("select 1 from record_conflicts where company_id = $1", [companyId])).rowCount,
    signatures: (await c.query("select 1 from signatures where company_id = $1", [companyId])).rowCount,
    participants: (await c.query("select 1 from record_participants where company_id = $1", [companyId])).rowCount,
  }));
  expect(after).toEqual({ records: 1, conflicts: 0, signatures: 2, participants: 2 });
});
