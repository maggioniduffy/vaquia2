import { expect, test, type Page } from "@playwright/test";

// Demo users from scripts/seed.mts.
const PASSWORD = "vaquia-demo";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}

function rgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

test("unauthenticated users are sent to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "Ingresar" })).toBeVisible();
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("hse@petrosur.test");
  await page.getByLabel("Contraseña").fill("wrong-password");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Email o contraseña incorrectos." }),
  ).toBeVisible();
});

test("HSE logs in and sees the office shell of their company", async ({ page }, info) => {
  await login(page, "hse@petrosur.test");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();
  await expect(page.getByTestId("company-name")).toHaveText("Petrosur Servicios SRL");
  await expect(page.getByRole("link", { name: "Registros" })).toBeVisible();

  const dark = info.project.name.endsWith("dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    rgb(dark ? "#0a0a0a" : "#ffffff"),
  );
});

test("supervisor lands on the field shell with a bottom bar", async ({ page }) => {
  await login(page, "supervisor@petrosur.test");
  await expect(page).toHaveURL(/\/field$/);
  const bar = page.getByRole("navigation");
  await expect(bar.getByRole("link")).toHaveCount(4);
  const box = await bar.getByRole("link", { name: "Nuevo" }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
});

test("user with two companies can switch between them", async ({ page }, info) => {
  // Mutates the shared demo user's active company: run in one project only.
  test.skip(info.project.name !== "desktop-light", "stateful; covered once");
  const companies = ["Petrosur Servicios SRL", "Andes Servicios Petroleros SA"];
  await login(page, "admin@vaquia.test");

  const selected = () => page.getByLabel("Empresa").locator("option:checked");
  const current = (await selected().textContent()) ?? "";
  const other = companies.find((c) => c !== current) ?? companies[0]!;

  await page.getByLabel("Empresa").selectOption({ label: other });
  await expect(selected()).toHaveText(other);
  await page.reload();
  await expect(selected()).toHaveText(other);
  await expect(page.getByTestId("company-name")).toHaveCount(0);
});

test("signing out ends the session", async ({ page }) => {
  await login(page, "hse@petrosur.test");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});
