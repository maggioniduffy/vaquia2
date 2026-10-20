import { randomInt } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { CODE_SENT, latestCode } from "./helpers";

// Field capture offline (phase 2.8): with the network off, a supervisor fills a toolbox talk, signs
// for every attendee on the canvas and submits; back online the outbox syncs it, the server holds
// exactly one record with its participants and signatures, and a replayed envelope is idempotent.
// The app is served by `pnpm start`, so the Serwist worker is active (it is disabled in dev).
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

type CapturedRows = Awaited<ReturnType<typeof readCaptured>>;

async function readCaptured(companyId: string) {
  return withOwnerDb(async (c) => {
    const records = await c.query<{ id: string; payload: Record<string, unknown> }>(
      `select r.id, r.payload from records r join record_types t on t.id = r.record_type_id
        where r.company_id = $1 and t.code = 'toolbox_talk'`,
      [companyId],
    );
    const id = records.rows[0]?.id;
    const participants = await c.query<{ full_name: string; role: string }>(
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
}

/** The server write is async even after the outbox empties; poll before asserting on it. */
async function waitForCaptured(companyId: string): Promise<CapturedRows> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const rows = await readCaptured(companyId);
    if (rows.records.length > 0 || Date.now() > deadline) return rows;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

test("offline toolbox talk syncs once back online and a replay is idempotent", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop-light", SKIP_REASON);
  // Playwright's offline emulation does not cover the service worker's network, so Background
  // Sync could flush the outbox during the "airplane mode" phase. Disable only that trigger here
  // (the SW runner is covered by the unit/db suites) so "offline" really means nothing is sent.
  await context.addInitScript(() => {
    if (typeof ServiceWorkerRegistration === "undefined") return;
    Object.defineProperty(ServiceWorkerRegistration.prototype, "sync", {
      configurable: true,
      get: () => undefined,
    });
  });
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
  // Labels carry the required marker (`Tema *`), so select by the field id (the DSL key).
  const topicInput = page.locator("#topic");
  await expect(topicInput).toBeVisible();
  const crewSelect = page.locator("#crew");
  await expect(crewSelect.locator("option", { hasText: "Cuadrilla E2E" })).toHaveCount(1);
  await expect(page.locator("#location").locator("option", { hasText: "Pozo E2E 1" })).toHaveCount(1);

  // 3. Offline: fill, sign, submit.
  await context.setOffline(true);
  await topicInput.fill(topic);
  await crewSelect.selectOption({ label: "Cuadrilla E2E" });
  // Location auto-fills from the crew.
  await expect(page.locator("#location")).toHaveValue(/.+/);
  await page.getByRole("button", { name: /^Agregar 2 personas de la cuadrilla$/ }).click();
  await expect(page.getByText("2 asistentes", { exact: true })).toBeVisible();
  await expect(page.locator("#attendees ul li")).toHaveCount(2);
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

  // The sync indicator shows the pending record; nothing reached the server. It is an anchor with
  // an explicit `role="status"` (the live region), so query the element, not the link role.
  const indicator = page.locator('header a[role="status"][href="/field/sync"]');
  await expect(indicator).toBeVisible();
  await expect(indicator).toContainText("1 pendiente");
  expect(posted).toHaveLength(0);
  expect(
    await withOwnerDb(async (c) => (await c.query("select 1 from records where company_id = $1", [companyId])).rowCount),
  ).toBe(0);

  // 4. Back online: the `online` event triggers the runner.
  await context.setOffline(false);
  await expect(indicator).toContainText("Sincronizado", { timeout: 30_000 });

  const rows = await waitForCaptured(companyId);
  expect(rows.records).toHaveLength(1);
  expect(rows.records[0]!.payload.topic).toBe(topic);
  expect(rows.participants.map((p) => p.full_name).sort()).toEqual([...ATTENDEES].sort());
  expect(rows.participants.every((p) => p.role === "attendee")).toBe(true);
  expect(rows.signatures.map((s) => s.full_name).sort()).toEqual([...ATTENDEES].sort());

  // Signature files are served from the storage driver and are PNGs; `content_hash` is the hash of
  // the signed record content (same for every signer), not a digest of the PNG bytes.
  for (const sig of rows.signatures) {
    expect(sig.content_hash).toMatch(/^[0-9a-f]{64}$/);
    const file = await page.request.get(`/api/files/${sig.image_path}`);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toContain("image/png");
    const bytes = await file.body();
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  }
  expect(new Set(rows.signatures.map((s) => s.content_hash)).size).toBe(1);

  // 5. Duplicate submit: replay the same envelope; ok without conflict, still one record.
  expect(posted.length).toBeGreaterThanOrEqual(1);
  expect(recordResponses.at(-1)).toMatchObject({ status: 200 });
  const envelope = JSON.parse(posted.at(-1)!) as Record<string, unknown>;
  const replay = await page.request.post("/api/sync/records", { data: envelope });
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

/** Waits until the Serwist worker controls the page (registered in production, i.e. `pnpm start`). */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const controlled = () => page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  if (!(await controlled())) await page.reload();
  await expect.poll(controlled, { timeout: 15_000 }).toBe(true);
}

test("reloading while offline keeps the draft and its attendees", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-light", SKIP_REASON);
  const email = `e2e-cap-offline-${stamp()}${E2E_EMAIL_DOMAIN}`;
  const companyName = `${E2E_PREFIX} Offline ${stamp()}`;
  const topic = `Borrador offline ${stamp()}`;

  await createCompany(page, email, companyName);
  await seedCrew(companyName, email);

  // Open the deep link online so the page is visited once and the draft starts.
  await page.goto("/field/capture#/new/toolbox_talk");
  await expect(page.locator("#topic")).toBeVisible();
  await expect(page.locator("#crew").locator("option", { hasText: "Cuadrilla E2E" })).toHaveCount(1);
  await page.waitForURL(/#\/[0-9a-f-]{36}$/);

  // The first visit registers the worker; a reload online leaves the page controlled and cached.
  await waitForServiceWorker(page);
  await expect(page.locator("#topic")).toBeVisible();

  await page.locator("#topic").fill(topic);
  await page.locator("#crew").selectOption({ label: "Cuadrilla E2E" });
  await page.getByRole("button", { name: /^Agregar 2 personas de la cuadrilla$/ }).click();
  await expect(page.locator("#attendees ul li")).toHaveCount(2);

  // Autosave is debounced 300 ms; give Dexie a beat before cutting the network.
  await page.waitForTimeout(1_000);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  // Acceptance: no data loss on app reload while offline (page served by the SW cache).
  await expect(page.locator("#topic")).toHaveValue(topic);
  await expect(page.locator("#crew")).toHaveValue(/.+/);
  await expect(page.locator("#attendees ul li")).toHaveCount(2);
});

test("both capture forms fit a 360px screen with touch-sized controls", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-light", SKIP_REASON);
  const email = `e2e-cap-mobile-${stamp()}${E2E_EMAIL_DOMAIN}`;
  const companyName = `${E2E_PREFIX} Mobile ${stamp()}`;

  await createCompany(page, email, companyName);
  await seedCrew(companyName, email);
  await page.setViewportSize({ width: 360, height: 740 });

  for (const [code, marker] of [
    ["toolbox_talk", "#topic"],
    ["ats", "#task_type"],
  ] as const) {
    await page.goto(`/field/capture#/new/${code}`);
    await expect(page.locator(marker)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${code}: page overflows horizontally at 360px`).toBeLessThanOrEqual(0);

    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'main input:not([type="checkbox"]):not([type="radio"]), main select, main textarea, main button',
        ),
      ]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({ html: el.outerHTML.slice(0, 120), height: Math.round(el.getBoundingClientRect().height) }))
        .filter((el) => el.height < 44),
    );
    expect(small, `${code}: controls under 44px at 360px`).toEqual([]);
  }
});
