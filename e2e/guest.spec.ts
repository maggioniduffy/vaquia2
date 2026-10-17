import { expect, test, type Page } from "@playwright/test";

// Guest sessions are a temporary demo feature (GUEST_LOGIN_ENABLED;
// guests join the fixed demo company). Each run creates its own anonymous user, so every project can run it.
async function startGuestSession(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar como invitado" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("guest lands on the demo company dashboard and can navigate", async ({ page, isMobile }) => {
  await startGuestSession(page);

  // The company name is in the header on desktop only (hidden md:flex); check the text, not visibility.
  await expect(page.getByTestId("company-name")).toHaveText("Empresa Demo");
  // One membership only: no company switcher.
  await expect(page.getByLabel("Empresa")).toHaveCount(0);

  // Mobile: the nav lives in the menu dialog, so open it first.
  if (isMobile) await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await page.getByRole("link", { name: "Registros" }).click();
  await expect(page).toHaveURL(/\/records/);
});

test("a guest cannot see Petrosur", async ({ page }) => {
  await startGuestSession(page);

  await expect(page.getByTestId("company-name")).toHaveText("Empresa Demo");
  await expect(page.getByText("Petrosur Servicios SRL")).toHaveCount(0);
});
