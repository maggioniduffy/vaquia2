import { randomInt } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { CODE_SENT, latestCode } from "./helpers";

// Location picker (phase 1b.9): an admin sets a location's coordinates by pasting a Google Maps
// link or by choosing a place search result, the saved point is kept when reopening, and the map
// container renders. Photon (search) and OSM tiles are stubbed so no test depends on them.
// Each test creates its own admin company through self-serve sign-up, so the seed is not needed.
// Companies cannot be deleted (audit_log RESTRICT), so the E2E_PREFIX name stays.

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides DATABASE_URL directly.
}

const E2E_PREFIX = "E2E Ubicacion";
const E2E_EMAIL_DOMAIN = "@e2e.test";

// Google Maps link from the spec, and the coordinates it must produce.
const MAPS_LINK = "https://www.google.com/maps/@-38.9516,-68.0591,15z";
const MAPS_LAT = -38.9516;
const MAPS_LNG = -68.0591;

// Photon GeoJSON result (coordinates are [lng, lat]) for the search test.
const PHOTON_LABEL = "Plaza San Martín, Cutral Có, Neuquén, Argentina";
const PHOTON_LAT = -38.9322;
const PHOTON_LNG = -69.2456;
const PHOTON_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [PHOTON_LNG, PHOTON_LAT] },
      properties: {
        name: "Plaza San Martín",
        city: "Cutral Có",
        state: "Neuquén",
        country: "Argentina",
      },
    },
  ],
};

// 1x1 transparent PNG, returned for every OSM tile so Leaflet does not hit the network.
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const MAP_LABEL = "Mapa para elegir la ubicación";

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

// Stubs external map services: Photon for search, OSM for tiles.
async function stubMapServices(page: Page, photon: { body: unknown } = { body: PHOTON_BODY }) {
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(photon.body),
    }),
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PNG }),
  );
}

// Self-serve admin: /signup → code from the outbox → wizard (persona + company).
async function createAdminCompany(page: Page): Promise<string> {
  const email = `e2e-loc-${stamp()}${E2E_EMAIL_DOMAIN}`;
  const companyName = `${E2E_PREFIX} ${stamp()}`;
  createdEmails.push(email);
  createdCompanyNames.push(companyName);

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  const requestedAt = new Date();
  await page.getByRole("button", { name: "Enviar código", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: CODE_SENT })).toBeVisible();
  const code = await latestCode(email, requestedAt);
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await expect(page.getByRole("heading", { name: "Crear la empresa" })).toBeVisible();
  await page.getByLabel("Nombre completo", { exact: true }).fill("Admin E2E Ubicaciones");
  await page.getByLabel("DNI", { exact: true }).fill(String(randomInt(10_000_000, 99_999_999)));
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Nombre de la empresa", { exact: true }).fill(companyName);
  await page.getByLabel("CUIT de la empresa", { exact: true }).fill(randomCuit());
  await page.getByRole("button", { name: "Crear empresa", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return companyName;
}

// Opens "Nueva ubicación", fills the name and returns the dialog for the caller.
async function openNewLocation(page: Page, name: string) {
  await page.goto("/people/locations");
  await page.getByRole("button", { name: "Nueva ubicación", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Nueva ubicación" })).toBeVisible();
  await dialog.getByLabel("Nombre", { exact: true }).fill(name);
  return dialog;
}

// Reopens the first visible "Editar" trigger (table on desktop, list on phone).
async function reopenLocation(page: Page) {
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Editar ubicación" })).toBeVisible();
  return dialog;
}

// Coordinates are numeric(9,6) in the database: the inputs show e.g. "-38.951600".
async function expectCoords(dialog: Locator, lat: number, lng: number) {
  await expect
    .poll(async () => Number(await dialog.locator("#lat").inputValue()))
    .toBeCloseTo(lat, 6);
  await expect
    .poll(async () => Number(await dialog.locator("#lng").inputValue()))
    .toBeCloseTo(lng, 6);
}

test.describe("location picker", () => {
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

  test("pasted Google Maps link is saved, kept on reopen, and the map renders", async ({
    page,
  }) => {
    await stubMapServices(page);
    await createAdminCompany(page);
    const locationName = `E2E Pegado ${stamp()}`;

    const dialog = await openNewLocation(page, locationName);
    // The map container renders inside the sheet (Leaflet mounts into it).
    await expect(dialog.getByRole("application", { name: MAP_LABEL })).toBeVisible();

    await dialog.getByLabel("Pegar link o coordenadas", { exact: true }).fill(MAPS_LINK);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expectCoords(dialog, MAPS_LAT, MAPS_LNG);
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialog).toBeHidden();

    // Reopen: the saved point is kept, both in the sheet and in the list.
    // The table (desktop) and the list (phone) both render the row; check the visible one.
    await expect(page.getByText(locationName).filter({ visible: true })).toBeVisible();
    const reopened = await reopenLocation(page);
    await expect(reopened.getByLabel("Nombre", { exact: true })).toHaveValue(locationName);
    await expectCoords(reopened, MAPS_LAT, MAPS_LNG);
    await expect(reopened.getByRole("application", { name: MAP_LABEL })).toBeVisible();
  });

  test("place search result fills the coordinates and is kept on reopen", async ({ page }) => {
    await stubMapServices(page);
    await createAdminCompany(page);
    const locationName = `E2E Buscado ${stamp()}`;

    const dialog = await openNewLocation(page, locationName);
    const search = dialog.getByLabel("Buscar lugar", { exact: true });
    await search.fill("Plaza San");

    const result = dialog.getByRole("button", { name: PHOTON_LABEL, exact: true });
    await expect(result).toBeVisible();
    await result.click();
    // The results list closes once a place is picked.
    await expect(result).toBeHidden();
    await expectCoords(dialog, PHOTON_LAT, PHOTON_LNG);

    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialog).toBeHidden();

    const reopened = await reopenLocation(page);
    await expectCoords(reopened, PHOTON_LAT, PHOTON_LNG);
  });
});
